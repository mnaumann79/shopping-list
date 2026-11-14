#!/usr/bin/env node
// The cutover rehearsal: §13.2a's steps 3 and 4, executed end to end.
//
// It dumps a legacy-shaped source, restores it into a scratch database on the
// target instance, runs the identity mapping, verifies it, compares the row
// counts table by table, and then rolls back by dropping the scratch
// database. Nothing outside the scratch database is written, and the guard
// refuses a target that is not a Supabase instance.
//
// The source is a database that still holds the legacy shape — Better Auth's
// tables and `organization_id` columns. At the real cutover that source is
// Neon; in a rehearsal it is a scratch database built the same way.
//
// Usage:
//   node scripts/cutover/rehearse.mjs --source <url> --target <url>
//
// The target's credentials are in the URL; nothing is read from the
// environment, and nothing is written to the repository.

import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pg from "pg";
import {
  applyMigration,
  assertHostIsNotProduction,
  assertLooksLikeSupabase,
  assertScratchDatabase,
  databaseOf,
  dump,
  driverUrl,
  execute,
  hostOf,
  query,
  restoreScoped,
} from "./lib.mjs";

const args = process.argv.slice(2);
function arg(name, fallback) {
  const index = args.indexOf(`--${name}`);
  if (index === -1) {
    if (fallback !== undefined) return fallback;
    throw new Error(`--${name} is required`);
  }
  return args[index + 1];
}

const sourceUrl = arg("source");
const targetUrl = arg("target");
const scratchName = arg("scratch", `cutover_rehearsal_${Date.now()}`);

const migrationDir = new URL("../../db/migrations/", import.meta.url).pathname;
const renameMigration = "0004_";

const work = mkdtempSync(join(tmpdir(), "cutover-"));
const dumpFile = join(work, "source.dump");

function step(message) {
  console.log(`\n== ${message}`);
}

function withClient(url, fn) {
  const client = new pg.Client({ connectionString: driverUrl(url) });
  return client
    .connect()
    .then(() => fn(client))
    .finally(() => client.end());
}

/**
 * The migrations, in the order the cutover applies them: the schema up to but
 * not including the rename, then the rename and the rest. The rename has to
 * come after the mapping — it has to find the mapping's work already done —
 * and the migrations that follow it are written for the renamed schema.
 */
const migrationFiles = execFileSync("ls", [migrationDir], { encoding: "utf8" })
  .split("\n")
  .filter((name) => name.endsWith(".sql"))
  .sort();
const renameIndex = migrationFiles.findIndex((name) => name.startsWith(renameMigration));
if (renameIndex === -1) {
  throw new Error(`The migrations folder has no ${renameMigration} migration.`);
}
const beforeRename = migrationFiles.slice(0, renameIndex);
const fromRename = migrationFiles.slice(renameIndex);

// 1. The guard. Everything below writes to the target's scratch database.
step("Checking the target");
assertHostIsNotProduction(targetUrl);
assertLooksLikeSupabase(targetUrl);
console.log(`target: ${hostOf(targetUrl)}/${databaseOf(targetUrl)}`);

// 2. The source's shape, read before anything is written.
step("Reading the source");
const legacyOrganizations = query(sourceUrl, "SELECT id FROM organization ORDER BY created_at");
const legacyUsers = query(sourceUrl, 'SELECT id FROM "user" ORDER BY created_at');
const legacyMembers = query(sourceUrl, "SELECT id FROM member");
console.log(
  `source: ${legacyOrganizations.length} organizations, ${legacyUsers.length} users, ${legacyMembers.length} memberships`,
);

// 3. The dump.
step("Dumping the source");
dump(sourceUrl, dumpFile);
console.log(`dump: ${dumpFile}`);

// 4. The scratch database, with the schema as it stands before the rename.
step("Creating the scratch database");
const scratchUrl = new URL(targetUrl);
scratchUrl.pathname = `/${scratchName}`;
const scratch = scratchUrl.toString();
assertScratchDatabase(scratch);
console.log(`scratch: ${scratchName}`);

await withClient(targetUrl, async (client) => {
  await client.query(`DROP DATABASE IF EXISTS "${scratchName}" WITH (FORCE)`);
  await client.query(`CREATE DATABASE "${scratchName}"`);
});

step("Applying the schema, up to but not including the rename");
for (const file of beforeRename) {
  const refused = applyMigration(scratch, join(migrationDir, file));
  console.log(`applied ${file}`);
  for (const line of refused) console.log(`  refused: ${line.trim()}`);
}

