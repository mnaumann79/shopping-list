-- The flat snapshot of the schema in db/migrations/, for a database that is
-- bootstrapped from scratch rather than migrated. A database built from this
-- file and a database built by `node scripts/db-migrate.mjs` have the same
-- schema - constraint names included.
--
-- The auth schema and GoTrue's users table: on the Supabase instance GoTrue
-- owns both and this file adds nothing. On a plain PostgreSQL they are the
-- smallest thing the foreign keys can point at.
--
-- The block is skipped where the schema already exists, because there the
-- postgres role has USAGE on it but not CREATE, and a "CREATE TABLE IF NOT
-- EXISTS" would be refused before PostgreSQL looked at the table.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'auth') THEN
    CREATE SCHEMA "auth";
    CREATE TABLE "auth"."users" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL
    );
  END IF;
END $$;

-- auth.uid() reads the caller's id from request.jwt.claims.
--
-- On the instance GoTrue owns this function and this statement does nothing.
-- On a plain PostgreSQL it is created with the same definition Supabase uses,
-- so that the policies below resolve the caller there too.
DO $$
BEGIN
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
CREATE TABLE IF NOT EXISTS "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "invitation" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"email" text NOT NULL,
	"role" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp NOT NULL,
	"inviter_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "member" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "organization" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text,
	"logo" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"metadata" text,
	CONSTRAINT "organization_slug_unique" UNIQUE("slug")
);
CREATE TABLE IF NOT EXISTS "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"active_organization_id" text,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
CREATE TABLE IF NOT EXISTS "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
CREATE TABLE IF NOT EXISTS "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
-- The household is the tenant. It was Better Auth's `organization` table.
CREATE TABLE IF NOT EXISTS "households" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS "household_members" (
	"household_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text NOT NULL DEFAULT 'member',
	"created_at" timestamptz NOT NULL DEFAULT now(),
	CONSTRAINT "household_members_pkey" PRIMARY KEY ("household_id", "user_id"),
	CONSTRAINT "household_members_role_check" CHECK ("role" IN ('owner', 'admin', 'member'))
);
CREATE TABLE IF NOT EXISTS "household_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"email" text NOT NULL,
	"role" text NOT NULL DEFAULT 'member',
	"token" text NOT NULL,
	"invited_by" uuid NOT NULL,
	"expires_at" timestamptz NOT NULL,
	"accepted_at" timestamptz,
	"revoked_at" timestamptz,
	"created_at" timestamptz NOT NULL DEFAULT now(),
	CONSTRAINT "household_invitations_role_check" CHECK ("role" IN ('owner', 'admin', 'member')),
	CONSTRAINT "household_invitations_token_unique" UNIQUE ("token")
);
CREATE TABLE IF NOT EXISTS "household_join_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token" text NOT NULL,
	"household_id" uuid NOT NULL,
	"created_by_id" uuid NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "household_join_links_token_unique" UNIQUE("token")
);
CREATE TABLE IF NOT EXISTS "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"name" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "categories_household_id_name_unique" UNIQUE("household_id","name")
);
CREATE TABLE IF NOT EXISTS "item_stores" (
	"item_id" uuid NOT NULL,
	"store_id" uuid NOT NULL
);
CREATE TABLE IF NOT EXISTS "items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"name" text NOT NULL,
	"quantity" text,
	"note" text,
	"category_id" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_checked" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_by_id" uuid,
	"archived_at" timestamp
);
CREATE TABLE IF NOT EXISTS "stores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
-- The change log: one row per applied change, per household.
CREATE TABLE IF NOT EXISTS "sync_changes" (
	"seq" bigserial PRIMARY KEY,
	"household_id" uuid NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"op_id" uuid,
	"version" integer NOT NULL,
	"lamport" bigint NOT NULL,
	"device_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"payload" jsonb NOT NULL,
	"deleted" boolean NOT NULL DEFAULT false,
	"created_at" timestamptz NOT NULL DEFAULT now()
);
-- The idempotency ledger. The primary key IS the idempotency guarantee.
CREATE TABLE IF NOT EXISTS "sync_operations" (
	"op_id" uuid PRIMARY KEY,
	"household_id" uuid NOT NULL,
	"device_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid,
	"op_type" text NOT NULL,
	"lamport" bigint NOT NULL,
	"payload" jsonb NOT NULL,
	"result" jsonb NOT NULL,
	"outcome" text NOT NULL,
	"applied_at" timestamptz NOT NULL DEFAULT now()
);
-- The known devices of a household.
CREATE TABLE IF NOT EXISTS "devices" (
	"id" uuid NOT NULL,
	"household_id" uuid NOT NULL,
	"name" text NOT NULL,
	"epoch" uuid,
	"last_seen_at" timestamptz NOT NULL DEFAULT now(),
	"created_at" timestamptz NOT NULL DEFAULT now(),
	CONSTRAINT "devices_pkey" PRIMARY KEY ("household_id", "id")
);
-- The per-household sync state.
CREATE TABLE IF NOT EXISTS "household_sync_state" (
	"household_id" uuid PRIMARY KEY,
	"epoch" uuid NOT NULL,
	"min_retained_seq" bigint NOT NULL DEFAULT 0,
	"lamport" bigint NOT NULL DEFAULT 0,
	"updated_at" timestamptz NOT NULL DEFAULT now()
);
-- The conflicts the server resolved, surfaced to the losing device.
CREATE TABLE IF NOT EXISTS "entity_conflicts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"field" text NOT NULL,
	"seq" bigserial NOT NULL,
	"local_value" jsonb,
	"server_value" jsonb,
	"store_id" uuid,
	"resolution" text NOT NULL,
	"winner_device_id" uuid,
	"winner_lamport" bigint,
	"op_id" uuid NOT NULL,
	"device_id" uuid NOT NULL,
	"resolved_at" timestamptz,
	"created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "household_members_user" ON "household_members" ("user_id");
