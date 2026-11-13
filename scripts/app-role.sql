-- Asserts that a role is fit to be the role the application connects as.
--
-- The subject is the role the assertions are made about. It is read from the
-- session setting `shopping_list.role`, and it defaults to `app`:
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/app-role.sql
--
-- The check at the door (scripts/assert-connection-role.mjs) sets the same
-- setting to the role the application's own connection authenticated as, and
-- runs this file against it. One set of assertions, two subjects: the role
-- the migrations create, and the role the application actually connects as.
--
-- This file only reads. It never changes the role, so it can be run against
-- an instance — the development one, or the one that will receive the
-- cutover — where the app role's password is a real credential and must not
-- be overwritten. The CI needs one thing more than that: it also has to give
-- the role a password, and that part lives in scripts/ci/app-role.sql.
--
-- psql exits non-zero when a statement raises an exception, so a failed
-- assertion fails the command. The exception carries a SQLSTATE of its own:
-- PRIV1 when the role is privileged, which is the finding the check at the
-- door treats differently from the others.
--
-- The connection has to be one that may read the catalogs and ask about
-- another role's privileges: the owner's, or a superuser's.

DO $$
DECLARE
  subject text := coalesce(current_setting('shopping_list.role', true), 'app');
  privileged text := '';
  unfit text := '';
  table_name text;
  missing text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = subject) THEN
    RAISE EXCEPTION USING
      MESSAGE = format('the role "%s" does not exist on this database', subject);
  END IF;

  -- A superuser bypasses every policy, whatever the tables say.
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = subject AND rolsuper) THEN
    privileged := privileged || 'it is a superuser; ';
  END IF;

  -- A role with BYPASSRLS always does.
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = subject AND rolbypassrls) THEN
    privileged := privileged || 'it has BYPASSRLS; ';
  END IF;

  -- An owner bypasses row-level security unless the table says FORCE.
  IF EXISTS (
    SELECT 1
      FROM pg_class c
      JOIN pg_roles r ON r.oid = c.relowner
     WHERE r.rolname = subject
       AND c.relkind = 'r'
       AND c.relnamespace = 'public'::regnamespace
  ) THEN
    privileged := privileged || 'it owns a table in public; ';
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
  --
  -- The schema is asked about before the function, because a role without
  -- USAGE on the schema cannot look inside it: asking about auth.uid() then
  -- fails with "permission denied for schema auth" rather than with an
  -- answer. That is the finding itself, so it is recorded first and the
  -- question about the function is not asked.
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'auth') THEN
    unfit := unfit || 'the database has no auth schema — the migrations have not been applied to it; ';
  ELSIF NOT has_schema_privilege(subject, 'auth', 'USAGE') THEN
    unfit := unfit || 'it has no USAGE on the auth schema — the policies would fail with "permission denied for schema auth"; ';
  ELSIF to_regprocedure('auth.uid()') IS NULL THEN
    unfit := unfit || 'the database has no auth.uid() function — the migrations have not been applied to it; ';
  ELSIF NOT has_function_privilege(subject, 'auth.uid()', 'EXECUTE') THEN
    unfit := unfit || 'it cannot execute auth.uid() — the policies would fail with "permission denied for schema auth"; ';
  END IF;

  -- The role has to be able to log in at all: the application connects as it.
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = subject AND rolcanlogin) THEN
    unfit := unfit || 'it cannot log in — the application connects as it; ';
  END IF;

  -- The privileges the application needs on its own tables. The list is the
  -- application's own: the tables its schema declares in public, without the
  -- seven legacy ones, which are asserted further down because the
  -- transitional sign-in only reads them.
  --
  -- The grant that gives these is the one in migration 0005, and it is
  -- exactly these four privileges on every table in public.
  FOREACH table_name IN ARRAY ARRAY[
    'categories', 'devices', 'entity_conflicts', 'household_invitations',
    'household_join_links', 'household_members', 'household_sync_state',
    'households', 'item_stores', 'items', 'stores', 'sync_changes',
    'sync_operations'
  ]
  LOOP
    -- A table that is not on this database cannot be missing a privilege.
    IF to_regclass(format('public.%I', table_name)) IS NULL THEN
      CONTINUE;
    END IF;

    missing := '';
    IF NOT has_table_privilege(subject, format('public.%I', table_name), 'SELECT') THEN
      missing := missing || 'SELECT, ';
    END IF;
    IF NOT has_table_privilege(subject, format('public.%I', table_name), 'INSERT') THEN
      missing := missing || 'INSERT, ';
    END IF;
    IF NOT has_table_privilege(subject, format('public.%I', table_name), 'UPDATE') THEN
      missing := missing || 'UPDATE, ';
    END IF;
    IF NOT has_table_privilege(subject, format('public.%I', table_name), 'DELETE') THEN
      missing := missing || 'DELETE, ';
    END IF;

    IF missing <> '' THEN
      unfit := unfit || format('it lacks %s on public.%I; ', left(missing, length(missing) - 2), table_name);
    END IF;
  END LOOP;

  -- The transitional sign-in reads the legacy password hash through this
  -- role, so the legacy tables have to be readable by it. The grant that
  -- makes them readable is the one in migration 0005, and it lands on the
  -- tables that 0000 created. They go at the decommission, so the assertion
  -- applies only while they are there.
  IF to_regclass('public."user"') IS NOT NULL
     AND to_regclass('public."account"') IS NOT NULL
     AND (
       NOT has_table_privilege(subject, 'public."user"', 'SELECT')
       OR NOT has_table_privilege(subject, 'public."account"', 'SELECT')
     ) THEN
    unfit := unfit || 'it cannot read the legacy tables (public.user, public.account) — the transitional sign-in reads the hash through it; ';
  END IF;

  -- The privileged findings come first and carry their own SQLSTATE: they
  -- are the ones that mean the policies are not enforced at all.
  --
  -- The messages are built with format(), not with RAISE's own placeholders:
  -- RAISE reads %I as "the first argument, and then a literal I", and the
  -- role's name is what belongs in that place.
  IF privileged <> '' THEN
    RAISE EXCEPTION USING
      ERRCODE = 'PRIV1',
      MESSAGE = format('the role "%s" is privileged: %s', subject, rtrim(privileged, '; '));
  END IF;

  IF unfit <> '' THEN
    RAISE EXCEPTION USING
      MESSAGE = format(
        'the role "%s" is not fit to be the application''s role: %s',
        subject,
        rtrim(unfit, '; ')
      );
  END IF;
END
$$;
