-- Asserts that the migration ledger on this database holds no credential.
--
-- The ledger is `supabase_migrations.schema_migrations`, and it stores the
-- statement text of every migration that was applied. A migration that sets a
-- password therefore writes that password into the ledger in plain text, and
-- the instance's server log holds it too — a log that cannot be erased. The
-- role's password is the operator's to set, from the dashboard's SQL editor;
-- it never belongs in a migration.
--
-- The check is deliberately narrow: it looks for a *password assignment*,
-- not for the word "password". The word appears legitimately in migration
-- 0000, which defines the legacy `account` table's own `password` column —
-- a column of the old authentication, not a credential.
--
-- It is read-only, and it only makes sense on an instance: a database built
-- by `scripts/db-migrate.mjs` has its own ledger (`db_migrate.applied`),
-- which records the file name and a checksum and never the statement.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/assert-ledger-no-credential.sql

DO $$
DECLARE
  offending text;
  ledger regclass := to_regclass('supabase_migrations.schema_migrations');
BEGIN
  IF ledger IS NULL THEN
    RAISE NOTICE 'this database has no supabase_migrations ledger, so nothing can hold a credential';
    RETURN;
  END IF;

  SELECT string_agg(name, ', ' ORDER BY version) INTO offending
    FROM supabase_migrations.schema_migrations
   WHERE array_to_string(statements, ' ') ~* '(alter|create)[[:space:]]+role[^;]*password'
      OR array_to_string(statements, ' ') ~* 'set[[:space:]]+password';

  IF offending IS NOT NULL THEN
    RAISE EXCEPTION
      'the migration ledger holds a password statement in: %. Those rows carry a credential in plain text, and the instance log holds it too — which cannot be erased. Rotate the credential, delete the rows, and set the password outside the migration mechanism.',
      offending;
  END IF;
END
$$;
