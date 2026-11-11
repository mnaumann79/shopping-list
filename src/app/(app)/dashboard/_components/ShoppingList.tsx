"use client";

import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import { ArrowDown } from "lucide-react";
import { ItemRow } from "./ItemRow";
import { QuickAddBar } from "./QuickAddBar";
import { toastError } from "@/lib/toast";

const OrganizeTripBarLazy = dynamic(
  () => import("./OrganizeTripBar").then((m) => ({ default: m.OrganizeTripBar })),
  { ssr: false }
);

type Item = {
  id: string;
  name: string;
  quantity: string | null;
  note: string | null;
  categoryId: string | null;
  isActive: boolean;
  isChecked: boolean;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  createdById: string | null;
  organizationId: string;
  storeIds: string[];
};

type Category = {
  id: string;
  name: string;
};

type Store = {
  id: string;
  name: string;
};

type Group = {
  id: string;
  name: string;
  items: Item[];
};

type OrganizationMode = "category" | "alphabetical" | "store";

interface ShoppingListProps {
  initialItems: Item[];
  categories: Category[];
  stores: Store[];
}

type ItemRowProps = {
  item: Item;
  stores: Store[];
  categories: Category[];
  onUpdate: (id: string, updates: Partial<Pick<Item, "name" | "quantity" | "note" | "categoryId" | "storeIds">>) => void;
  onToggleChecked: (id: string, nextChecked: boolean) => void;
  onDelete: (id: string) => void;
  onCategoryCreated: (category: Category) => void;
};

function CompletedSection({
  completedItems,
  stores,
  categories,
  onUpdate,
  onToggleChecked,
  onDelete,
  onCategoryCreated,
  onClearCompleted,
}: {
  completedItems: Item[];
} & Omit<ItemRowProps, "item"> & { onClearCompleted: () => void }) {
  return (
    <section>
      <div className="flex items-center justify-between py-2">
        <h2 className="text-muted-foreground text-sm font-medium">
          Completed ({completedItems.length})
        </h2>
        <button
          type="button"
          className="rounded-full border bg-background px-3 py-1.5 text-sm text-foreground"
          onClick={() => void onClearCompleted()}
        >
          Clear completed
        </button>
      </div>
      <div className="divide-y">
        {completedItems.map((item) => (
          <ItemRow
            key={item.id}
            item={item}
            stores={stores}
            categories={categories}
            onUpdate={onUpdate}
            onToggleChecked={onToggleChecked}
            onDelete={onDelete}
            onCategoryCreated={onCategoryCreated}
          />
        ))}
      </div>
    </section>
  );
}

const TRIP_STORE_FILTER_KEY = "shopping-trip-store-filter";
const TRIP_ORGANIZATION_MODE_KEY = "shopping-trip-organization-mode";
const LAST_STORE_KEY = "shopping-last-store";
const ALL_STORES_FILTER = "all";
const UNCATEGORIZED_GROUP_ID = "uncategorized";
const UNTAGGED_GROUP_ID = "untagged";
const DEFAULT_ORGANIZATION_MODE: OrganizationMode = "category";
const PREFERENCE_CHANGE_EVENT = "shopping-preference-change";

function subscribeToPreferenceChanges(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(PREFERENCE_CHANGE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(PREFERENCE_CHANGE_EVENT, callback);
  };
}

function savePreference(key: string, value: string) {
  window.localStorage.setItem(key, value);
  window.dispatchEvent(new Event(PREFERENCE_CHANGE_EVENT));
}

function readStoreFilter() {
  if (typeof window === "undefined") {
    return ALL_STORES_FILTER;
  }

  return window.localStorage.getItem(TRIP_STORE_FILTER_KEY) ?? ALL_STORES_FILTER;
}

function readLastStore(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  return window.localStorage.getItem(LAST_STORE_KEY);
}

function readOrganizationMode(): OrganizationMode {
  if (typeof window === "undefined") {
    return DEFAULT_ORGANIZATION_MODE;
  }

  const stored = window.localStorage.getItem(TRIP_ORGANIZATION_MODE_KEY);
  if (stored === "alphabetical" || stored === "store") {
    return stored;
  }

  return DEFAULT_ORGANIZATION_MODE;
}

function applyStoreFilter(items: Item[], selectedStoreId: string) {
  if (selectedStoreId === ALL_STORES_FILTER) {
    return items;
  }

  return items.filter((item) => item.storeIds.length === 0 || item.storeIds.includes(selectedStoreId));
}

function partitionItems(items: Item[]) {
  return {
    activeItems: items.filter((item) => !item.isChecked),
    completedItems: items.filter((item) => item.isChecked),
  };
}

