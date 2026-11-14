// The pieces the cutover scripts share: the guard, the table lists, and the
// two ways of running a statement.
//
// The guard is the important one. These scripts move data, and the runbook
// says the rehearsal runs against the development instance and a scratch
// database — never against production. So the guard refuses a target that
// does not look like a Supabase instance, refuses a target in the Neon
// production host family outright, and refuses to write to any database whose
// name is not a rehearsal scratch database.
//
// Two kinds of client read the connection string, and they have to agree on
// what it means: the libpq programs (psql, pg_dump, pg_restore) and the
// driver (node-postgres). The URL helpers below are what make them agree.

import { execFileSync, spawnSync } from "node:child_process";

/**
 * Better Auth's tables, present for the rollback window, and the
 * application's own tables. These are the tables the restore is scoped to.
 *
 * The order is the order the foreign keys allow: every table is restored
 * after the ones it points at. The restore is one `pg_restore` per table, so
 * the order is the order of this list — and a table restored before the one
 * it points at fails its foreign key as soon as it holds a row.
 */
export const RESTORED_TABLES = [
  // Better Auth's, present until the rollback window closes
  "user",
  "organization",
  "member",
  "session",
  "account",
  "verification",
  "invitation",
  // the application's own
  "categories",
  "stores",
  "items",
  "household_join_links",
  "item_stores",
];

/**
 * The tables the identity mapping creates. They are not restored: the mapping
 * builds them from the legacy rows.
 */
export const MAPPED_TABLES = [
  "households",
  "household_members",
  "household_invitations",
  "sync_changes",
  "sync_operations",
  "devices",
  "household_sync_state",
  "entity_conflicts",
];

const NEON_HOST = /(^|\.)neon\.(tech|build|com)$/;

export function hostOf(url) {
  return new URL(url).hostname;
}

export function databaseOf(url) {
  const name = new URL(url).pathname.replace(/^\//, "");
  if (!name) throw new Error(`The URL has no database name: ${url}`);
  return name;
}

/**
 * The guard for a connection these scripts open. The production host family
 * is refused outright: these scripts move data, and the only instance they
 * may touch is the development one.
 */
export function assertHostIsNotProduction(url) {
  const host = hostOf(url);
  if (NEON_HOST.test(host)) {
    throw new Error(
      `Refusing to run against ${host}: that is the Neon production host family. ` +
        `These scripts move data and may only touch the development instance.`,
    );
  }
  return host;
}

/**
 * The guard for the database these scripts write to. Only a scratch database
 * is a scratch database by name, and the name is what makes the rule
 * checkable by a reader.
 */
export function assertScratchDatabase(url, scratchPrefix = "cutover_rehearsal_") {
  assertHostIsNotProduction(url);
  const database = databaseOf(url);

  if (!database.startsWith(scratchPrefix)) {
    throw new Error(
      `Refusing to write to the database "${database}": these scripts only write ` +
        `to a scratch database whose name starts with "${scratchPrefix}".`,
    );
  }

  return database;
}

/**
 * A Supabase instance is one that has GoTrue's schema. The rehearsal writes to
 * it, so it has to be one — a plain PostgreSQL would accept the data and
 * silently lose the identities.
 */
export function assertLooksLikeSupabase(targetUrl) {
  const rows = query(
    targetUrl,
    "SELECT count(*) FROM pg_namespace WHERE nspname = 'auth'",
  );
  // query() returns the rows as arrays -- psql's unaligned output, split on
  // the column separator -- so the count is the first column of the first
  // row. Reading a `.count` property off it gave undefined, and undefined
  // is not zero, so the guard never refused anything.
  if (Number(rows[0][0]) === 0) {
    throw new Error(
      "Refusing to run: the target has no `auth` schema, so it is not a Supabase " +
        "instance. The mapping writes identities that only GoTrue's users can hold.",
    );
  }
}

/**
 * The URL as libpq understands it.
 *
 * psql, pg_dump and pg_restore are libpq programs, and libpq refuses a URI
 * that carries a parameter it does not know: "invalid URI query parameter".
 * `uselibpqcompat` is the driver's own switch — it tells node-postgres to
 * read `sslmode` the way libpq does — and psql knows nothing about it. So
 * the parameter comes off for the libpq programs and stays in the URL the
 * driver is given.
 *
 * The URL itself is the operator's decision, and the scripts do not weaken
 * it. `sslmode` means what it says to the client that reads it: libpq's
 * `require` encrypts the connection and does not verify the certificate,
 * and node-postgres' `require` verifies it — which the pooler's own
 * certificate does not pass, because it is signed by Supabase's CA rather
 * than by one in the public trust store. A URL that verifies the pooler
 * names the CA: `sslmode=verify-full&sslrootcert=/path/to/supabase-ca.pem`,
 * and both the driver and the libpq programs read it.
 */
export function libpqUrl(url) {
  const parsed = new URL(url);
  parsed.searchParams.delete("uselibpqcompat");
  return parsed.toString();
}

/** Runs a statement and returns its rows. */
export function query(url, sql) {
  const output = execFileSync(
    "psql",
    [libpqUrl(url), "-v", "ON_ERROR_STOP=1", "-tAc", sql],
    { encoding: "utf8" },
  );
  return output
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => line.split("|"));
}

