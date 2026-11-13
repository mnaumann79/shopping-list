/**
 * db:migrate - applies the migrations in db/migrations/ to the database
 * in DATABASE_URL.
 *
 * The migration folder is the source of truth for the schema; db/init.sql is
 * the flat snapshot of the same schema and is never read here. The folder is
 * not drizzle-kit's output folder (src/db/migrations/) - drizzle-kit would
 * overwrite a hand-written migration with its own 0000_*.sql and orphan the
 * rest.
 *
 * Every migration runs in its own transaction and is recorded in a ledger
 * table, so the script can be run again safely: migrations that are already
 * applied are skipped, and a migration whose file changed after it was
 * applied is an error instead of a silent re-run.
 *
 * A session lock serializes the runs: two of them cannot apply the same
 * migration at the same time.
 *
 * The script refuses to run against anything that is not a development host.
 * A migration that ran against the wrong database is not undone by a rollback,
 * so the check happens before anything is connected to.
 *
 * TLS follows the connection string: sslmode=require verifies the server
 * certificate, sslmode=no-verify turns that off, and sslrootcert names a CA
 * for a private one. With uselibpqcompat=true the driver follows libpq
 * instead: sslmode=require then checks the certificate chain without the
 * hostname, and sslmode=no-verify does not turn the verification off.
 *
 * The connection has to be a direct or a session-pooled one. A transaction-
 * pooled endpoint can route the advisory lock and the migration statements
 * to different backends, and the lock would not serialize them.
 */
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { isDevelopmentHost } from './local-host.mjs';

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'db', 'migrations');
const ledgerSchema = 'db_migrate';
const ledgerTable = 'applied';
// One lock for all migration runs against one database. A session-level
// lock, so it survives the COMMIT at the end of every migration.
const lockKey = 874512301;

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error(
    'DATABASE_URL is not set. Point it at the database to migrate, e.g.\n' +
      '  DATABASE_URL=postgresql://postgres:postgres@localhost:5432/shopping_list node scripts/db-migrate.mjs',
  );
  process.exit(1);
}

// The scheme is read with a regex rather than with `new URL`: a Postgres
// socket URL has an empty authority - postgresql://user@/dbname?host=/var/run/postgresql
// - which the WHATWG parser rejects before pg ever gets to see it. pg parses
// the connection string itself, so the driver is what validates it.
const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(databaseUrl)?.[1]?.toLowerCase();
if (!scheme) {
  console.error('Cannot migrate: the DATABASE_URL is not a Postgres connection string.');
  process.exit(1);
}
if (scheme !== 'postgresql' && scheme !== 'postgres') {
  console.error(
    `Cannot migrate: the DATABASE_URL scheme is "${scheme}" - the runner needs a Postgres connection string (postgresql://), not an HTTP endpoint.`,
  );
  console.error(
    'The runner applies SQL over a Postgres connection, so it needs a connection string\n' +
      'like postgresql://user:password@host:5432/database.',
  );
  process.exit(1);
}

/**
 * The connection the driver would really use.
 *
 * pg parses the connection string itself: a `host` query parameter wins over
 * the host in the URL, and PGHOST/PGDATABASE fill in what the URL leaves out.
 * Asking the driver is what makes the check below look at the database the
 * runner would actually connect to, and not at the one the URL appears to
 * name. Nothing is connected here - the parameters are read off the client
 * before it connects.
 */
let client;
let host;
let database;
try {
  client = new pg.Client({ connectionString: databaseUrl });
  ({ host, database } = client.connectionParameters);
} catch {
  console.error('Cannot migrate: the DATABASE_URL is not a valid Postgres connection string.');
  process.exit(1);
}

/** The operator's explicit opt-in: migrate a host that is not on the allowlist. */
function optedIn() {
  const value = (process.env.DB_MIGRATE_ALLOW_ANY_HOST ?? '').trim().toLowerCase();
  return value === '1' || value === 'true' || value === 'yes';
}

// The migration files are read before the guard, so the refusal can name every
// one of them: migrating production by hand with only the first file would
// leave the database half migrated.
const files = (await readdir(migrationsDir))
  .filter((file) => file.endsWith('.sql'))
  .sort();

if (!isDevelopmentHost(host) && !optedIn()) {
  console.error(
    `Refusing to migrate: the host "${host}" is not a development host (${host}${database ? `/${database}` : ''}).`,
  );
  console.error(
    'This script migrates development databases only. A migration that ran against the wrong\n' +
      'database is not recoverable by a rollback, so it stops here - before it connects to anything.',
  );
  console.error(
    'Allowed hosts: localhost, 127.0.0.1, ::1, and anything ending in .local or .localhost.\n' +
      'To migrate another host on purpose, set DB_MIGRATE_ALLOW_ANY_HOST=1.',
  );
  console.error(
    'To migrate production, apply the reviewed migration files by hand, in this order:\n' +
      files
        .map((file) => `  psql "$PRODUCTION_DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrations/${file}`)
        .join('\n'),
  );
  process.exit(1);
}

console.log(`Migrating ${host}${database ? `/${database}` : ''}`);

try {
  await client.connect();
  // Before the ledger is created or read: a second run waits here instead of
  // applying a migration the first one is already applying.
  await client.query(`SELECT pg_advisory_lock(${lockKey})`);

  await client.query(`CREATE SCHEMA IF NOT EXISTS "${ledgerSchema}"`);
  await client.query(
    `CREATE TABLE IF NOT EXISTS "${ledgerSchema}"."${ledgerTable}" (` +
      '"name" text PRIMARY KEY, "checksum" text NOT NULL, "applied_at" timestamptz NOT NULL DEFAULT now())',
  );

  const { rows } = await client.query(
    `SELECT "name", "checksum" FROM "${ledgerSchema}"."${ledgerTable}"`,
  );
  const applied = new Map(rows.map((row) => [row.name, row.checksum]));

  if (files.length === 0) {
    console.log('No migrations found.');
  }

  for (const file of files) {
    const sql = await readFile(join(migrationsDir, file), 'utf8');
    const checksum = createHash('sha256').update(sql).digest('hex');

    if (applied.has(file)) {
      if (applied.get(file) !== checksum) {
        console.error(
          `\n${file} changed after it was applied. The database has the version that was\n` +
            'applied, the file has a different one - the ledger cannot say which is right.\n' +
            'Restore the applied file and write a new migration for the change.',
        );
        process.exitCode = 1;
        break;
      }
      console.log(`skip   ${file}`);
      continue;
    }

    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query(
        `INSERT INTO "${ledgerSchema}"."${ledgerTable}" ("name","checksum") VALUES ($1,$2)`,
        [file, checksum],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
    console.log(`apply  ${file}`);
  }
} catch (error) {
  console.error(`\nMigration failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  // The lock is released here and by the server when the session ends, so a
  // crashed run does not block the next one.
  await client.query(`SELECT pg_advisory_unlock(${lockKey})`).catch(() => {});
  await client.end();
}
