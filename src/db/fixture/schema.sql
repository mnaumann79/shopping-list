-- Existing tables (db/init.sql, trimmed to what the sync path touches)
DROP TABLE IF EXISTS item_stores, items, stores, categories, sync_changes,
  sync_operations, devices, household_sync_state, entity_conflicts,
  households, household_members, household_invitations,
  organization, "user", member, session, account, verification, invitation
  CASCADE;
DROP SCHEMA IF EXISTS auth CASCADE;

-- The target environment is a self-hosted Supabase instance: GoTrue owns the
-- `auth` schema. The fixture reproduces it faithfully, so the statements are
-- verified against the schema they will actually run against.
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  raw_user_meta_data jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE TABLE IF NOT EXISTS auth.identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider_id text NOT NULL,
  provider_user_id text NOT NULL
);

CREATE TABLE households (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE household_members (
  household_id uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role         text NOT NULL DEFAULT 'member',
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (household_id, user_id)
);
CREATE TABLE household_invitations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  email       text NOT NULL,
  role        text NOT NULL DEFAULT 'member',
  token       text NOT NULL UNIQUE,
  invited_by  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expires_at  timestamptz NOT NULL,
  accepted_at timestamptz,
  revoked_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  name text NOT NULL,
  quantity text,
  note text,
  category_id uuid,
  is_active boolean NOT NULL DEFAULT true,
  is_checked boolean NOT NULL DEFAULT false,
  archived_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  created_by_id uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE TABLE stores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  name text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE item_stores (
  item_id uuid NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE
);
-- Append-only log of every applied change, per household.
CREATE TABLE sync_changes (
  seq          bigserial PRIMARY KEY,     -- global, monotonic; filter by household
  household_id uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  entity_type  text NOT NULL,             -- CHECK: 'item' | 'category' | 'store'
  entity_id    uuid NOT NULL,
  op_id        uuid,                      -- NULL when there is no originating operation
                                         -- (e.g. the seeded default categories)
  version      integer NOT NULL,
  lamport      bigint NOT NULL,
  device_id    uuid NOT NULL,
  actor_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  payload      jsonb NOT NULL,            -- full entity snapshot after the change
  deleted      boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sync_changes_household_seq ON sync_changes (household_id, seq);

-- Idempotency ledger. The primary key IS the idempotency guarantee.
-- NEVER PRUNED: it must outlive the change log, because a replayed operation
-- whose change-log row has been pruned must still be recognised as a
-- duplicate and replayed with its cached result. Pruning this table would
-- silently re-apply an operation that had already been applied.
CREATE TABLE sync_operations (
  op_id        uuid PRIMARY KEY,
  household_id uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  device_id    uuid NOT NULL,
  actor_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
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
CREATE INDEX sync_operations_household ON sync_operations (household_id, applied_at);

-- Known devices per household (device id, name, last seen).
CREATE TABLE devices (
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
CREATE TABLE household_sync_state (
  household_id      uuid PRIMARY KEY REFERENCES households(id) ON DELETE CASCADE,
  epoch             uuid NOT NULL,          -- regenerated when a full resync occurs
  min_retained_seq  bigint NOT NULL DEFAULT 0,  -- the change-log floor for this household
  lamport           bigint NOT NULL DEFAULT 0,  -- the household's Lamport clock
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- Conflicts the server resolved, surfaced to the losing device.
CREATE TABLE entity_conflicts (
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
CREATE UNIQUE INDEX entity_conflicts_seq ON entity_conflicts (seq);
CREATE INDEX entity_conflicts_household_seq ON entity_conflicts (household_id, seq);
-- Section 9.1's alterations to the existing tables
ALTER TABLE items
  ADD COLUMN deleted_at timestamptz,
  ADD COLUMN version integer NOT NULL DEFAULT 1,
  ADD COLUMN field_meta jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN updated_by_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN lamport bigint NOT NULL DEFAULT 0,
  ADD COLUMN last_op_id uuid,
  ALTER COLUMN created_at TYPE timestamptz USING created_at AT TIME ZONE 'UTC',
  ALTER COLUMN updated_at TYPE timestamptz USING updated_at AT TIME ZONE 'UTC',
  ALTER COLUMN archived_at TYPE timestamptz USING archived_at AT TIME ZONE 'UTC';

ALTER TABLE stores
  ADD COLUMN deleted_at timestamptz,
  ADD COLUMN version integer NOT NULL DEFAULT 1,
  ADD COLUMN field_meta jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN updated_by_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN lamport bigint NOT NULL DEFAULT 0,
  ADD COLUMN last_op_id uuid;

ALTER TABLE categories
  ADD COLUMN deleted_at timestamptz,
  ADD COLUMN version integer NOT NULL DEFAULT 1,
  ADD COLUMN field_meta jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN updated_by_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN lamport bigint NOT NULL DEFAULT 0,
  ADD COLUMN last_op_id uuid,
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

-- Pruning by age, per household (§9.2a).
CREATE INDEX sync_changes_household_created ON sync_changes (household_id, created_at);

ALTER TABLE item_stores
  ADD COLUMN version integer NOT NULL DEFAULT 1,
  ADD COLUMN lamport bigint NOT NULL DEFAULT 0,
  ADD COLUMN device_id uuid NOT NULL,
  ADD COLUMN deleted_at timestamptz,
  ADD PRIMARY KEY (item_id, store_id);
CREATE INDEX item_stores_household_live ON item_stores (item_id) WHERE deleted_at IS NULL;
