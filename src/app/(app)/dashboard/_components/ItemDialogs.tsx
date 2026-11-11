"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { INTEGER_ONLY } from "@/lib/utils";
import { toastError } from "@/lib/toast";

type Item = {
  id: string;
  name: string;
  quantity?: string | null;
  note?: string | null;
  categoryId?: string | null;
  isChecked: boolean;
  storeIds?: string[];
};

type Store = { id: string; name: string };
type Category = { id: string; name: string };

interface ItemDialogsProps {
  item: Item;
  stores: Store[];
  categories: Category[];
  isEditing: boolean;
  isViewingNote: boolean;
  onUpdate: (id: string, updates: Partial<Pick<Item, "name" | "quantity" | "note" | "categoryId" | "storeIds">>) => void;
  onCategoryCreated: (category: Category) => void;
  onEditClose: () => void;
  onNoteClose: () => void;
}

export function ItemDialogs({
  item,
  stores,
  categories,
  isEditing,
  isViewingNote,
  onUpdate,
  onCategoryCreated,
  onEditClose,
  onNoteClose,
}: ItemDialogsProps) {
  const [name, setName] = useState(item.name);
  const [quantity, setQuantity] = useState(item.quantity ?? "");
  const [note, setNote] = useState(item.note ?? "");
  const [categoryId, setCategoryId] = useState(item.categoryId ?? "");
  const [selectedStoreIds, setSelectedStoreIds] = useState(item.storeIds ?? []);
  const [showNewCategoryInput, setShowNewCategoryInput] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [creatingCategory, setCreatingCategory] = useState(false);
  const previousCategoryIdRef = useRef(item.categoryId ?? "");

  async function handleCreateCategory() {
    const trimmedName = newCategoryName.trim();
    if (!trimmedName) return;

    setCreatingCategory(true);
    try {
      const response = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmedName }),
      });

      if (!response.ok) throw new Error("Failed to create category");

      const createdCategory = (await response.json()) as Category;
      onCategoryCreated(createdCategory);
      setCategoryId(createdCategory.id);
      setShowNewCategoryInput(false);
      setNewCategoryName("");
      previousCategoryIdRef.current = createdCategory.id;
    } catch {
      void toastError("Failed to create category");
    } finally {
      setCreatingCategory(false);
    }
  }

  function handleSave() {
    const trimmedName = name.trim() || item.name;
    const nextQuantity = quantity.trim() || null;
    const nextNote = note.trim() || null;
    const nextCategoryId = categoryId || null;
    const currentStoreIds = item.storeIds ?? [];
    const storesChanged =
      currentStoreIds.length !== selectedStoreIds.length ||
      currentStoreIds.some((storeId, index) => storeId !== selectedStoreIds[index]);

    const updates: Partial<Pick<Item, "name" | "quantity" | "note" | "categoryId" | "storeIds">> = {};

    if (trimmedName !== item.name) updates.name = trimmedName;
    if (nextQuantity !== (item.quantity ?? null)) updates.quantity = nextQuantity;
    if (nextNote !== (item.note ?? null)) updates.note = nextNote;
    if (nextCategoryId !== (item.categoryId ?? null)) updates.categoryId = nextCategoryId;
    if (storesChanged) updates.storeIds = selectedStoreIds;

    if (Object.keys(updates).length > 0) onUpdate(item.id, updates);
    onEditClose();
  }

  function handleCancel() {
    setShowNewCategoryInput(false);
    setNewCategoryName("");
    onEditClose();
  }

  return (
    <>
      <Dialog open={isEditing} onOpenChange={(open) => !open && onEditClose()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit item</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <label className="text-muted-foreground block text-xs font-medium">
              Name
              <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1" />
            </label>

            <label className="text-muted-foreground block text-xs font-medium">
              Quantity
              <Input
                value={quantity}
                type="tel"
                onChange={(e) => setQuantity(e.target.value.replace(INTEGER_ONLY, ""))}
                className="mt-1"
                placeholder="Optional quantity"
              />
            </label>

            <label className="text-muted-foreground block text-xs font-medium">
              Note
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="border-input focus-visible:border-ring focus-visible:ring-ring/50 mt-1 min-h-20 w-full rounded-lg border bg-transparent px-2.5 py-2 text-base outline-none focus-visible:ring-3 md:text-sm"
                placeholder="Optional note"
              />
            </label>

            <label className="text-muted-foreground block text-xs font-medium">
              Category
              <select
                className="border-input bg-background mt-1 w-full rounded-md border px-3 py-2 text-sm"
                value={showNewCategoryInput ? "__new__" : categoryId}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === "__new__") {
                    previousCategoryIdRef.current = categoryId;
                    setShowNewCategoryInput(true);
                    setNewCategoryName("");
                    return;
                  }
                  setCategoryId(val);
                  setShowNewCategoryInput(false);
                }}
              >
                <option value="">No category</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
                <option value="__new__">+ New category</option>
              </select>
            </label>

            {showNewCategoryInput && (
              <div className="space-y-2">
                <Input
                  autoFocus
                  aria-label="New category name"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { e.preventDefault(); void handleCreateCategory(); }
                    if (e.key === "Escape") {
                      setShowNewCategoryInput(false);
                      setNewCategoryName("");
                      setCategoryId(previousCategoryIdRef.current);
                    }
                  }}
                  placeholder="Category name"
                />
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => void handleCreateCategory()}
                    disabled={creatingCategory || !newCategoryName.trim()}
                  >
                    {creatingCategory ? "Adding..." : "Add category"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setShowNewCategoryInput(false);
                      setNewCategoryName("");
                      setCategoryId(previousCategoryIdRef.current);
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <span className="text-muted-foreground block text-xs font-medium">Stores</span>
              {stores.length === 0 ? (
                <a href="/household/settings" className="text-muted-foreground text-xs underline underline-offset-2">
                  No stores added. Add one in Settings.
                </a>
              ) : (
                <div className="space-y-2">
                  {stores.map((store) => (
                    <label key={store.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={selectedStoreIds.includes(store.id)}
                        onChange={() => {
                          const next = selectedStoreIds.includes(store.id)
                            ? selectedStoreIds.filter((id) => id !== store.id)
                            : [...selectedStoreIds, store.id];
                          setSelectedStoreIds(next);
                        }}
                      />
                      <span>{store.name}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={handleCancel}>
              Discard
            </Button>
            <Button type="button" variant="default" size="sm" onClick={handleSave}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isViewingNote} onOpenChange={(open) => !open && onNoteClose()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-base">{item.name}</DialogTitle>
          </DialogHeader>
          <p className="text-foreground text-sm whitespace-pre-wrap">{item.note}</p>
        </DialogContent>
      </Dialog>
    </>
  );
}
