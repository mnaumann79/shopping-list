import {
  pgTable,
  text,
  timestamp,
  uuid,
  boolean,
  unique,
} from "drizzle-orm/pg-core";
import { households } from "./households";
import { authUsers } from "./supabase";

export const categories = pgTable(
  "categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    isDefault: boolean("is_default").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    householdNameUnique: unique().on(table.householdId, table.name),
  })
);

export const stores = pgTable("stores", {
  id: uuid("id").primaryKey().defaultRandom(),
  householdId: uuid("household_id")
    .notNull()
    .references(() => households.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const items = pgTable("items", {
  id: uuid("id").primaryKey().defaultRandom(),
  householdId: uuid("household_id")
    .notNull()
    .references(() => households.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  quantity: text("quantity"),
  note: text("note"),
  categoryId: uuid("category_id").references(() => categories.id, {
    onDelete: "set null",
  }),
  isActive: boolean("is_active").notNull().default(true),
  isChecked: boolean("is_checked").notNull().default(false),
  archivedAt: timestamp("archived_at"),
  // The tombstone (B-11). NULL is a live item, a timestamp is a deleted one;
  // archived_at keeps its own meaning - cleared, and recoverable.
  //
  // is_active above is what the delete wrote before this column existed. It
  // is left in place and unused, and a later migration drops it
  // (docs/project.md §9.1). Nothing keeps the two in step.
  deletedAt: timestamp("deleted_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  createdById: uuid("created_by_id").references(() => authUsers.id, {
    onDelete: "set null",
  }),
});

// Junction table for item-to-store tags (many-to-many)
export const itemStores = pgTable("item_stores", {
  itemId: uuid("item_id")
    .notNull()
    .references(() => items.id, { onDelete: "cascade" }),
  storeId: uuid("store_id")
    .notNull()
    .references(() => stores.id, { onDelete: "cascade" }),
});