CREATE INDEX IF NOT EXISTS "household_invitations_household" ON "household_invitations" ("household_id");
CREATE INDEX IF NOT EXISTS "sync_changes_household_seq" ON "sync_changes" ("household_id", "seq");
CREATE INDEX IF NOT EXISTS "sync_changes_household_created" ON "sync_changes" ("household_id", "created_at");
CREATE INDEX IF NOT EXISTS "sync_operations_household" ON "sync_operations" ("household_id", "applied_at");
CREATE UNIQUE INDEX IF NOT EXISTS "entity_conflicts_seq" ON "entity_conflicts" ("seq");
CREATE INDEX IF NOT EXISTS "entity_conflicts_household_seq" ON "entity_conflicts" ("household_id", "seq");
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_inviter_id_user_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "member" ADD CONSTRAINT "member_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "member" ADD CONSTRAINT "member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "households" ADD CONSTRAINT "households_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "household_members" ADD CONSTRAINT "household_members_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "household_members" ADD CONSTRAINT "household_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "household_invitations" ADD CONSTRAINT "household_invitations_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "household_invitations" ADD CONSTRAINT "household_invitations_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "household_join_links" ADD CONSTRAINT "household_join_links_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "household_join_links" ADD CONSTRAINT "household_join_links_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "categories" ADD CONSTRAINT "categories_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "item_stores" ADD CONSTRAINT "item_stores_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "item_stores" ADD CONSTRAINT "item_stores_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "items" ADD CONSTRAINT "items_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "items" ADD CONSTRAINT "items_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "items" ADD CONSTRAINT "items_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "stores" ADD CONSTRAINT "stores_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "sync_changes" ADD CONSTRAINT "sync_changes_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "sync_changes" ADD CONSTRAINT "sync_changes_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "auth"."users"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "sync_operations" ADD CONSTRAINT "sync_operations_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "sync_operations" ADD CONSTRAINT "sync_operations_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "auth"."users"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "devices" ADD CONSTRAINT "devices_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "household_sync_state" ADD CONSTRAINT "household_sync_state_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "entity_conflicts" ADD CONSTRAINT "entity_conflicts_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;

-- The role the application connects as, and the role it inherits.
--
-- The roles are cluster-wide, not per database, so they are created where
-- they are missing - exactly as the migration does - and a flat snapshot that
-- did not create them would leave a database the application cannot connect
-- to. The app role is not a superuser, does not bypass row-level security,
-- and owns nothing: the tables belong to the role that migrated them, and an
-- owner bypasses every policy below.
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
-- On a plain PostgreSQL the migrating role owns the schema and the grant is
-- the one that gives `authenticated` - and through it the app role - the
-- USAGE and the EXECUTE that the policies below call.
--
-- On a hosted instance the auth schema belongs to supabase_admin, so this
-- block is skipped: the guard is the schema's ownership, and the migrating
-- role does not own it there. No statement runs, no warning is emitted and
-- nothing fails. A grant issued by hand is accepted - the statement
-- succeeds - and PostgreSQL declines it in a warning, no privileges were
-- granted for "auth", so it grants nothing. `authenticated` already has
-- what it needs there, because Supabase granted it. Measured on the
-- development instance; the account is in
-- db/migrations/0008_auth_schema_grant_account.sql.
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
-- The obvious grant - GRANT USAGE ON SCHEMA auth TO app - grants nothing on
-- the instance: the auth schema belongs to supabase_admin, the migrating
-- role has no grant option on it, and the grant is accepted and then
-- declined in a warning - no privileges were granted for "auth" - so it
-- changes nothing. The inherited role is what actually carries them.
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