/** Runs a statement for its effect. */
export function execute(url, sql, extraArgs = []) {
  execFileSync("psql", [libpqUrl(url), "-v", "ON_ERROR_STOP=1", ...extraArgs], {
    encoding: "utf8",
    input: sql,
  });
}

/**
 * Applies a migration file, and returns the statements it could not run.
 *
 * Two of the migrations grant a role to another role: the app role inherits
 * `authenticated`, and the migration role may assume the app role. Both are
 * properties of the *instance* rather than of a database, the instance
 * already has both, and a role that may create a scratch database may not
 * administer the instance's roles — PostgreSQL refuses those two statements
 * with "permission denied to grant role".
 *
 * So the file is applied with the errors allowed to be, the errors are read
 * back, and every one of them has to be a refusal of that kind. Anything
 * else fails the run.
 */
export function applyMigration(url, file) {
  const result = spawnSync(
    "psql",
    [libpqUrl(url), "-v", "ON_ERROR_STOP=0", "-f", file],
    { encoding: "utf8" },
  );
  const errors = (result.stderr || "")
    .split("\n")
    .filter((line) => line.includes("ERROR:"));
  const refused = errors.filter((line) => line.includes("permission denied to grant role"));
  if (errors.length !== refused.length) {
    throw new Error(`${file} failed:\n${result.stderr || result.stdout}`);
  }
  // psql exits 1 when a statement failed and 2 when the connection to the
  // server went away (psql(1)). The refusal above is a statement that
  // failed, so it comes with status 1; every other status is the process
  // failing rather than a statement, and the migration is not applied.
  if (result.status !== 0 && !(result.status === 1 && refused.length > 0)) {
    throw new Error(`${file} could not be applied: ${result.stderr || result.stdout}`);
  }
  // psql names the file it read, and the path is the one of the machine that
  // ran it. The name and the line are what the reader needs.
  return refused.map((line) =>
    line.replace(/^psql:.*[\\/]([^\\/]+):(\d+): ERROR:\s*/, "$1:$2: ").trim(),
  );
}

/** Runs pg_dump and returns the dump file's path. */
export function dump(sourceUrl, file) {
  execFileSync(
    "pg_dump",
    ["--dbname", libpqUrl(sourceUrl), "--format=custom", "--file", file],
    { encoding: "utf8" },
  );
  return file;
}

/**
 * Restores the shopping list's tables, and nothing else. The dump may be
 * whole-database; the restore may not — the instance's `public` schema holds
 * another application's tables, and the instance runs storage, realtime,
 * graphql and vault, none of which is ours to replace.
 */
export function restoreScoped(targetUrl, file) {
  for (const table of RESTORED_TABLES) {
    execFileSync(
      "pg_restore",
      ["--dbname", libpqUrl(targetUrl), "--data-only", "--table", table, file],
      { encoding: "utf8" },
    );
  }
  return RESTORED_TABLES.length;
}
