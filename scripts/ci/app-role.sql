-- Gives the application's non-owner role a password, and checks that it is
-- fit to be the role the application connects as.
--
-- The role itself is created by the migrations (P0S-T04): it owns no table, so
-- the row-level security policies apply to it. That is the whole point of the
-- integration test — a query run as the table owner bypasses every policy.
--
-- The password below is a throwaway for the local stack in CI. It is not a
-- credential: the database it belongs to is a container that exists for the
-- length of one job.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app') THEN
    RAISE EXCEPTION 'the migrations did not create the app role';
  END IF;

  ALTER ROLE app WITH LOGIN PASSWORD 'app';

  -- The policies key on auth.uid(), which lives in the `auth` schema. That
  -- schema belongs to supabase_admin, so the migrations cannot grant on it
  -- directly — the grant is refused with a warning and grants nothing. The
  -- role membership is what works, and this check makes the job fail when it
  -- is missing instead of failing later, at runtime, on every request.
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
END
$$;
