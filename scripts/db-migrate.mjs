/**
 * db:migrate - applies the migrations in src/db/migrations/ to the database
 * in DATABASE_URL.
 *
 * The migration folder is the source of truth for the schema; db/init.sql is
 * the flat snapshot of the same schema and is never read here.
 *
 * Every migration runs in its own transaction and is recorded in a ledger
 * table, so the script can be run again safely: migrations that are already
 * applied are skipped, and a migration whose file changed after it was
 * applied is an error instead of a silent re-run.
 *
 * A session lock serializes the runs: two of them cannot apply the same
 * migration at the same time.
 *
 * The script refuses to run against a production host. A migration that ran
 * against the wrong database is not undone by a rollback, so the check
 * happens before anything is connected to.
 *
 * TLS follows the connection string: sslmode=require verifies the server
 * certificate, sslmode=no-verify turns that off, and sslrootcert names a CA
 * for a private one.
 */
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const migrationsDir = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'src',
  'db',
  'migrations',
);
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

let url;
try {
  url = new URL(databaseUrl);
} catch {
  console.error('Cannot migrate: the DATABASE_URL is not a valid URL.');
  process.exit(1);
}
if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') {
  console.error(
    `Cannot migrate: the DATABASE_URL scheme is "${url.protocol}" - the runner needs a Postgres connection string (postgresql://), not an HTTP endpoint.`,
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
try {
  client = new pg.Client({ connectionString: databaseUrl });
} catch {
  console.error('Cannot migrate: the DATABASE_URL is not a valid Postgres connection string.');
  process.exit(1);
}
const { host, database } = client.connectionParameters;

/**
 * Why the runner must not connect, or null when it may.
 *
 * The host and the database name are the only parts looked at, and the only
 * parts ever printed - a password never reaches a log.
 */
function refuseReason(host, database) {
  if (/prod|prd/i.test(host)) {
    return { text: `the host "${host}" names a production host`, production: true };
  }
  if (database && /prod|prd/i.test(database)) {
    return { text: `the database "${database}" names a production database`, production: true };
  }
  return null;
}

const refusal = refuseReason(host, database);
if (refusal) {
  console.error(
    `Refusing to migrate: ${refusal.text} (${host}${database ? `/${database}` : ''}).`,
  );
  console.error(
    'This script migrates development databases only. A migration that ran against the wrong\n' +
      'database is not recoverable by a rollback, so it stops here - before it connects to anything.',
  );
  console.error(
    'To migrate production, apply the reviewed migration files by hand:\n' +
      '  psql "$PRODUCTION_DATABASE_URL" -v ON_ERROR_STOP=1 -f src/db/migrations/0000_init.sql',
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

  const files = (await readdir(migrationsDir))
    .filter((file) => file.endsWith('.sql'))
    .sort();
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
