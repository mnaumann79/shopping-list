-- Row-level security, and the non-owner role the application connects as.
--
-- Section 9.2b: every household-scoped table carries a policy that resolves the
-- caller's membership, and the application connects as a role that is not the
-- table owner - because an owner bypasses RLS by default, and a policy that
-- is bypassed is not a policy.
--
-- The policies are the normative artefact: the fixture and the cutover are
-- verified against them. So they are written exactly as section 9.2b gives
-- them, and the two places where section 9.2b does not speak - the households
-- table and the item-to-store tags - carry a policy of the same shape, which
-- the comments say why.
--
-- The file is written to be safe on a database that was bootstrapped from
-- db/init.sql: every step checks whether it has already happened.

-- The auth schema, GoTrue's users table and auth.uid().
--
-- On the instance GoTrue owns all three, and this statement does nothing: the
-- auth schema belongs to supabase_admin, and the postgres role has USAGE on it
-- and not CREATE, so anything that touches it is refused. On a plain
-- PostgreSQL the schema and the stub table are created - 0003 creates them
-- too, and only where they are absent - and auth.uid() is created with the
-- same definition Supabase uses, so that the policies below resolve the
-- caller there too.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'auth') THEN
    CREATE SCHEMA "auth";
    CREATE TABLE "auth"."users" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'auth' AND p.proname = 'uid' AND p.pronargs = 0
  ) THEN
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $fn$
      SELECT COALESCE(
        NULLIF(current_setting('request.jwt.claim.sub', true), ''),
        (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
      )::uuid
    $fn$;
  END IF;
END $$;

-- The role the application connects as.
--
-- It logs in, it is not a superuser, it does not bypass RLS, and it owns
-- nothing: the tables belong to the role that migrated them, and an owner
-- would bypass every policy below.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app') THEN
    CREATE ROLE app LOGIN;
  END IF;

  -- A plain PostgreSQL has no Supabase roles. On the instance Supabase owns
  -- them, and `authenticated` already has USAGE on the auth schema and
  -- EXECUTE on auth.uid().
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
END $$;

-- The privileges `authenticated` needs on the auth schema, granted only
-- where the migrating role owns that schema.
--
-- On the instance the auth schema belongs to supabase_admin, and the grant
-- is refused with "permission denied for schema auth" - there `authenticated`
-- already has what it needs, because Supabase granted it. On a plain
-- PostgreSQL the migrating role owns the schema and the grant is the one that
-- gives `authenticated` - and through it the app role - the USAGE and the
-- EXECUTE that the policies below call.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_namespace n
    JOIN pg_roles r ON r.oid = n.nspowner
    WHERE n.nspname = 'auth' AND r.rolname = current_user
  ) THEN
    GRANT USAGE ON SCHEMA auth TO authenticated;
    GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
  END IF;
END $$;

-- The app role inherits the authenticated role, and with it the USAGE on the
-- auth schema and the EXECUTE on auth.uid() that the policies call.
--
-- The obvious grant - GRANT USAGE ON SCHEMA auth TO app - does not work on
-- the instance: the auth schema belongs to supabase_admin, the postgres role
-- is not a superuser there, and the grant is refused with a warning that
-- says no privileges were granted. The inherited role is what actually
-- carries them.
GRANT authenticated TO app;

GRANT USAGE ON SCHEMA public TO app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app;

-- The tables the next migration creates are the application's tables too.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO app;

-- The household-scoped tables. The five sync tables (sync_changes,
-- sync_operations, devices, household_sync_state, entity_conflicts) are not
-- here yet - they arrive with task 3.2, and their policies arrive with them.

ALTER TABLE items ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE household_join_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE household_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE household_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE households ENABLE ROW LEVEL SECURITY;
ALTER TABLE item_stores ENABLE ROW LEVEL SECURITY;

-- The policy of section 9.2b, on every table that carries a household id.
DROP POLICY IF EXISTS items_household_isolation ON items;
CREATE POLICY items_household_isolation ON items
  USING      (household_id IN (SELECT household_id FROM household_members
                               WHERE user_id = auth.uid()))
  WITH CHECK (household_id IN (SELECT household_id FROM household_members
                               WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS categories_household_isolation ON categories;
CREATE POLICY categories_household_isolation ON categories
  USING      (household_id IN (SELECT household_id FROM household_members
                               WHERE user_id = auth.uid()))
  WITH CHECK (household_id IN (SELECT household_id FROM household_members
                               WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS stores_household_isolation ON stores;
CREATE POLICY stores_household_isolation ON stores
  USING      (household_id IN (SELECT household_id FROM household_members
                               WHERE user_id = auth.uid()))
  WITH CHECK (household_id IN (SELECT household_id FROM household_members
                               WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS household_join_links_household_isolation ON household_join_links;
CREATE POLICY household_join_links_household_isolation ON household_join_links
  USING      (household_id IN (SELECT household_id FROM household_members
                               WHERE user_id = auth.uid()))
  WITH CHECK (household_id IN (SELECT household_id FROM household_members
                               WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS household_invitations_household_isolation ON household_invitations;
CREATE POLICY household_invitations_household_isolation ON household_invitations
  USING      (household_id IN (SELECT household_id FROM household_members
                               WHERE user_id = auth.uid()))
  WITH CHECK (household_id IN (SELECT household_id FROM household_members
                               WHERE user_id = auth.uid()));

-- The membership table's own policy, and the one that makes the sub-queries
-- above terminate: it keys on auth.uid() alone, so it never reads the table
-- it is a policy of. A policy here that read household_members would recurse,
-- and PostgreSQL would give up on it.
DROP POLICY IF EXISTS household_members_self ON household_members;
CREATE POLICY household_members_self ON household_members
  USING (user_id = auth.uid());

-- The households table carries the household's name and its creator, and a
-- membership is what makes it visible. The creator is in the USING as well,
-- because the row is written before the membership row exists - the
-- application creates the household and joins it to it in one transaction,
-- and INSERT ... RETURNING has to be able to read the row back.
DROP POLICY IF EXISTS households_membership ON households;
CREATE POLICY households_membership ON households
  USING      (id IN (SELECT household_id FROM household_members
                     WHERE user_id = auth.uid())
              OR created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

-- The item-to-store tags carry no household id of their own, so the policy
-- reaches through both ends of the pair: a tag is visible when its item and
-- its store are both the caller's. The sub-queries stop at the membership
-- table, so this does not recurse either.
DROP POLICY IF EXISTS item_stores_household_isolation ON item_stores;
CREATE POLICY item_stores_household_isolation ON item_stores
  USING      (item_id IN (SELECT id FROM items
                           WHERE household_id IN (SELECT household_id FROM household_members
                                                 WHERE user_id = auth.uid()))
              AND store_id IN (SELECT id FROM stores
                               WHERE household_id IN (SELECT household_id FROM household_members
                                                     WHERE user_id = auth.uid())))
  WITH CHECK (item_id IN (SELECT id FROM items
                           WHERE household_id IN (SELECT household_id FROM household_members
                                                 WHERE user_id = auth.uid()))
              AND store_id IN (SELECT id FROM stores
                               WHERE household_id IN (SELECT household_id FROM household_members
                                                     WHERE user_id = auth.uid())));