function groupByCategory(items: Item[], categories: Category[]) {
  const groups: Group[] = [];

  for (const category of categories) {
    const categoryItems = items.filter((item) => item.categoryId === category.id);
    if (categoryItems.length > 0) {
      groups.push({
        id: category.id,
        name: category.name,
        items: categoryItems,
      });
    }
  }

  const uncategorizedItems = items.filter((item) => item.categoryId === null);
  if (uncategorizedItems.length > 0) {
    groups.push({
      id: UNCATEGORIZED_GROUP_ID,
      name: "Uncategorized",
      items: uncategorizedItems,
    });
  }

  return groups;
}

function sortAlphabetically(items: Item[]) {
  return [...items].sort((left, right) => left.name.localeCompare(right.name));
}

function groupByStore(items: Item[], stores: Store[]) {
  const groups: Group[] = [];

  for (const store of stores) {
    const storeItems = items.filter((item) => item.storeIds.includes(store.id));
    if (storeItems.length > 0) {
      groups.push({
        id: store.id,
        name: store.name,
        items: sortAlphabetically(storeItems),
      });
    }
  }

  const untaggedItems = items.filter((item) => item.storeIds.length === 0);
  if (untaggedItems.length > 0) {
    groups.push({
      id: UNTAGGED_GROUP_ID,
      name: "Untagged",
      items: sortAlphabetically(untaggedItems),
    });
  }

  // Sort groups alphabetically, with Untagged at the end
  groups.sort((a, b) => {
    if (a.id === UNTAGGED_GROUP_ID) return 1;
    if (b.id === UNTAGGED_GROUP_ID) return -1;
    return a.name.localeCompare(b.name);
  });

  return groups;
}

function groupActiveItems(items: Item[], organizationMode: OrganizationMode, categories: Category[], stores: Store[]) {
  if (organizationMode === "store") {
    return groupByStore(items, stores);
  }

  return groupByCategory(items, categories);
}

function getStoreName(selectedStoreId: string, stores: Store[]) {
  if (selectedStoreId === ALL_STORES_FILTER) {
    return "All stores";
  }

  return stores.find((store) => store.id === selectedStoreId)?.name ?? "this store";
}

