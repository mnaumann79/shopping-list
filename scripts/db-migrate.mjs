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
 * The script refuses to run against a production host. A migration that ran
 * against the wrong database is not undone by a rollback, so the check
 * happens before anything is connected to.
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

/**
 * Why DATABASE_URL must not be used, or null when it may be.
 *
 * The host and the database name are the only parts looked at, and the only
 * parts ever printed - a password never reaches a log.
 */
function refuseReason(databaseUrl) {
  let url;
  try {
    url = new URL(databaseUrl);
  } catch {
    return { text: 'the DATABASE_URL is not a valid URL', production: false };
  }
  if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') {
    return {
      text: `the DATABASE_URL scheme is "${url.protocol}" - the runner needs a Postgres connection string (postgresql://), not an HTTP endpoint`,
      production: false,
    };
  }
  const host = url.hostname;
  const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (/prod|prd/i.test(host)) {
    return { text: `the host "${host}" names a production host`, production: true };
  }
  if (database && /prod|prd/i.test(database)) {
    return { text: `the database "${database}" names a production database`, production: true };
  }
  return null;
}

/** The target without its password, for the messages. */
function describeTarget(databaseUrl) {
  try {
    const url = new URL(databaseUrl);
    const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
    return `${url.hostname}${database ? `/${database}` : ''}`;
  } catch {
    return 'the DATABASE_URL';
  }
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error(
    'DATABASE_URL is not set. Point it at the database to migrate, e.g.\n' +
      '  DATABASE_URL=postgresql://postgres:postgres@localhost:5432/shopping_list node scripts/db-migrate.mjs',
  );
  process.exit(1);
}

const refusal = refuseReason(databaseUrl);
if (refusal) {
  if (refusal.production) {
    console.error(`Refusing to migrate: ${refusal.text} (${describeTarget(databaseUrl)}).`);
    console.error(
      'This script migrates development databases only. A migration that ran against the wrong\n' +
        'database is not recoverable by a rollback, so it stops here - before it connects to anything.',
    );
    console.error(
      'To migrate production, apply the reviewed migration files by hand:\n' +
        '  psql "$PRODUCTION_DATABASE_URL" -v ON_ERROR_STOP=1 -f src/db/migrations/0000_init.sql',
    );
  } else {
    console.error(`Cannot migrate: ${refusal.text} (${describeTarget(databaseUrl)}).`);
    console.error(
      'The runner applies SQL over a Postgres connection, so it needs a connection string\n' +
        'like postgresql://user:password@host:5432/database.',
    );
  }
  process.exit(1);
}

const poolConfig = { connectionString: databaseUrl, max: 1 };
// libpq's sslmode=require encrypts the connection without verifying the
// certificate chain; node-postgres verifies it by default.
if (/[?&]sslmode=require/i.test(databaseUrl)) {
  poolConfig.ssl = { rejectUnauthorized: false };
}

console.log(`Migrating ${describeTarget(databaseUrl)}`);

const pool = new pg.Pool(poolConfig);
const client = await pool.connect();
try {
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
        `INSERT INTO "${ledgerSchema}"."${ledgerTable}" ("name", "checksum") VALUES ($1, $2)`,
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
  client.release();
  await pool.end();
}
