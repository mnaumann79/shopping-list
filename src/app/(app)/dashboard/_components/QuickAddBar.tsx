"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { INTEGER_ONLY } from "@/lib/utils";

type Store = {
  id: string;
  name: string;
};

interface QuickAddBarProps {
  onAdd: (values: { name: string; quantity: string | null; storeIds: string[] }) => void;
  selectedStoreId: string;
  onStoreChange: (storeId: string) => void;
  stores: Store[];
}

export function QuickAddBar({ onAdd, selectedStoreId, onStoreChange, stores }: QuickAddBarProps) {
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("");

  function handleSubmit() {
    const nextName = name.trim();
    const nextQuantity = quantity.trim();
    if (!nextName) return;
    onAdd({ name: nextName, quantity: nextQuantity || null, storeIds: selectedStoreId ? [selectedStoreId] : [] });
    setName("");
    setQuantity("");
  }

  return (
    <form
      className="bg-background/95 supports-backdrop-filter:bg-background/80 sticky top-0 z-10 border-b p-3 shadow-sm backdrop-blur"
      onSubmit={(event) => {
        event.preventDefault();
        handleSubmit();
      }}
    >
      <div className="flex items-center gap-2">
        <Input
          type="text"
          inputMode="text"
          aria-label="Item name"
          placeholder="Add item..."
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.nativeEvent.isComposing) {
              event.preventDefault();
              handleSubmit();
            }
          }}
          className="flex-1"
          style={{ touchAction: "pan-y" }}
        />
        <Input
          type="tel"
          inputMode="numeric"
          aria-label="Quantity"
          placeholder="Qty"
          value={quantity}
          onChange={(event) => setQuantity(event.target.value.replace(INTEGER_ONLY, ""))}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.nativeEvent.isComposing) {
              event.preventDefault();
              handleSubmit();
            }
          }}
          className="w-20 shrink-0"
          style={{ touchAction: "pan-y" }}
        />
        <select
          aria-label="Store"
          value={selectedStoreId}
          onChange={(e) => onStoreChange(e.target.value)}
          className="border-input bg-background w-28 shrink-0 rounded-md border px-2 py-1 text-base md:text-sm"
        >
          <option value="">No store</option>
          {stores.map((store) => (
            <option key={store.id} value={store.id}>
              {store.name}
            </option>
          ))}
        </select>
        <Button type="submit" size="sm">
          Add
        </Button>
      </div>
    </form>
  );
}

export default QuickAddBar;