export function ShoppingList({ initialItems, categories, stores }: ShoppingListProps) {
  const [items, setItems] = useState(initialItems);
  const [categoryList, setCategoryList] = useState(categories);
  const selectedStorePreference = useSyncExternalStore(
    subscribeToPreferenceChanges,
    readStoreFilter,
    () => ALL_STORES_FILTER
  );
  const organizationMode = useSyncExternalStore(
    subscribeToPreferenceChanges,
    readOrganizationMode,
    () => DEFAULT_ORGANIZATION_MODE
  );
  const activeStoreIds = useMemo(
    () => new Set(items.filter((item) => item.isActive).flatMap((item) => item.storeIds)),
    [items]
  );
  const selectedStoreId = selectedStorePreference === ALL_STORES_FILTER || activeStoreIds.has(selectedStorePreference)
    ? selectedStorePreference
    : ALL_STORES_FILTER;

  const filteredItems = useMemo(
    () => applyStoreFilter(items.filter((item) => item.isActive), selectedStoreId),
    [items, selectedStoreId]
  );

  const { activeItems, completedItems: unsortedCompletedItems } = useMemo(
    () => partitionItems(filteredItems),
    [filteredItems]
  );

  const completedItems = useMemo(
    () => sortAlphabetically(unsortedCompletedItems),
    [unsortedCompletedItems]
  );

  const alphabeticalItems = useMemo(
    () => sortAlphabetically(activeItems),
    [activeItems]
  );

  const groupedActiveItems = useMemo(
    () => groupActiveItems(activeItems, organizationMode, categoryList, stores),
    [activeItems, organizationMode, categoryList, stores]
  );

  const selectedStoreName = useMemo(
    () => getStoreName(selectedStoreId, stores),
    [selectedStoreId, stores]
  );

  const visibleStores = useMemo(
    () => stores.filter((store) => activeStoreIds.has(store.id)),
    [stores, activeStoreIds]
  );

  // QuickAddBar store selection — owned here so item adds don't reset it
  const [quickAddStoreId, setQuickAddStoreId] = useState(() => {
    const stored = readLastStore();
    return stored && stores.some((s) => s.id === stored) ? stored : "";
  });

  function handleStoreFilterChange(storeId: string) {
    savePreference(TRIP_STORE_FILTER_KEY, storeId);
    if (storeId !== ALL_STORES_FILTER) {
      setQuickAddStoreId(storeId);
    }
  }

  const handleAdd = useCallback(async ({
    name,
    quantity,
    storeIds,
  }: {
    name: string;
    quantity: string | null;
    storeIds: string[];
  }) => {
    const tempItem: Item = {
      id: `temp-${Date.now()}`,
      name,
      quantity,
      note: null,
      categoryId: null,
      isActive: true,
      isChecked: false,
      archivedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdById: null,
      organizationId: "",
      storeIds: storeIds,
    };

    setItems((current) => [tempItem, ...current]);

    try {
      const res = await fetch("/api/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, quantity, categoryId: null, storeIds }),
      });
      if (!res.ok) {
        throw new Error("Failed to add item");
      }

      const created = await res.json();
      const confirmedStoreIds = created.storeIds ?? storeIds;
      // Persist confirmed storeIds to localStorage
      if (confirmedStoreIds.length > 0 && typeof window !== "undefined") {
        window.localStorage.setItem(LAST_STORE_KEY, confirmedStoreIds[0]);
      }
      setItems((current) =>
        current.map((item) => (item.id === tempItem.id ? { ...created, storeIds: confirmedStoreIds } : item))
      );
    } catch {
      setItems((current) => current.filter((item) => item.id !== tempItem.id));
      void toastError("Failed to add item");
    }
  }, []);

  const handleUpdate = useCallback(async (
    id: string,
    updates: Partial<Pick<Item, "name" | "quantity" | "note" | "categoryId" | "storeIds">>
  ) => {
    let previous: Item[] = [];
    setItems((current) => {
      previous = current;
      const existing = current.find((item) => item.id === id);
      if (!existing) return current;
      const optimistic: Item = {
        ...existing,
        ...updates,
        storeIds: updates.storeIds ?? existing.storeIds,
        updatedAt: new Date().toISOString(),
      };
      return current.map((item) => (item.id === id ? optimistic : item));
    });

    // Update last-used store when storeIds is explicitly changed
    if (updates.storeIds && updates.storeIds.length > 0 && typeof window !== "undefined") {
      window.localStorage.setItem(LAST_STORE_KEY, updates.storeIds[0]);
    }

    try {
      const res = await fetch(`/api/items/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (!res.ok) {
        const errorBody = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(errorBody?.error ?? "Failed to update item");
      }

      const updated = await res.json();
      setItems((current) =>
        current.map((item) =>
          item.id === id
            ? {
                ...item,
                ...updated,
                storeIds: updated.storeIds ?? item.storeIds,
              }
            : item
        )
      );
    } catch (error) {
      setItems(previous);
      void toastError(error instanceof Error ? error.message : "Failed to save item");
    }
  }, []);

  const handleToggleChecked = useCallback(async (id: string, nextChecked: boolean) => {
    let previous: Item[] = [];
    setItems((current) => {
      previous = current;
      const existing = current.find((item) => item.id === id);
      if (!existing) return current;
      return current.map((item) =>
        item.id === id
          ? { ...item, isChecked: nextChecked, updatedAt: new Date().toISOString() }
          : item
      );
    });

    try {
      const res = await fetch(`/api/items/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isChecked: nextChecked }),
      });
      if (!res.ok) {
        throw new Error("Failed to toggle checked state");
      }

      const updated = await res.json();
      setItems((current) => current.map((item) => (item.id === id ? { ...item, ...updated } : item)));
    } catch {
      setItems(previous);
      void toastError("Failed to update item");
    }
  }, []);

  const handleCategoryCreated = useCallback((category: Category) => {
    setCategoryList((current) => {
      if (current.some((existing) => existing.id === category.id)) {
        return current;
      }

      return [...current, category];
    });
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    let previous: Item[] = [];
    setItems((current) => {
      previous = current;
      return current.filter((item) => item.id !== id);
    });

    try {
      const res = await fetch(`/api/items/${id}`, { method: "DELETE" });
      if (!res.ok) {
        throw new Error("Failed to delete item");
      }
    } catch {
      setItems(previous);
      void toastError("Failed to delete item");
    }
  }, []);

  async function handleClearCompleted() {
    try {
      if (!window.confirm("Clear all completed items?")) {
        return;
      }

      const res = await fetch("/api/items/clear-completed", { method: "POST" });
      if (!res.ok) {
        throw new Error("Failed to clear completed items");
      }

      const data = (await res.json()) as { clearedItems: Item[] };
      if (data.clearedItems.length === 0) {
        return;
      }

      const clearedIds = new Set(data.clearedItems.map((item) => item.id));
      setItems((current) => current.filter((item) => !clearedIds.has(item.id)));
      const { toast } = await import("sonner");
      toast(`Archived ${data.clearedItems.length} completed item${data.clearedItems.length === 1 ? "" : "s"}. Re-add them from History.`);
    } catch {
      void toastError("Failed to clear completed items");
    }
  }

  return (
    <div className="pb-48">
      <QuickAddBar onAdd={(values) => handleAdd(values)} selectedStoreId={quickAddStoreId} onStoreChange={setQuickAddStoreId} stores={stores} />

      {/* Store focus — between QuickAddBar and items list */}
      <div className="border-b px-4 py-3">
        <div className="flex gap-2 overflow-x-auto overscroll-x-contain pb-1">
          <button
            type="button"
            aria-pressed={selectedStoreId === ALL_STORES_FILTER}
            className={`rounded-full border px-3 py-1.5 text-sm whitespace-nowrap transition ${
              selectedStoreId === ALL_STORES_FILTER
                ? "border-foreground bg-foreground text-background"
                : "bg-background text-foreground"
            }`}
            onClick={() => handleStoreFilterChange(ALL_STORES_FILTER)}
          >
            All stores
          </button>
          {visibleStores.map((store) => (
            <button
              key={store.id}
              type="button"
              aria-pressed={selectedStoreId === store.id}
              className={`rounded-full border px-3 py-1.5 text-sm whitespace-nowrap transition ${
                selectedStoreId === store.id
                  ? "border-foreground bg-foreground text-background"
                  : "bg-background text-foreground"
              }`}
              onClick={() => handleStoreFilterChange(store.id)}
            >
              {store.name}
            </button>
          ))}
        </div>
      </div>

      {groupedActiveItems.length === 0 && completedItems.length === 0 ? (
        <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 px-4 text-center">
          <p className="text-lg font-medium">Your list is empty. Add your first item below.</p>
          <ArrowDown className="text-muted-foreground h-5 w-5" />
        </div>
      ) : activeItems.length === 0 ? (
        <div className="space-y-4 p-4">
          <div className="bg-muted/30 rounded-2xl border border-dashed px-4 py-8 text-center">
            <p className="text-lg font-medium">No active items for {selectedStoreName} right now.</p>
            <p className="text-muted-foreground mt-2 text-sm">
              {completedItems.length > 0
                ? "Completed items are still available below."
                : "Switch stores or add something new to keep shopping moving."}
            </p>
          </div>

          {completedItems.length > 0 && (
            <CompletedSection
              completedItems={completedItems}
              stores={stores}
              categories={categoryList}
              onUpdate={handleUpdate}
              onToggleChecked={handleToggleChecked}
              onDelete={handleDelete}
              onCategoryCreated={handleCategoryCreated}
              onClearCompleted={handleClearCompleted}
            />
          )}
        </div>
      ) : (
        <div className="space-y-4 p-4">
          {organizationMode === "alphabetical" ? (
            <div className="divide-y">
              {alphabeticalItems.map((item) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  stores={stores}
                  categories={categoryList}
                  onUpdate={handleUpdate}
                  onToggleChecked={handleToggleChecked}
                  onDelete={handleDelete}
                  onCategoryCreated={handleCategoryCreated}
                />
              ))}
            </div>
          ) : organizationMode === "store" && selectedStoreId !== ALL_STORES_FILTER ? (
            <div className="divide-y">
              {groupedActiveItems
                .flatMap((group) => group.items)
                .map((item) => (
                  <ItemRow
                    key={item.id}
                    item={item}
                    stores={stores}
                    categories={categoryList}
                    onUpdate={handleUpdate}
                    onToggleChecked={handleToggleChecked}
                    onDelete={handleDelete}
                    onCategoryCreated={handleCategoryCreated}
                  />
                ))}
            </div>
          ) : (
            groupedActiveItems.map((group) => (
              <section key={group.id}>
                <h2 className="text-muted-foreground py-2 text-sm font-medium">
                  {group.name} ({group.items.length})
                </h2>
                <div className="divide-y">
                  {group.items.map((item) => (
                    <ItemRow
                      key={item.id}
                      item={item}
                      stores={stores}
                      categories={categoryList}
                      onUpdate={handleUpdate}
                      onToggleChecked={handleToggleChecked}
                      onDelete={handleDelete}
                      onCategoryCreated={handleCategoryCreated}
                    />
                  ))}
                </div>
              </section>
            ))
          )}

          {completedItems.length > 0 && (
            <CompletedSection
              completedItems={completedItems}
              stores={stores}
              categories={categoryList}
              onUpdate={handleUpdate}
              onToggleChecked={handleToggleChecked}
              onDelete={handleDelete}
              onCategoryCreated={handleCategoryCreated}
              onClearCompleted={handleClearCompleted}
            />
          )}
        </div>
      )}

      <OrganizeTripBarLazy
        organizationMode={organizationMode}
        setOrganizationMode={(mode) => savePreference(TRIP_ORGANIZATION_MODE_KEY, mode)}
      />
    </div>
  );
}
