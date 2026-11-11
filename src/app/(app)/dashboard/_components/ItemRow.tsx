"use client";

import { memo, useState } from "react";
import dynamic from "next/dynamic";
import { Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";

const ItemDialogs = dynamic(
  () => import("./ItemDialogs").then((m) => ({ default: m.ItemDialogs })),
  { ssr: false }
);

type Item = {
  id: string;
  name: string;
  quantity?: string | null;
  note?: string | null;
  categoryId?: string | null;
  isChecked: boolean;
  storeIds?: string[];
};

type Store = {
  id: string;
  name: string;
};

type Category = {
  id: string;
  name: string;
};

interface ItemRowProps {
  item: Item;
  stores: Store[];
  categories: Category[];
  onUpdate: (id: string, updates: Partial<Pick<Item, "name" | "quantity" | "note" | "categoryId" | "storeIds">>) => void;
  onToggleChecked: (itemId: string, nextChecked: boolean) => void;
  onDelete: (id: string) => void;
  onCategoryCreated: (category: Category) => void;
}

export const ItemRow = memo(function ItemRow({
  item,
  stores,
  categories,
  onUpdate,
  onToggleChecked,
  onDelete,
  onCategoryCreated,
}: ItemRowProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isViewingNote, setIsViewingNote] = useState(false);

  const itemStores = (item.storeIds ?? [])
    .map((id) => stores.find((s) => s.id === id))
    .filter((s): s is Store => Boolean(s));
  const firstStore = itemStores[0];
  const storeAbbr = firstStore ? firstStore.name.slice(0, 2).toUpperCase() : "";

  return (
    <div className="flex items-center gap-2 border-b last:border-b-0">
      <button
        type="button"
        className={cn(
          "flex min-h-13 min-w-0 flex-1 items-center gap-4 py-2 text-left",
          item.isChecked && "line-through opacity-50"
        )}
        aria-label={item.name}
        data-checked={item.isChecked ? "true" : "false"}
        onClick={() => onToggleChecked(item.id, !item.isChecked)}
      >
        <span className="min-w-0 flex-1 truncate text-sm">{item.name}</span>
        <span className="text-muted-foreground w-8 shrink-0 text-right text-sm">{item.quantity}</span>
        <span className="bg-accent text-accent-foreground w-8 shrink-0 rounded-full px-1.5 py-0.5 text-center text-[10px] font-medium">
          {storeAbbr}
        </span>
      </button>
      {item.note ? (
        <button
          type="button"
          aria-label={`View note for ${item.name}`}
          className="text-muted-foreground hover:text-foreground w-17 shrink-0 truncate text-sm"
          onClick={(e) => {
            e.stopPropagation();
            setIsViewingNote(true);
          }}
        >
          {item.note}
        </button>
      ) : (
        <div className="w-17"></div>
      )}
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          aria-label={`Edit ${item.name}`}
          className="text-muted-foreground hover:bg-accent focus-visible:ring-ring flex h-9 w-9 items-center justify-center rounded-md border focus-visible:ring-2 focus-visible:outline-none"
          onClick={() => setIsEditing(true)}
        >
          <Pencil className="size-4" />
        </button>
        <button
          type="button"
          aria-label={`Delete ${item.name}`}
          className="text-muted-foreground hover:bg-accent hover:text-destructive focus-visible:ring-ring flex h-9 w-9 items-center justify-center rounded-md border focus-visible:ring-2 focus-visible:outline-none"
          onClick={() => {
            onDelete(item.id);
            void toast("Item removed");
          }}
        >
          <Trash2 className="size-4" />
        </button>
      </div>

      {(isEditing || isViewingNote) && (
        <ItemDialogs
          item={item}
          stores={stores}
          categories={categories}
          isEditing={isEditing}
          isViewingNote={isViewingNote}
          onUpdate={onUpdate}
          onCategoryCreated={onCategoryCreated}
          onEditClose={() => setIsEditing(false)}
          onNoteClose={() => setIsViewingNote(false)}
        />
      )}
    </div>
  );
}, (prev, next) => {
  // Return true = props are equal = SKIP re-render
  if (prev.item.id !== next.item.id) return false;
  if (prev.item.name !== next.item.name) return false;
  if (prev.item.quantity !== next.item.quantity) return false;
  if (prev.item.note !== next.item.note) return false;
  if (prev.item.categoryId !== next.item.categoryId) return false;
  if (prev.item.isChecked !== next.item.isChecked) return false;
  const prevIds = prev.item.storeIds ?? [];
  const nextIds = next.item.storeIds ?? [];
  if (prevIds.length !== nextIds.length) return false;
  if (!prevIds.every((id, i) => id === nextIds[i])) return false;
  if (prev.stores !== next.stores) return false;
  if (prev.categories !== next.categories) return false;
  if (prev.onUpdate !== next.onUpdate) return false;
  if (prev.onToggleChecked !== next.onToggleChecked) return false;
  if (prev.onDelete !== next.onDelete) return false;
  if (prev.onCategoryCreated !== next.onCategoryCreated) return false;
  return true;
});
