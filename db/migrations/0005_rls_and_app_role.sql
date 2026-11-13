-- Row-level security, and the non-owner role the application connects as.
--
-- Section 9.2b: every household-scoped table carries a policy that resolves the
-- caller's membership, and the application connects as a role that is not the
-- table owner - because an owner bypasses RLS by default, and a policy that
-- is bypassed is not a policy.
--
-- The policies are the normative artefact: the fixture and the cutover are
-- verified against them. So they follow section 9.2b, and the places where
-- the section does not speak - the households table, the item-to-store tags
-- and the five sync tables - carry a policy of the same shape, which the
-- comments say why.
--
-- The membership table carries the policy section 9.2b amended it to: a
-- SECURITY DEFINER function reads the table with the owner's rights, so the
-- owner and the admins can manage the membership and the policy still does
-- not recurse.
--
-- Two things the section does not spell out, and the comments say why: the
-- creator's bootstrap write on the membership table is a branch of its own,
-- because the bare "user_id = auth.uid()" would let anybody join any
-- household whose id they know; and every policy also honours the household
-- the transaction is scoped to, so a user who belongs to two households
-- cannot read the second one while holding the first one's lock.
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

-- The function the membership policies call.
--
-- It is SECURITY DEFINER, and it is owned by the role that owns
-- household_members - the role that ran this migration - so it reads that
-- table with the owner's rights and the policies do not apply to it. That is
-- what keeps the policies below from recursing.
--
-- The search_path is set, because a SECURITY DEFINER function that resolves
-- its names through a caller-controlled search path is a hole.
CREATE OR REPLACE FUNCTION app_household_role(p_household_id uuid, p_user_id uuid)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT role FROM household_members
   WHERE household_id = p_household_id AND user_id = p_user_id;
$fn$;

