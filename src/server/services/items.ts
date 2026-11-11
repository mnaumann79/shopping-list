import { and, asc, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { db } from "@/db";
import { categories, itemStores, items, stores } from "@/db/schema";
import { ServiceError } from "./service-error";

type ItemRow = typeof items.$inferSelect;
type StoreRow = typeof stores.$inferSelect;

export type ItemDto = Omit<ItemRow, "createdAt" | "updatedAt" | "archivedAt"> & {
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  storeIds: string[];
};

export type ItemUpdateResult = Omit<ItemDto, "storeIds"> & {
  storeIds?: string[];
};

export type StoreDto = Omit<StoreRow, "createdAt" | "updatedAt"> & {
  createdAt: string;
  updatedAt: string;
};

type CreateItemInput = {
  orgId: string;
  userId: string;
  name: string;
  quantity?: string | null;
  note?: string | null;
  categoryId?: string | null;
  storeIds?: string[];
};

type UpdateItemInput = {
  orgId: string;
  itemId: string;
  updates: {
    name?: string;
    quantity?: string | null;
    note?: string | null;
    categoryId?: string | null;
    isActive?: boolean;
    isChecked?: boolean;
    storeIds?: string[];
  };
};

function toIsoString(value: unknown) {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "string") {
    return value;
  }

  return "";
}

function serializeItem(item: ItemRow, storeIds: string[]): ItemDto {
  return {
    ...item,
    createdAt: toIsoString(item.createdAt),
    updatedAt: toIsoString(item.updatedAt),
    archivedAt: item.archivedAt ? toIsoString(item.archivedAt) : null,
    storeIds,
  };
}

function serializeStore(store: StoreRow): StoreDto {
  return {
    ...store,
    createdAt: toIsoString(store.createdAt),
    updatedAt: toIsoString(store.updatedAt),
  };
}

async function assertCategoryInOrganization(orgId: string, categoryId: string) {
  const [category] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.id, categoryId), eq(categories.organizationId, orgId)))
    .limit(1);

  if (!category) {
    throw new ServiceError(400, "Category not found in active household");
  }
}

async function assertStoresInOrganization(orgId: string, storeIds: string[]) {
  const uniqueStoreIds = [...new Set(storeIds)];
  if (uniqueStoreIds.length === 0) {
    return uniqueStoreIds;
  }

  const matchingStores = await db
    .select({ id: stores.id })
    .from(stores)
    .where(and(eq(stores.organizationId, orgId), eq(stores.isActive, true)));

  const validStoreIds = new Set(matchingStores.map((store) => store.id));
  if (uniqueStoreIds.some((storeId) => !validStoreIds.has(storeId))) {
    throw new ServiceError(400, "One or more stores are not in the active household");
  }

  return uniqueStoreIds;
}

async function listItemRows(orgId: string) {
  const rows = await db
    .select({ item: items, storeId: itemStores.storeId })
    .from(items)
    .leftJoin(itemStores, eq(itemStores.itemId, items.id))
    .where(and(eq(items.organizationId, orgId), eq(items.isActive, true), isNull(items.archivedAt)))
    .orderBy(desc(items.createdAt));

  const grouped = new Map<string, { item: ItemRow; storeIds: string[] }>();

  for (const row of rows) {
    const existing = grouped.get(row.item.id);
    if (existing) {
      if (row.storeId) {
        existing.storeIds.push(row.storeId);
      }
      continue;
    }

    grouped.set(row.item.id, {
      item: row.item,
      storeIds: row.storeId ? [row.storeId] : [],
    });
  }

  return Array.from(grouped.values());
}

export async function listActiveItems(orgId: string): Promise<ItemDto[]> {
  const groupedRows = await listItemRows(orgId);
  return groupedRows.map(({ item, storeIds }) => serializeItem(item, storeIds));
}

export async function listArchivedItems(orgId: string): Promise<ItemDto[]> {
  const rows = await db
    .select({ item: items, storeId: itemStores.storeId })
    .from(items)
    .leftJoin(itemStores, eq(itemStores.itemId, items.id))
    .where(and(eq(items.organizationId, orgId), isNotNull(items.archivedAt)))
    .orderBy(desc(items.archivedAt));

  const grouped = new Map<string, { item: ItemRow; storeIds: string[] }>();
  for (const row of rows) {
    const existing = grouped.get(row.item.id);
    if (existing) {
      if (row.storeId) existing.storeIds.push(row.storeId);
      continue;
    }
    grouped.set(row.item.id, { item: row.item, storeIds: row.storeId ? [row.storeId] : [] });
  }

  return Array.from(grouped.values()).map(({ item, storeIds }) => serializeItem(item, storeIds));
}

export async function listActiveStores(orgId: string): Promise<StoreDto[]> {
  const storeRows = await db
    .select()
    .from(stores)
    .where(and(eq(stores.organizationId, orgId), eq(stores.isActive, true)))
    .orderBy(asc(stores.name));

  return storeRows.map(serializeStore);
}

