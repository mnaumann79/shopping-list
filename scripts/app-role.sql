-- Asserts that the `app` role on this database is fit to be the role the
-- application connects as.
--
-- The role itself is created by the migrations (P0S-T04): it owns no table,
-- so the row-level security policies apply to it. That is the whole point of
-- the integration test — a query run as the table owner bypasses every
-- policy.
--
-- This file only reads. It never changes the role, so it can be run against
-- an instance — the development one, or the one that will receive the
-- cutover — where the app role's password is a real credential and must not
-- be overwritten. The CI needs one thing more than that: it also has to give
-- the role a password, and that part lives in scripts/ci/app-role.sql.
--
-- psql exits non-zero when a statement raises an exception, so a failed
-- assertion fails the command:
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/app-role.sql
--
-- The connection has to be one that may read the catalogs and ask about
-- another role's privileges: the owner's, or a superuser's.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app') THEN
    RAISE EXCEPTION 'the migrations did not create the app role';
  END IF;

  -- The policies key on auth.uid(), which lives in the `auth` schema. That
  -- schema belongs to supabase_admin, so the migrations do not grant on it:
  -- their guard is the schema's ownership, and on an instance it is not
  -- theirs. A grant issued by hand is accepted — the statement succeeds, and
  -- PostgreSQL declines the grant in a warning, `no privileges were granted
  -- for "auth"` — and it grants nothing. The role membership is what works,
  -- and this check makes the job fail when it is missing instead of failing
  -- later, at runtime, on every request. The account is in
  -- db/migrations/0008_auth_schema_grant_account.sql.
  IF NOT has_function_privilege('app', 'auth.uid()', 'EXECUTE') THEN
    RAISE EXCEPTION
      'the app role cannot execute auth.uid() — the policies would fail with "permission denied for schema auth"';
  END IF;

  IF NOT has_schema_privilege('app', 'auth', 'USAGE') THEN
    RAISE EXCEPTION
      'the app role has no USAGE on the auth schema — the policies would fail with "permission denied for schema auth"';
  END IF;

  -- An owner bypasses row-level security unless the table says FORCE, and a
  -- role with BYPASSRLS always does. Either one would make the integration
  -- test prove nothing.
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app' AND rolbypassrls) THEN
    RAISE EXCEPTION 'the app role has BYPASSRLS — it would bypass every policy';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM pg_class c
      JOIN pg_roles r ON r.oid = c.relowner
     WHERE r.rolname = 'app'
       AND c.relkind = 'r'
       AND c.relnamespace = 'public'::regnamespace
  ) THEN
    RAISE EXCEPTION 'the app role owns a table in public — an owner bypasses row-level security';
  END IF;

  -- The role has to be able to log in at all: the application connects as it.
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app' AND rolcanlogin) THEN
    RAISE EXCEPTION 'the app role cannot log in — the application connects as it';
  END IF;

  -- The transitional sign-in reads the legacy password hash through this
  -- role, so the legacy tables have to be readable by it. The grant that
  -- makes them readable is the one in migration 0005, and it lands on the
  -- tables that 0000 created.
  IF NOT has_table_privilege('app', 'public."user"', 'SELECT')
     OR NOT has_table_privilege('app', 'public."account"', 'SELECT') THEN
    RAISE EXCEPTION
      'the app role cannot read the legacy tables (public.user, public.account) — the transitional sign-in reads the hash through it';
  END IF;
END
$$;
