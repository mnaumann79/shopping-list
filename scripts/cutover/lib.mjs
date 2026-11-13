// The pieces the cutover scripts share: the guard, the table lists, and the
// two ways of running a statement.
//
// The guard is the important one. These scripts move data, and the runbook
// says the rehearsal runs against the development instance and a scratch
// database — never against production. So the guard refuses a target that
// does not look like a Supabase instance, refuses a target in the Neon
// production host family outright, and refuses to write to any database whose
// name is not a rehearsal scratch database.

import { execFileSync } from "node:child_process";

/**
 * Better Auth's tables, present for the rollback window, and the
 * application's own tables. These are the tables the restore is scoped to.
 */
export const RESTORED_TABLES = [
  // Better Auth's, present until the rollback window closes
  "user",
  "session",
  "account",
  "verification",
  "organization",
  "member",
  "invitation",
  // the application's own
  "items",
  "categories",
  "stores",
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
  if (Number(rows[0].count) === 0) {
    throw new Error(
      "Refusing to run: the target has no `auth` schema, so it is not a Supabase " +
        "instance. The mapping writes identities that only GoTrue's users can hold.",
    );
  }
}

/** Runs a statement and returns its rows. */
export function query(url, sql) {
  const output = execFileSync(
    "psql",
    [url, "-v", "ON_ERROR_STOP=1", "-tAc", sql],
    { encoding: "utf8" },
  );
  return output
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => line.split("|"));
}

/** Runs a statement for its effect. */
export function execute(url, sql, extraArgs = []) {
  execFileSync("psql", [url, "-v", "ON_ERROR_STOP=1", ...extraArgs], {
    encoding: "utf8",
    input: sql,
  });
}

/** Runs a SQL file for its effect. */
export function executeFile(url, file, extraArgs = []) {
  execFileSync("psql", [url, "-v", "ON_ERROR_STOP=1", ...extraArgs, "-f", file], {
    encoding: "utf8",
  });
}

/** Runs pg_dump and returns the dump file's path. */
export function dump(sourceUrl, file) {
  execFileSync(
    "pg_dump",
    ["--dbname", sourceUrl, "--format=custom", "--file", file],
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
      ["--dbname", targetUrl, "--data-only", "--table", table, file],
      { encoding: "utf8" },
    );
  }
  return RESTORED_TABLES.length;
}
