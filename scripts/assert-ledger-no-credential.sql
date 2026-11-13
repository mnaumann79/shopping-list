-- Asserts that the migration ledger on this database holds no credential.
--
-- The ledger is `supabase_migrations.schema_migrations`, and it stores the
-- statement text of every migration that was applied. A migration that sets a
-- password therefore writes that password into the ledger in plain text, and
-- the instance's server log holds it too — a log that cannot be erased. The
-- role's password is the operator's to set, from the dashboard's SQL editor;
-- it never belongs in a migration.
--
-- The check is deliberately narrow: it looks for a *password assignment* —
-- the keyword `password` followed by the literal it assigns — and not for
-- the word "password". The word appears legitimately in migration 0000,
-- which defines the legacy `account` table's own `password` column — a
-- column of the old authentication, not a credential.
--
-- Four spellings of the same thing are covered, because PostgreSQL accepts
-- all of them:
--
--   ALTER ROLE app PASSWORD 'secret'      CREATE ROLE app PASSWORD 'secret'
--   ALTER USER app PASSWORD 'secret'      CREATE USER app PASSWORD 'secret'
--   SET PASSWORD 'secret'
--
-- and three spellings of the literal: the plain quote, the escape-string
-- form `E'secret'`, and the dollar-quoted form `$$secret$$`.
--
-- The literal is what makes the match specific: a role *named*
-- `password_reader` is not a credential, and `password` followed by a quote
-- or a dollar sign is.
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

  -- The name is what a reader recognises, but it is nullable, and an
  -- aggregate over nulls skips them: a matching row with no name would be
  -- dropped, and if every matching row were unnamed the aggregate would be
  -- null — and the check would pass. The version is the fallback.
  SELECT string_agg(
           coalesce(nullif(name, ''), nullif(version, ''), '<unnamed row>'),
           ', ' ORDER BY version
         ) INTO offending
    FROM supabase_migrations.schema_migrations
   WHERE array_to_string(statements, ' ') ~* '(alter|create)[[:space:]]+(role|user)[[:space:]][^;]*password[[:space:]]*(e)?(''|\$)'
      OR array_to_string(statements, ' ') ~* 'set[[:space:]]+password[[:space:]]*(e)?(''|\$)';

  IF offending IS NOT NULL THEN
    RAISE EXCEPTION
      'the migration ledger holds a password statement in: %. Those rows carry a credential in plain text, and the instance log holds it too — which cannot be erased. Rotate the credential, remove the row (its statement has already run), and set the password outside the migration mechanism.',
      offending;
  END IF;
END
$$;
