-- The fixture owns exactly ONE schema: `fixture`.
--
-- It never creates, drops or reads `auth` (GoTrue owns that on a Supabase
-- instance) and it never touches the application's `public` schema. The
-- statements are verified against the schema they will actually run against:
-- the same tables, the same columns, the same constraints - in a schema of
-- their own, so that pointing the fixture at a real database can destroy
-- nothing but the fixture's own rows.
--
-- `users` is the fixture's stand-in for `auth.users`: the statements never
-- read it, but the foreign keys that carry an actor id do, and `auth.users`
-- on a real instance has columns this fixture must not try to reproduce.
--
-- The safe path only CREATES what is missing. To start from scratch after the
-- DDL changed, ask for the reset on purpose:
--
--     psql -v fixture_reset=1 -f schema.sql
--
\if :{?fixture_reset}
DROP SCHEMA IF EXISTS fixture CASCADE;
\endif
CREATE SCHEMA IF NOT EXISTS fixture;
SET search_path TO fixture;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  raw_user_meta_data jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS households (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS household_members (
  household_id uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role         text NOT NULL DEFAULT 'member'
                 CHECK (role IN ('owner','admin','member')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (household_id, user_id)
);

CREATE TABLE IF NOT EXISTS household_invitations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  email       text NOT NULL,
  role        text NOT NULL DEFAULT 'member'
                CHECK (role IN ('owner','admin','member')),
  token       text NOT NULL UNIQUE,
  invited_by  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  timestamptz NOT NULL,
  accepted_at timestamptz,
  revoked_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  name text NOT NULL,
  quantity text,
  note text,
  category_id uuid,
  is_active boolean NOT NULL DEFAULT true,
  is_checked boolean NOT NULL DEFAULT false,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_id uuid REFERENCES users(id) ON DELETE SET NULL,
  -- Section 9.1's alterations to the existing table
  deleted_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  field_meta jsonb NOT NULL DEFAULT '{}',
  updated_by_id uuid REFERENCES users(id) ON DELETE SET NULL,
  lamport bigint NOT NULL DEFAULT 0,
  last_op_id uuid
);
CREATE INDEX IF NOT EXISTS items_active_household ON items (household_id) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS stores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  field_meta jsonb NOT NULL DEFAULT '{}',
  updated_by_id uuid REFERENCES users(id) ON DELETE SET NULL,
  lamport bigint NOT NULL DEFAULT 0,
  last_op_id uuid
);
CREATE INDEX IF NOT EXISTS stores_household ON stores (household_id);
-- A partial unique index, not a table constraint: soft-deleted rows are
-- outside it, so a deleted name is free to be reused (§9.2a).
CREATE UNIQUE INDEX IF NOT EXISTS stores_org_name_live ON stores (household_id, name)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  name text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  field_meta jsonb NOT NULL DEFAULT '{}',
  updated_by_id uuid REFERENCES users(id) ON DELETE SET NULL,
  lamport bigint NOT NULL DEFAULT 0,
  last_op_id uuid
);
CREATE INDEX IF NOT EXISTS categories_household ON categories (household_id);
-- A partial unique index, not a table constraint: soft-deleted rows are
-- outside it, so a deleted name is free to be reused (§9.2a).
CREATE UNIQUE INDEX IF NOT EXISTS categories_org_name_live ON categories (household_id, name)
  WHERE deleted_at IS NULL;

-- Each pair is an independent entity with its own version, lamport and
-- device (§9.1), and a removal TOMBSTONES it rather than deleting the row.
CREATE TABLE IF NOT EXISTS item_stores (
  item_id uuid NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  version integer NOT NULL DEFAULT 1,
  lamport bigint NOT NULL DEFAULT 0,
  device_id uuid NOT NULL,
  deleted_at timestamptz,
  PRIMARY KEY (item_id, store_id)
);
CREATE INDEX IF NOT EXISTS item_stores_item ON item_stores (item_id);
CREATE INDEX IF NOT EXISTS item_stores_live ON item_stores (item_id) WHERE deleted_at IS NULL;