export async function createItem(input: CreateItemInput): Promise<ItemDto> {
  const { orgId, userId, name, quantity, note, categoryId, storeIds = [] } = input;

  if (categoryId) {
    await assertCategoryInOrganization(orgId, categoryId);
  }

  const validStoreIds = await assertStoresInOrganization(orgId, storeIds);

  const [item] = await db
    .insert(items)
    .values({
      organizationId: orgId,
      name,
      quantity: quantity ?? null,
      note: note ?? null,
      categoryId: categoryId ?? null,
      createdById: userId,
    })
    .returning();

  if (validStoreIds.length > 0) {
    await db
      .insert(itemStores)
      .values(validStoreIds.map((storeId) => ({ itemId: item.id, storeId })));
  }

  return serializeItem(item, validStoreIds);
}

export async function updateItem(input: UpdateItemInput): Promise<ItemUpdateResult> {
  const { orgId, itemId, updates } = input;

  if (updates.categoryId) {
    await assertCategoryInOrganization(orgId, updates.categoryId);
  }

  if (updates.storeIds) {
    updates.storeIds = await assertStoresInOrganization(orgId, updates.storeIds);
  }

  const updateFields: Record<string, unknown> = { updatedAt: new Date() };
  if (updates.name !== undefined) updateFields.name = updates.name;
  if (updates.quantity !== undefined) updateFields.quantity = updates.quantity;
  if (updates.note !== undefined) updateFields.note = updates.note;
  if (updates.categoryId !== undefined) updateFields.categoryId = updates.categoryId;
  if (updates.isActive !== undefined) updateFields.isActive = updates.isActive;
  if (updates.isChecked !== undefined) updateFields.isChecked = updates.isChecked;

  if (updates.storeIds === undefined) {
    const [updated] = await db
      .update(items)
      .set(updateFields)
      .where(and(eq(items.id, itemId), eq(items.organizationId, orgId)))
      .returning();

    if (!updated) {
      throw new ServiceError(404, "Item not found");
    }

    return { ...serializeItem(updated, []), storeIds: undefined };
  }

  const [updated] = await db
    .update(items)
    .set(updateFields)
    .where(and(eq(items.id, itemId), eq(items.organizationId, orgId)))
    .returning();

  if (!updated) {
    throw new ServiceError(404, "Item not found");
  }

  await db.delete(itemStores).where(eq(itemStores.itemId, itemId));

  if (updates.storeIds.length > 0) {
    await db
      .insert(itemStores)
      .values(updates.storeIds.map((storeId) => ({ itemId, storeId })));
  }

  return serializeItem(updated, updates.storeIds);
}

export async function softDeleteItem(orgId: string, itemId: string) {
  const [item] = await db
    .update(items)
    .set({ isActive: false, updatedAt: new Date() })
    .where(and(eq(items.id, itemId), eq(items.organizationId, orgId)))
    .returning();

  if (!item) {
    throw new ServiceError(404, "Item not found");
  }
}

export async function clearCompletedItems(orgId: string): Promise<ItemDto[]> {
  const rows = await db
    .select({ item: items, storeId: itemStores.storeId })
    .from(items)
    .leftJoin(itemStores, eq(itemStores.itemId, items.id))
    .where(and(eq(items.organizationId, orgId), eq(items.isActive, true), eq(items.isChecked, true), isNull(items.archivedAt)));

  const ids = [...new Set(rows.map((r) => r.item.id))];
  if (ids.length > 0) {
    await db
      .update(items)
      .set({ archivedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(items.organizationId, orgId), inArray(items.id, ids)));
  }

  const grouped = new Map<string, { item: ItemRow; storeIds: string[] }>();

  for (const row of rows) {
    const existing = grouped.get(row.item.id);
    if (existing) {
      if (row.storeId) {
        existing.storeIds.push(row.storeId);
      }
      continue;
    }

    grouped.set(row.item.id, {
      item: row.item,
      storeIds: row.storeId ? [row.storeId] : [],
    });
  }

  return Array.from(grouped.values()).map(({ item, storeIds }) => serializeItem(item, storeIds));
}

export async function reAddArchivedItem(orgId: string, itemId: string): Promise<ItemDto> {
  // Restore the original row so its category and store tags remain intact.
  const now = new Date();
  const [item] = await db
    .update(items)
    .set({ archivedAt: null, isChecked: false, createdAt: now, updatedAt: now })
    .where(and(eq(items.id, itemId), eq(items.organizationId, orgId), isNotNull(items.archivedAt)))
    .returning();

  if (!item) throw new ServiceError(404, "Archived item not found");

  const storeRows = await db
    .select({ storeId: itemStores.storeId })
    .from(itemStores)
    .where(eq(itemStores.itemId, itemId));

  return serializeItem(item, storeRows.map((row) => row.storeId));
}