-- The bootstrap case: the caller created the household, and it has no members
-- yet.
--
-- The application creates the household and joins it to it in one
-- transaction, and the membership row is written before anybody else's. This
-- function is what lets the creator write that row - and only that row: the
-- bare "user_id = auth.uid()" branch would let any caller join any household
-- whose id they happen to know, which is the cross-household hole this
-- closes.
CREATE OR REPLACE FUNCTION app_household_bootstrap(p_household_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT EXISTS (
    SELECT 1
      FROM households h
     WHERE h.id = p_household_id
       AND h.created_by = p_user_id
       AND NOT EXISTS (SELECT 1 FROM household_members m
                        WHERE m.household_id = h.id)
  );
$fn$;

-- The household the transaction is scoped to.
--
-- The scope helper sets it, transaction-locally, next to the claims. A
-- transaction that sets no scope is not narrowed: the membership is the
-- whole of the isolation, as it is in section 9.2b.
CREATE OR REPLACE FUNCTION app_household_scope(p_household_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $fn$
  SELECT COALESCE(
    NULLIF(current_setting('app.current_household', true), '')::uuid = p_household_id,
    true);
$fn$;

-- PUBLIC gets no execute right on these: they answer "what role does this
-- user have in this household", "did this user create it", and "which
-- household is this transaction about", and that is nobody's business but the
-- household's. The app role has them; the inherited authenticated role has
-- them as well, so a PostgREST connection that assumes that role still
-- evaluates the policies.
REVOKE ALL ON FUNCTION app_household_role(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_household_bootstrap(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_household_scope(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_household_role(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION app_household_bootstrap(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION app_household_scope(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION app_household_role(uuid, uuid) TO app;
GRANT EXECUTE ON FUNCTION app_household_bootstrap(uuid, uuid) TO app;
GRANT EXECUTE ON FUNCTION app_household_scope(uuid) TO app;

-- Every table that carries a household id. That includes the five sync
-- tables: the app role has CRUD on every table in this schema, so a table
-- without a policy is a table the app role can read across households.
ALTER TABLE items ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE household_join_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE household_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE household_sync_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE entity_conflicts ENABLE ROW LEVEL SECURITY;
ALTER TABLE household_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE households ENABLE ROW LEVEL SECURITY;
ALTER TABLE item_stores ENABLE ROW LEVEL SECURITY;

-- The policy of section 9.2b, on every table that carries a household id:
-- the caller is a member of the household, and the transaction is scoped to
-- it.
DROP POLICY IF EXISTS items_household_isolation ON items;
CREATE POLICY items_household_isolation ON items
  USING      (household_id IN (SELECT household_id FROM household_members
                               WHERE user_id = auth.uid())
              AND app_household_scope(household_id))
  WITH CHECK (household_id IN (SELECT household_id FROM household_members
                               WHERE user_id = auth.uid())
              AND app_household_scope(household_id));

DROP POLICY IF EXISTS categories_household_isolation ON categories;
CREATE POLICY categories_household_isolation ON categories
  USING      (household_id IN (SELECT household_id FROM household_members
                               WHERE user_id = auth.uid())
              AND app_household_scope(household_id))
  WITH CHECK (household_id IN (SELECT household_id FROM household_members
                               WHERE user_id = auth.uid())
              AND app_household_scope(household_id));

DROP POLICY IF EXISTS stores_household_isolation ON stores;
CREATE POLICY stores_household_isolation ON stores
  USING      (household_id IN (SELECT household_id FROM household_members
                               WHERE user_id = auth.uid())
              AND app_household_scope(household_id))
  WITH CHECK (household_id IN (SELECT household_id FROM household_members
                               WHERE user_id = auth.uid())
              AND app_household_scope(household_id));

DROP POLICY IF EXISTS household_join_links_household_isolation ON household_join_links;
CREATE POLICY household_join_links_household_isolation ON household_join_links
  USING      (household_id IN (SELECT household_id FROM household_members
                               WHERE user_id = auth.uid())
              AND app_household_scope(household_id))
  WITH CHECK (household_id IN (SELECT household_id FROM household_members
                               WHERE user_id = auth.uid())
              AND app_household_scope(household_id));

DROP POLICY IF EXISTS household_invitations_household_isolation ON household_invitations;
CREATE POLICY household_invitations_household_isolation ON household_invitations
  USING      (household_id IN (SELECT household_id FROM household_members
                               WHERE user_id = auth.uid())
              AND app_household_scope(household_id))
  WITH CHECK (household_id IN (SELECT household_id FROM household_members
                               WHERE user_id = auth.uid())
              AND app_household_scope(household_id));

DROP POLICY IF EXISTS sync_changes_household_isolation ON sync_changes;
CREATE POLICY sync_changes_household_isolation ON sync_changes
  USING      (household_id IN (SELECT household_id FROM household_members
                               WHERE user_id = auth.uid())
              AND app_household_scope(household_id))
  WITH CHECK (household_id IN (SELECT household_id FROM household_members
                               WHERE user_id = auth.uid())
              AND app_household_scope(household_id));

DROP POLICY IF EXISTS sync_operations_household_isolation ON sync_operations;
CREATE POLICY sync_operations_household_isolation ON sync_operations
  USING      (household_id IN (SELECT household_id FROM household_members
                               WHERE user_id = auth.uid())
              AND app_household_scope(household_id))
  WITH CHECK (household_id IN (SELECT household_id FROM household_members
                               WHERE user_id = auth.uid())
              AND app_household_scope(household_id));

DROP POLICY IF EXISTS devices_household_isolation ON devices;
CREATE POLICY devices_household_isolation ON devices
  USING      (household_id IN (SELECT household_id FROM household_members
                               WHERE user_id = auth.uid())
              AND app_household_scope(household_id))
  WITH CHECK (household_id IN (SELECT household_id FROM household_members
                               WHERE user_id = auth.uid())
              AND app_household_scope(household_id));

DROP POLICY IF EXISTS household_sync_state_household_isolation ON household_sync_state;
CREATE POLICY household_sync_state_household_isolation ON household_sync_state
  USING      (household_id IN (SELECT household_id FROM household_members
                               WHERE user_id = auth.uid())
              AND app_household_scope(household_id))
  WITH CHECK (household_id IN (SELECT household_id FROM household_members
                               WHERE user_id = auth.uid())
              AND app_household_scope(household_id));

DROP POLICY IF EXISTS entity_conflicts_household_isolation ON entity_conflicts;
CREATE POLICY entity_conflicts_household_isolation ON entity_conflicts
  USING      (household_id IN (SELECT household_id FROM household_members
                               WHERE user_id = auth.uid())
              AND app_household_scope(household_id))
  WITH CHECK (household_id IN (SELECT household_id FROM household_members
                               WHERE user_id = auth.uid())
              AND app_household_scope(household_id));

-- The membership table's own policy.
--
-- The obvious one - USING (user_id = auth.uid()) - makes the sub-queries
-- above terminate, because it never reads the table it is a policy of. But it
-- also stops the owner from managing the household: a user sees only their
-- own membership row, so an owner can neither add a member nor remove one,
-- and the admin flows of section 12.5 have nothing to work with.
--
-- The way out is the SECURITY DEFINER function above: it reads
-- household_members with the owner's rights, so the policy does not apply to
-- it, and the policy below does not recurse.
--
-- A write needs more than a read does. An owner or an admin may manage the
-- membership; a member may join the household they created and nothing else,
-- which is what the bootstrap branch is for.
DROP POLICY IF EXISTS household_members_self ON household_members;
DROP POLICY IF EXISTS household_members_isolation ON household_members;
CREATE POLICY household_members_isolation ON household_members
  USING      ((user_id = auth.uid()
                OR app_household_role(household_id, auth.uid()) IN ('owner','admin'))
              AND app_household_scope(household_id))
  WITH CHECK ((app_household_role(household_id, auth.uid()) IN ('owner','admin')
               OR (user_id = auth.uid()
                   AND app_household_bootstrap(household_id, auth.uid())))
              AND app_household_scope(household_id));

-- The households table carries the household's name and its creator, and a
-- membership is what makes it visible.
--
-- Bootstrap and authorization are two different things, so they are two
-- policies. The creator may insert the household and read it back, because
-- the row is written before the membership row exists - the application
-- creates the household and joins it to it in one transaction, and
-- INSERT ... RETURNING has to be able to read the row back. Everything else
-- needs a membership: a creator whose membership was removed has lost the
-- household, and a policy that kept the creator exception would let them
-- delete it, and with it everything in it.
DROP POLICY IF EXISTS households_membership ON households;
DROP POLICY IF EXISTS households_bootstrap ON households;
DROP POLICY IF EXISTS households_bootstrap_insert ON households;
DROP POLICY IF EXISTS households_bootstrap_select ON households;
DROP POLICY IF EXISTS households_member ON households;

CREATE POLICY households_bootstrap_insert ON households
  FOR INSERT WITH CHECK (created_by = auth.uid());

CREATE POLICY households_bootstrap_select ON households
  FOR SELECT USING (app_household_bootstrap(id, auth.uid()));

CREATE POLICY households_member ON households
  USING      (app_household_role(id, auth.uid()) IS NOT NULL
              AND app_household_scope(id))
  WITH CHECK (app_household_role(id, auth.uid()) IS NOT NULL
              AND app_household_scope(id));

-- The item-to-store tags carry no household id of their own, so the policy
-- reaches through both ends of the pair: a tag is visible when its item and
-- its store are both the caller's. The sub-queries stop at the membership
-- table, so this does not recurse either.
DROP POLICY IF EXISTS item_stores_household_isolation ON item_stores;
CREATE POLICY item_stores_household_isolation ON item_stores
  USING      (item_id IN (SELECT id FROM items
                           WHERE household_id IN (SELECT household_id FROM household_members
                                                 WHERE user_id = auth.uid())
                             AND app_household_scope(household_id))
              AND store_id IN (SELECT id FROM stores
                               WHERE household_id IN (SELECT household_id FROM household_members
                                                     WHERE user_id = auth.uid())
                                 AND app_household_scope(household_id)))
  WITH CHECK (item_id IN (SELECT id FROM items
                           WHERE household_id IN (SELECT household_id FROM household_members
                                                 WHERE user_id = auth.uid())
                             AND app_household_scope(household_id))
              AND store_id IN (SELECT id FROM stores
                               WHERE household_id IN (SELECT household_id FROM household_members
                                                     WHERE user_id = auth.uid())
                                 AND app_household_scope(household_id)));