-- Append-only log of every applied change, per household.
CREATE TABLE IF NOT EXISTS sync_changes (
  seq          bigserial PRIMARY KEY,     -- global, monotonic; filter by household
  household_id uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  entity_type  text NOT NULL,             -- CHECK: 'item' | 'category' | 'store'
  entity_id    uuid NOT NULL,
  op_id        uuid,                      -- NULL when there is no originating operation
                                         -- (e.g. the seeded default categories)
  version      integer NOT NULL,
  lamport      bigint NOT NULL,
  device_id    uuid NOT NULL,
  actor_id     uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  payload      jsonb NOT NULL,            -- full entity snapshot after the change
  deleted      boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sync_changes_household_seq ON sync_changes (household_id, seq);
-- Pruning by age, per household (§9.2a).
CREATE INDEX IF NOT EXISTS sync_changes_household_created ON sync_changes (household_id, created_at);

-- Idempotency ledger. The primary key IS the idempotency guarantee.
-- NEVER PRUNED: it must outlive the change log, because a replayed operation
-- whose change-log row has been pruned must still be recognised as a
-- duplicate and replayed with its cached result. Pruning this table would
-- silently re-apply an operation that had already been applied.
CREATE TABLE IF NOT EXISTS sync_operations (
  op_id        uuid PRIMARY KEY,
  household_id uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  device_id    uuid NOT NULL,
  actor_id     uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  entity_type  text NOT NULL,
  entity_id    uuid,                      -- NULL for a multi-entity operation (item.bulkArchive):
                                         -- the operation's identity is its op_id, and a bulk
                                         -- operation spans several entities
  op_type      text NOT NULL,
  lamport      bigint NOT NULL,
  payload      jsonb NOT NULL,
  result       jsonb NOT NULL,            -- the FULL per-op response envelope, cached for replay
  outcome      text NOT NULL,             -- 'applied' | 'partial' | 'rejected' | 'duplicate'
  applied_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sync_operations_household ON sync_operations (household_id, applied_at);

-- Known devices per household (device id, name, last seen).
CREATE TABLE IF NOT EXISTS devices (
  id           uuid NOT NULL,
  household_id uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  name         text NOT NULL,
  epoch        uuid,                      -- the epoch this device last synced against
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (household_id, id)
);

-- Per-household sync state: the Lamport clock, the change-log retention
-- floor, and the sync epoch. None of these fit on any other table.
CREATE TABLE IF NOT EXISTS household_sync_state (
  household_id      uuid PRIMARY KEY REFERENCES households(id) ON DELETE CASCADE,
  epoch             uuid NOT NULL,          -- regenerated when a full resync occurs
  min_retained_seq  bigint NOT NULL DEFAULT 0,  -- the change-log floor for this household
  lamport           bigint NOT NULL DEFAULT 0,  -- the household's Lamport clock
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- Conflicts the server resolved, surfaced to the losing device.
CREATE TABLE IF NOT EXISTS entity_conflicts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  entity_type  text NOT NULL,
  entity_id    uuid NOT NULL,
  field        text NOT NULL,
  seq          bigserial NOT NULL,        -- cursor for delivering conflicts to other devices
  local_value  jsonb,
  server_value jsonb,
  store_id     uuid NULL,                  -- the contested tag pair, for item.storeTags
  resolution   text NOT NULL,             -- 'lww' | 'check_wins' | 'delete_wins' |
                                           -- 'removal_wins' | 'override' | 'rejected'
  winner_device_id uuid,                  -- the device whose value won (NULL for a server-side rejection)
  winner_lamport  bigint,                 -- the Lamport value of the winning write
  op_id        uuid NOT NULL,
  device_id    uuid NOT NULL,
  resolved_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS entity_conflicts_seq ON entity_conflicts (seq);
CREATE INDEX IF NOT EXISTS entity_conflicts_household_seq ON entity_conflicts (household_id, seq);
