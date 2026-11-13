-- The household tables and the sync tables.
--
-- Section 9.2's new tables. The household is the tenant: it was Better Auth's
-- `organization` table, and with Better Auth gone it is an ordinary
-- application table that everything else points at. The five sync tables are
-- the server-side change log, the idempotency ledger, the known devices, the
-- per-household sync state and the conflicts the server resolved.
--
-- The file is written to be safe on a database that was bootstrapped from
-- db/init.sql: every statement creates only what is missing, so a second run
-- changes nothing.

-- The auth schema and GoTrue's users table.
--
-- On the Supabase instance GoTrue owns both, and this statement does nothing.
-- On a plain PostgreSQL - a local development database, a CI container - it
-- creates the smallest table the foreign keys below can point at, so that the
-- schema is the same in every environment.
--
-- The whole block is skipped where the schema already exists, and that is not
-- only a convenience: on the instance the auth schema belongs to
-- supabase_admin, and the postgres role has USAGE on it but not CREATE. A
-- "CREATE TABLE IF NOT EXISTS" would still be refused - the privilege check
-- comes before the check for the table - with "permission denied for schema
-- auth", on an instance that already has everything it needs.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'auth') THEN
    CREATE SCHEMA "auth";
    CREATE TABLE "auth"."users" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL
    );
  END IF;
END $$;

-- The household is the tenant (§9.2).
CREATE TABLE IF NOT EXISTS "households" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamptz NOT NULL DEFAULT now(),
	CONSTRAINT "households_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action
);

-- Membership. The role vocabulary is §12.5's: 'owner' | 'admin' | 'member'.
CREATE TABLE IF NOT EXISTS "household_members" (
	"household_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text NOT NULL DEFAULT 'member',
	"created_at" timestamptz NOT NULL DEFAULT now(),
	CONSTRAINT "household_members_pkey" PRIMARY KEY ("household_id", "user_id"),
	CONSTRAINT "household_members_role_check" CHECK ("role" IN ('owner', 'admin', 'member')),
	CONSTRAINT "household_members_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "household_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action
);
CREATE INDEX IF NOT EXISTS "household_members_user" ON "household_members" ("user_id");

-- Invitations. The token is opaque and random; the row is the invitation's
-- only state, and revoked_at is what closes a single invitation without
-- invalidating the others.
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
	CONSTRAINT "household_invitations_token_unique" UNIQUE ("token"),
	CONSTRAINT "household_invitations_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "household_invitations_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action
);
CREATE INDEX IF NOT EXISTS "household_invitations_household" ON "household_invitations" ("household_id");

-- The change log. Append-only, one row per applied change, per household.
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
	"created_at" timestamptz NOT NULL DEFAULT now(),
	CONSTRAINT "sync_changes_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "sync_changes_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "auth"."users"("id") ON DELETE restrict ON UPDATE no action
);
CREATE INDEX IF NOT EXISTS "sync_changes_household_seq" ON "sync_changes" ("household_id", "seq");
-- Pruning by age, per household (§9.2a).
CREATE INDEX IF NOT EXISTS "sync_changes_household_created" ON "sync_changes" ("household_id", "created_at");

-- The idempotency ledger. The primary key IS the idempotency guarantee.
-- NEVER PRUNED: it must outlive the change log, because a replayed operation
-- whose change-log row has been pruned must still be recognised as a
-- duplicate and replayed with its cached result.
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
	"applied_at" timestamptz NOT NULL DEFAULT now(),
	CONSTRAINT "sync_operations_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "sync_operations_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "auth"."users"("id") ON DELETE restrict ON UPDATE no action
);
CREATE INDEX IF NOT EXISTS "sync_operations_household" ON "sync_operations" ("household_id", "applied_at");

-- The known devices of a household.
CREATE TABLE IF NOT EXISTS "devices" (
	"id" uuid NOT NULL,
	"household_id" uuid NOT NULL,
	"name" text NOT NULL,
	"epoch" uuid,
	"last_seen_at" timestamptz NOT NULL DEFAULT now(),
	"created_at" timestamptz NOT NULL DEFAULT now(),
	CONSTRAINT "devices_pkey" PRIMARY KEY ("household_id", "id"),
	CONSTRAINT "devices_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE cascade ON UPDATE no action
);

-- The per-household sync state: the Lamport clock, the change-log retention
-- floor and the sync epoch.
CREATE TABLE IF NOT EXISTS "household_sync_state" (
	"household_id" uuid PRIMARY KEY,
	"epoch" uuid NOT NULL,
	"min_retained_seq" bigint NOT NULL DEFAULT 0,
	"lamport" bigint NOT NULL DEFAULT 0,
	"updated_at" timestamptz NOT NULL DEFAULT now(),
	CONSTRAINT "household_sync_state_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE cascade ON UPDATE no action
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
	"created_at" timestamptz NOT NULL DEFAULT now(),
	CONSTRAINT "entity_conflicts_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE cascade ON UPDATE no action
);
CREATE UNIQUE INDEX IF NOT EXISTS "entity_conflicts_seq" ON "entity_conflicts" ("seq");
CREATE INDEX IF NOT EXISTS "entity_conflicts_household_seq" ON "entity_conflicts" ("household_id", "seq");
