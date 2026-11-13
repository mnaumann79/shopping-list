-- Gives the application's non-owner role a password, so the integration job
-- can connect as it.
--
-- The role itself is created by the migrations (P0S-T04): it owns no table, so
-- the row-level security policies apply to it. That is the whole point of the
-- integration test — a query run as the table owner bypasses every policy.
--
-- The password below is a throwaway for the local stack in CI. It is not a
-- credential: the database it belongs to is a container that exists for the
-- length of one job.
--
-- The role is looked up rather than assumed: if the migrations stop creating
-- it, this fails loudly instead of quietly connecting as the owner.

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
END
$$;
