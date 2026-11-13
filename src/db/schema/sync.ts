import {
  bigint,
  bigserial,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { households } from "./households";
import { authUsers } from "./supabase";

// The change log: one row per applied change, per household. Append-only.
export const syncChanges = pgTable(
  "sync_changes",
  {
    seq: bigserial("seq", { mode: "number" }).primaryKey(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    // NULL when there is no originating operation (the seeded default
    // categories).
    opId: uuid("op_id"),
    version: integer("version").notNull(),
    lamport: bigint("lamport", { mode: "number" }).notNull(),
    deviceId: uuid("device_id").notNull(),
    actorId: uuid("actor_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "restrict" }),
    // The full entity snapshot after the change.
    payload: jsonb("payload").notNull(),
    deleted: boolean("deleted").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    householdSeqIndex: index("sync_changes_household_seq").on(
      table.householdId,
      table.seq,
    ),
    householdCreatedIndex: index("sync_changes_household_created").on(
      table.householdId,
      table.createdAt,
    ),
  }),
);

// The idempotency ledger. The primary key IS the idempotency guarantee, and
// the rows are never pruned: the ledger must outlive the change log.
export const syncOperations = pgTable(
  "sync_operations",
  {
    opId: uuid("op_id").primaryKey(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    deviceId: uuid("device_id").notNull(),
    actorId: uuid("actor_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "restrict" }),
    entityType: text("entity_type").notNull(),
    // NULL for a multi-entity operation: the operation's identity is its
    // op_id, and a bulk operation spans several entities.
    entityId: uuid("entity_id"),
    opType: text("op_type").notNull(),
    lamport: bigint("lamport", { mode: "number" }).notNull(),
    payload: jsonb("payload").notNull(),
    // The operation's derived envelope, cached for replay.
    result: jsonb("result").notNull(),
    outcome: text("outcome").notNull(),
    appliedAt: timestamp("applied_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    householdIndex: index("sync_operations_household").on(
      table.householdId,
      table.appliedAt,
    ),
  }),
);

// The known devices of a household.
export const devices = pgTable(
  "devices",
  {
    id: uuid("id").notNull(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    // The epoch this device last synced against.
    epoch: uuid("epoch"),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    pkey: primaryKey({
      columns: [table.householdId, table.id],
      name: "devices_pkey",
    }),
  }),
);

// The per-household sync state: the Lamport clock, the change-log retention
// floor and the sync epoch.
export const householdSyncState = pgTable("household_sync_state", {
  householdId: uuid("household_id")
    .primaryKey()
    .references(() => households.id, { onDelete: "cascade" }),
  // Regenerated when a full resync occurs.
  epoch: uuid("epoch").notNull(),
  minRetainedSeq: bigint("min_retained_seq", { mode: "number" })
    .notNull()
    .default(0),
  lamport: bigint("lamport", { mode: "number" }).notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// The conflicts the server resolved, surfaced to the losing device.
export const entityConflicts = pgTable(
  "entity_conflicts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    field: text("field").notNull(),
    // The cursor for delivering conflicts to other devices.
    seq: bigserial("seq", { mode: "number" }).notNull(),
    localValue: jsonb("local_value"),
    serverValue: jsonb("server_value"),
    // The contested tag pair, for item.storeTags.
    storeId: uuid("store_id"),
    // 'lww' | 'check_wins' | 'delete_wins' | 'removal_wins' | 'override' |
    // 'rejected'
    resolution: text("resolution").notNull(),
    // The device whose value won (NULL for a server-side rejection).
    winnerDeviceId: uuid("winner_device_id"),
    winnerLamport: bigint("winner_lamport", { mode: "number" }),
    opId: uuid("op_id").notNull(),
    deviceId: uuid("device_id").notNull(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    seqIndex: uniqueIndex("entity_conflicts_seq").on(table.seq),
    householdSeqIndex: index("entity_conflicts_household_seq").on(
      table.householdId,
      table.seq,
    ),
  }),
);