-- Whether a household has no members yet.
--
-- This is the question the bootstrap SELECT policy asks, and it has to be
-- asked of the membership table rather than of the households table: a
-- function over the table the statement is writing into cannot see the row
-- being written, so an INSERT ... RETURNING of a household was refused by
-- its own policies. See migration 0009.
--
-- It is SECURITY DEFINER so that it reads every membership row and not only
-- the caller's: "no members" has to mean no members at all, or a creator who
-- had been removed from their household would keep reading it.
CREATE OR REPLACE FUNCTION app_household_has_no_members(p_household_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT NOT EXISTS (
    SELECT 1 FROM household_members
     WHERE household_id = p_household_id
  );
$fn$;

-- PUBLIC gets no execute right on these: they answer "what role does this
-- user have in this household", "did this user create it", "which
-- household is this transaction about", and "does this household have no
-- members yet", and that is nobody's business but the household's. The app
-- role has them; the inherited authenticated role has them as well, so a
-- PostgREST connection that assumes that role still evaluates the policies.
REVOKE ALL ON FUNCTION app_household_role(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_household_bootstrap(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_household_scope(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_household_has_no_members(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_household_role(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION app_household_bootstrap(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION app_household_scope(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION app_household_has_no_members(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION app_household_role(uuid, uuid) TO app;
GRANT EXECUTE ON FUNCTION app_household_bootstrap(uuid, uuid) TO app;
GRANT EXECUTE ON FUNCTION app_household_scope(uuid) TO app;
GRANT EXECUTE ON FUNCTION app_household_has_no_members(uuid) TO app;

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
CREATE POLICY items_household_isolation ON items
  USING      (household_id IN (SELECT household_id FROM household_members
                               WHERE user_id = auth.uid())
              AND app_household_scope(household_id))
  WITH CHECK (household_id IN (SELECT household_id FROM household_members
                               WHERE user_id = auth.uid())
              AND app_household_scope(household_id));

CREATE POLICY categories_household_isolation ON categories
  USING      (household_id IN (SELECT household_id FROM household_members
                               WHERE user_id = auth.uid())
              AND app_household_scope(household_id))
  WITH CHECK (household_id IN (SELECT household_id FROM household_members
                               WHERE user_id = auth.uid())
              AND app_household_scope(household_id));

CREATE POLICY stores_household_isolation ON stores
  USING      (household_id IN (SELECT household_id FROM household_members
                               WHERE user_id = auth.uid())
              AND app_household_scope(household_id))
  WITH CHECK (household_id IN (SELECT household_id FROM household_members
                               WHERE user_id = auth.uid())
              AND app_household_scope(household_id));

CREATE POLICY household_join_links_household_isolation ON household_join_links
  USING      (household_id IN (SELECT household_id FROM household_members
                               WHERE user_id = auth.uid())
              AND app_household_scope(household_id))
  WITH CHECK (household_id IN (SELECT household_id FROM household_members
                               WHERE user_id = auth.uid())
              AND app_household_scope(household_id));

CREATE POLICY household_invitations_household_isolation ON household_invitations
  USING      (household_id IN (SELECT household_id FROM household_members
                               WHERE user_id = auth.uid())
              AND app_household_scope(household_id))
  WITH CHECK (household_id IN (SELECT household_id FROM household_members
                               WHERE user_id = auth.uid())
              AND app_household_scope(household_id));

CREATE POLICY sync_changes_household_isolation ON sync_changes
  USING      (household_id IN (SELECT household_id FROM household_members
                               WHERE user_id = auth.uid())
              AND app_household_scope(household_id))
  WITH CHECK (household_id IN (SELECT household_id FROM household_members
                               WHERE user_id = auth.uid())
              AND app_household_scope(household_id));

CREATE POLICY sync_operations_household_isolation ON sync_operations
  USING      (household_id IN (SELECT household_id FROM household_members
                               WHERE user_id = auth.uid())
              AND app_household_scope(household_id))
  WITH CHECK (household_id IN (SELECT household_id FROM household_members
                               WHERE user_id = auth.uid())
              AND app_household_scope(household_id));

CREATE POLICY devices_household_isolation ON devices
  USING      (household_id IN (SELECT household_id FROM household_members
                               WHERE user_id = auth.uid())
              AND app_household_scope(household_id))
  WITH CHECK (household_id IN (SELECT household_id FROM household_members
                               WHERE user_id = auth.uid())
              AND app_household_scope(household_id));

CREATE POLICY household_sync_state_household_isolation ON household_sync_state
  USING      (household_id IN (SELECT household_id FROM household_members
                               WHERE user_id = auth.uid())
              AND app_household_scope(household_id))
  WITH CHECK (household_id IN (SELECT household_id FROM household_members
                               WHERE user_id = auth.uid())
              AND app_household_scope(household_id));

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
--
-- The bootstrap read asks the membership table whether the household has no
-- members yet, not the households table: PostgreSQL applies the SELECT
-- policies to the rows an INSERT ... RETURNING returns, and a function over
-- the table the statement is writing into cannot see the row being written.
-- See migration 0009.

CREATE POLICY households_bootstrap_insert ON households
  FOR INSERT WITH CHECK (created_by = auth.uid());

CREATE POLICY households_bootstrap_select ON households
  FOR SELECT USING (created_by = auth.uid() AND app_household_has_no_members(id));

CREATE POLICY households_member ON households
  USING      (app_household_role(id, auth.uid()) IS NOT NULL
              AND app_household_scope(id))
  WITH CHECK (app_household_role(id, auth.uid()) IS NOT NULL
              AND app_household_scope(id));

-- The item-to-store tags carry no household id of their own, so the policy
-- reaches through both ends of the pair: a tag is visible when its item and
-- its store are both the caller's. The sub-queries stop at the membership
-- table, so this does not recurse either.
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