// 5. The restore — scoped to the shopping list's tables.
step("Restoring the shopping list's tables");
const restored = restoreScoped(scratch, dumpFile);
console.log(`restored ${restored} tables`);

// 6. The identities. The households get fresh uuids; the users get uuids of
//    their own, issued here.
//
//    The users' uuids are GoTrue's at the cutover: §13.2a step 2 provisions
//    the accounts and records the ids in `user_map`. GoTrue owns
//    `auth.users` in the instance's main database, and a rehearsal may not
//    write there — the table is behind the admin API, and the instance has
//    to be as it was when the run is over. So the rehearsal issues the ids
//    itself and puts them in the scratch database, where GoTrue does not
//    manage anything and the mapping's foreign keys point.
//
//    The household names are not printed. The rehearsal's output is attached
//    to a pull request, and this repository is public: a count says what the
//    rehearsal did without naming a household. The ids are in the mapping
//    table, which is what the cutover needs.
step("Issuing the identities");
const userMap = [];
const organizationMap = [];

await withClient(scratch, async (client) => {
  for (const [oldId] of legacyUsers) {
    const newId = randomUUID();
    userMap.push([oldId, newId]);
    await client.query("INSERT INTO auth.users (id) VALUES ($1) ON CONFLICT DO NOTHING", [
      newId,
    ]);
  }

  for (const [oldId] of legacyOrganizations) {
    organizationMap.push([oldId, randomUUID()]);
  }
});
console.log(`mapped ${organizationMap.length} households and ${userMap.length} users`);

// 7. The mapping itself.
step("Running the identity mapping");
const mappingSql = readFileSync(new URL("./mapping.sql", import.meta.url), "utf8")
  .replace("__USER_MAP_VALUES__", userMap.map(([o, n]) => `('${o}', '${n}')`).join(",\n  ") || "('none', '00000000-0000-0000-0000-000000000000')")
  .replace("__ORGANIZATION_MAP_VALUES__", organizationMap.map(([o, n]) => `('${o}', '${n}')`).join(",\n  ") || "('none', '00000000-0000-0000-0000-000000000000')");
execute(scratch, mappingSql);

// 8. The rename migration, which must find the work already done, and the
//    migrations that follow it.
step("Applying the rename migration and the rest");
for (const file of fromRename) {
  const refused = applyMigration(scratch, join(migrationDir, file));
  console.log(`applied ${file}`);
  for (const line of refused) console.log(`  refused: ${line.trim()}`);
}

// 9. The verification.
step("Verifying");
const verification = query(scratch, readFileSync(new URL("./verify.sql", import.meta.url), "utf8"));
let failed = false;
for (const [check, value] of verification) {
  const orphan = check.endsWith(".orphans") || check.endsWith("identity_orphans");
  const bad = orphan && Number(value) !== 0;
  if (bad) failed = true;
  console.log(`${bad ? "FAIL" : "ok  "}  ${check}: ${value}`);
}

// 10. The row counts, source against target.
step("Comparing the row counts");
const counts = {
  items: "items",
  categories: "categories",
  stores: "stores",
  household_join_links: "household_join_links",
  item_stores: "item_stores",
  user: '"user"',
};
for (const [label, table] of Object.entries(counts)) {
  const source = Number(query(sourceUrl, `SELECT count(*) FROM ${table}`)[0][0]);
  const target = Number(query(scratch, `SELECT count(*) FROM ${table}`)[0][0]);
  const bad = source !== target;
  if (bad) failed = true;
  console.log(`${bad ? "FAIL" : "ok  "}  ${label}: source ${source}, target ${target}`);
}

// 11. The rollback.
//
//     The pooler keeps a connection to every database it has served, and it
//     hands the connection back when the client is gone — so the scratch
//     database still has a session attached to it, and a plain drop is
//     refused with "database is being accessed by other users". `WITH
//     (FORCE)` terminates the sessions and drops the database in one
//     statement, and there is no window between the two for the pooler to
//     open another connection in.
step("Rolling back");
await withClient(targetUrl, async (client) => {
  await client.query(`DROP DATABASE IF EXISTS "${scratchName}" WITH (FORCE)`);
});
console.log(`dropped ${scratchName}`);
rmSync(work, { recursive: true, force: true });

if (failed) {
  console.error("\nThe rehearsal found a difference. The runbook needs correcting before the cutover.");
  process.exit(1);
}
console.log("\nThe rehearsal passed.");
