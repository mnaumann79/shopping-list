import {
  pgTable,
  text,
  timestamp,
  uuid,
  boolean,
  unique,
} from "drizzle-orm/pg-core";
import { organization } from "./auth";
import { user } from "./auth";

export const categories = pgTable(
  "categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    isDefault: boolean("is_default").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    orgNameUnique: unique().on(table.organizationId, table.name),
  })
);

export const stores = pgTable("stores", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const items = pgTable("items", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  quantity: text("quantity"),
  note: text("note"),
  categoryId: uuid("category_id").references(() => categories.id, {
    onDelete: "set null",
  }),
  isActive: boolean("is_active").notNull().default(true),
  isChecked: boolean("is_checked").notNull().default(false),
  archivedAt: timestamp("archived_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  createdById: text("created_by_id").references(() => user.id, {
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
