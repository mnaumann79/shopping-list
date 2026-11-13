import { and, asc, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { categories, itemStores, items, stores } from "@/db/schema";
import { withScope, type Scope, type Tx } from "@/db/scope";
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
  scope: Scope;
  name: string;
  quantity?: string | null;
  note?: string | null;
  categoryId?: string | null;
  storeIds?: string[];
};

type UpdateItemInput = {
  scope: Scope;
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

/**
 * The household's categories, read through the transaction the scope helper
 * opened. The household predicate stays: it is the application layer of the
 * isolation, and the policies are the second one behind it (ADR-12).
 */
async function assertCategoryInHousehold(tx: Tx, householdId: string, categoryId: string) {
  const [category] = await tx
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.id, categoryId), eq(categories.householdId, householdId)))
    .limit(1);

  if (!category) {
    throw new ServiceError(400, "Category not found in active household");
  }
}

async function assertStoresInHousehold(tx: Tx, householdId: string, storeIds: string[]) {
  const uniqueStoreIds = [...new Set(storeIds)];
  if (uniqueStoreIds.length === 0) {
    return uniqueStoreIds;
  }

  const matchingStores = await tx
    .select({ id: stores.id })
    .from(stores)
    .where(and(eq(stores.householdId, householdId), eq(stores.isActive, true)));

  const validStoreIds = new Set(matchingStores.map((store) => store.id));
  if (uniqueStoreIds.some((storeId) => !validStoreIds.has(storeId))) {
    throw new ServiceError(400, "One or more stores are not in the active household");
  }

  return uniqueStoreIds;
}

async function listItemRows(tx: Tx, householdId: string) {
  const rows = await tx
    .select({ item: items, storeId: itemStores.storeId })
    .from(items)
    .leftJoin(itemStores, eq(itemStores.itemId, items.id))
    .where(and(eq(items.householdId, householdId), eq(items.isActive, true), isNull(items.archivedAt)))
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

export async function listActiveItems(scope: Scope): Promise<ItemDto[]> {
  const groupedRows = await withScope(scope, (tx) => listItemRows(tx, scope.householdId));
  return groupedRows.map(({ item, storeIds }) => serializeItem(item, storeIds));
}

export async function listArchivedItems(scope: Scope): Promise<ItemDto[]> {
  const rows = await withScope(scope, async (tx) => {
    const archived = await tx
      .select({ item: items, storeId: itemStores.storeId })
      .from(items)
      .leftJoin(itemStores, eq(itemStores.itemId, items.id))
      .where(and(eq(items.householdId, scope.householdId), isNotNull(items.archivedAt)))
      .orderBy(desc(items.archivedAt));

    return archived;
  });

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

export async function listActiveStores(scope: Scope): Promise<StoreDto[]> {
  const storeRows = await withScope(scope, (tx) =>
    tx
      .select()
      .from(stores)
      .where(and(eq(stores.householdId, scope.householdId), eq(stores.isActive, true)))
      .orderBy(asc(stores.name)),
  );

  return storeRows.map(serializeStore);
}

export async function createItem(input: CreateItemInput): Promise<ItemDto> {
  const { scope, name, quantity, note, categoryId, storeIds = [] } = input;

  const created = await withScope(scope, async (tx) => {
    if (categoryId) {
      await assertCategoryInHousehold(tx, scope.householdId, categoryId);
    }

    const validStoreIds = await assertStoresInHousehold(tx, scope.householdId, storeIds);

    const [item] = await tx
      .insert(items)
      .values({
        householdId: scope.householdId,
        name,
        quantity: quantity ?? null,
        note: note ?? null,
        categoryId: categoryId ?? null,
        createdById: scope.userId,
      })
      .returning();

    if (validStoreIds.length > 0) {
      await tx
        .insert(itemStores)
        .values(validStoreIds.map((storeId) => ({ itemId: item.id, storeId })));
    }

    return { item, validStoreIds };
  });

  return serializeItem(created.item, created.validStoreIds);
}

export async function updateItem(input: UpdateItemInput): Promise<ItemUpdateResult> {
  const { scope, itemId, updates } = input;

  return withScope(scope, async (tx) => {
    if (updates.categoryId) {
      await assertCategoryInHousehold(tx, scope.householdId, updates.categoryId);
    }

    if (updates.storeIds) {
      updates.storeIds = await assertStoresInHousehold(tx, scope.householdId, updates.storeIds);
    }

    const updateFields: Record<string, unknown> = { updatedAt: new Date() };
    if (updates.name !== undefined) updateFields.name = updates.name;
    if (updates.quantity !== undefined) updateFields.quantity = updates.quantity;
    if (updates.note !== undefined) updateFields.note = updates.note;
    if (updates.categoryId !== undefined) updateFields.categoryId = updates.categoryId;
    if (updates.isActive !== undefined) updateFields.isActive = updates.isActive;
    if (updates.isChecked !== undefined) updateFields.isChecked = updates.isChecked;

    if (updates.storeIds === undefined) {
      const [updated] = await tx
        .update(items)
        .set(updateFields)
        .where(and(eq(items.id, itemId), eq(items.householdId, scope.householdId)))
        .returning();

      if (!updated) {
        throw new ServiceError(404, "Item not found");
      }

      return { ...serializeItem(updated, []), storeIds: undefined };
    }

    const [updated] = await tx
      .update(items)
      .set(updateFields)
      .where(and(eq(items.id, itemId), eq(items.householdId, scope.householdId)))
      .returning();

    if (!updated) {
      throw new ServiceError(404, "Item not found");
    }

    await tx.delete(itemStores).where(eq(itemStores.itemId, itemId));

    if (updates.storeIds.length > 0) {
      await tx
        .insert(itemStores)
        .values(updates.storeIds.map((storeId) => ({ itemId, storeId })));
    }

    return serializeItem(updated, updates.storeIds);
  });
}

export async function softDeleteItem(scope: Scope, itemId: string) {
  await withScope(scope, async (tx) => {
    const [item] = await tx
      .update(items)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(items.id, itemId), eq(items.householdId, scope.householdId)))
      .returning();

    if (!item) {
      throw new ServiceError(404, "Item not found");
    }
  });
}

export async function clearCompletedItems(scope: Scope): Promise<ItemDto[]> {
  const rows = await withScope(scope, async (tx) => {
    const completed = await tx
      .select({ item: items, storeId: itemStores.storeId })
      .from(items)
      .leftJoin(itemStores, eq(itemStores.itemId, items.id))
      .where(and(eq(items.householdId, scope.householdId), eq(items.isActive, true), eq(items.isChecked, true), isNull(items.archivedAt)));

    const ids = [...new Set(completed.map((r) => r.item.id))];
    if (ids.length > 0) {
      await tx
        .update(items)
        .set({ archivedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(items.householdId, scope.householdId), inArray(items.id, ids)));
    }

    return completed;
  });

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

export async function reAddArchivedItem(scope: Scope, itemId: string): Promise<ItemDto> {
  // Restore the original row so its category and store tags remain intact.
  const now = new Date();

  return withScope(scope, async (tx) => {
    const [item] = await tx
      .update(items)
      .set({ archivedAt: null, isChecked: false, createdAt: now, updatedAt: now })
      .where(and(eq(items.id, itemId), eq(items.householdId, scope.householdId), isNotNull(items.archivedAt)))
      .returning();

    if (!item) throw new ServiceError(404, "Archived item not found");

    const storeRows = await tx
      .select({ storeId: itemStores.storeId })
      .from(itemStores)
      .where(eq(itemStores.itemId, itemId));

    return serializeItem(item, storeRows.map((row) => row.storeId));
  });
}
