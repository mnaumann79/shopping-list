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
  assertHostIsNotProduction,
  assertLooksLikeSupabase,
  assertScratchDatabase,
  databaseOf,
  dump,
  execute,
  executeFile,
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
  const client = new pg.Client({ connectionString: url });
  return client
    .connect()
    .then(() => fn(client))
    .finally(() => client.end());
}

// 1. The guard. Everything below writes to the target's scratch database.
step("Checking the target");
assertHostIsNotProduction(targetUrl);
assertLooksLikeSupabase(targetUrl);
console.log(`target: ${hostOf(targetUrl)}/${databaseOf(targetUrl)}`);

// 2. The source's shape, read before anything is written.
step("Reading the source");
const legacyOrganizations = query(
  sourceUrl,
  "SELECT id, name FROM organization ORDER BY created_at",
);
const legacyUsers = query(sourceUrl, "SELECT id, name, email FROM \"user\" ORDER BY created_at");
const legacyMembers = query(
  sourceUrl,
  "SELECT organization_id, user_id, role FROM member",
);
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

await withClient(targetUrl, async (client) => {
  await client.query(`DROP DATABASE IF EXISTS "${scratchName}"`);
  await client.query(`CREATE DATABASE "${scratchName}"`);
});

step("Applying the schema, up to but not including the rename");
for (const file of execFileSync("ls", [migrationDir], { encoding: "utf8" })
  .split("\n")
  .filter((name) => name.endsWith(".sql"))
  .sort()) {
  if (file.startsWith(renameMigration)) continue;
  executeFile(scratch, join(migrationDir, file));
  console.log(`applied ${file}`);
}

// 5. The restore — scoped to the shopping list's tables.
step("Restoring the shopping list's tables");
const restored = restoreScoped(scratch, dumpFile);
console.log(`restored ${restored} tables`);

// 6. The mappings. The households get fresh uuids; the users' uuids are the
//    ones GoTrue issued.
//
//    The users are provisioned in the instance's **main** database, where
//    GoTrue owns `auth.users`. The scratch database gets their ids and
//    nothing else: the mapping's foreign keys point at `auth.users`, and the
//    verification joins against it, so the ids have to be there — but GoTrue
//    does not manage the scratch database, and copying the schema over would
//    be the thing §13.2a says never to do.
step("Provisioning the users and building the mappings");
const userMap = [];
const organizationMap = [];

await withClient(targetUrl, async (client) => {
  for (const [oldId, name, email] of legacyUsers) {
    // An account that already exists is reused, not duplicated: the runbook
    // provisions the users, and a rehearsal may be run more than once.
    const existing = await client.query(
      "SELECT id FROM auth.users WHERE email = $1 AND deleted_at IS NULL",
      [email],
    );
    let newId = existing.rows[0]?.id;
    if (!newId) {
      newId = randomUUID();
      await client.query(
        `INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
         VALUES ($1, 'authenticated', 'authenticated', $2, now(), '{}', $3, now(), now())`,
        [newId, email, JSON.stringify({ name })],
      );
    }
    userMap.push([oldId, newId]);
  }
});

await withClient(scratch, async (client) => {
  for (const [oldId, newId] of userMap) {
    await client.query("INSERT INTO auth.users (id) VALUES ($1) ON CONFLICT DO NOTHING", [
      newId,
    ]);
  }

  for (const [oldId, name] of legacyOrganizations) {
    const newId = randomUUID();
    organizationMap.push([oldId, newId]);
    console.log(`household ${name}: ${oldId} → ${newId}`);
  }
});

// The provisioned ids have to be real GoTrue users, not ids that merely look
// right: the mapping writes them into the identity columns, and the
// application will sign them in.
const provisioned = query(
  targetUrl,
  `SELECT count(*) FROM auth.users WHERE id IN (${userMap.map(([, id]) => `'${id}'`).join(", ")})`,
);
if (Number(provisioned[0][0]) !== userMap.length) {
  throw new Error("The provisioned users are not all in auth.users.");
}
console.log(`provisioned ${userMap.length} users`);

// 7. The mapping itself.
step("Running the identity mapping");
const mappingSql = readFileSync(new URL("./mapping.sql", import.meta.url), "utf8")
  .replace("__USER_MAP_VALUES__", userMap.map(([o, n]) => `('${o}', '${n}')`).join(",\n  ") || "('none', '00000000-0000-0000-0000-000000000000')")
  .replace("__ORGANIZATION_MAP_VALUES__", organizationMap.map(([o, n]) => `('${o}', '${n}')`).join(",\n  ") || "('none', '00000000-0000-0000-0000-000000000000')");
execute(scratch, mappingSql);

// 8. The rename migration, which must find the work already done.
step("Applying the rename migration");
for (const file of execFileSync("ls", [migrationDir], { encoding: "utf8" })
  .split("\n")
  .filter((name) => name.endsWith(".sql") && name.startsWith(renameMigration))
  .sort()) {
  executeFile(scratch, join(migrationDir, file));
  console.log(`applied ${file}`);
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
step("Rolling back");
await withClient(targetUrl, async (client) => {
  await client.query(
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1`,
    [scratchName],
  );
  await client.query(`DROP DATABASE IF EXISTS "${scratchName}"`);
});
console.log(`dropped ${scratchName}`);
rmSync(work, { recursive: true, force: true });

if (failed) {
  console.error("\nThe rehearsal found a difference. The runbook needs correcting before the cutover.");
  process.exit(1);
}
console.log("\nThe rehearsal passed.");
