"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { toastError } from "@/lib/toast";

type ArchivedItem = {
  id: string;
  name: string;
  quantity: string | null;
  note: string | null;
  archiveLabel: string;
  categoryName: string | null;
  storeNames: string[];
};

export function HistoryList({ initialItems }: { initialItems: ArchivedItem[] }) {
  const [items, setItems] = useState(initialItems);
  const [reAddingId, setReAddingId] = useState<string | null>(null);

  async function reAddItem(item: ArchivedItem) {
    setReAddingId(item.id);
    try {
      const response = await fetch(`/api/items/${item.id}/re-add`, { method: "POST" });
      if (!response.ok) throw new Error("Failed to re-add item");
      setItems((current) => current.filter((currentItem) => currentItem.id !== item.id));
    } catch {
      void toastError("Failed to re-add item");
    } finally {
      setReAddingId(null);
    }
  }

  if (items.length === 0) {
    return <Card><CardContent className="py-8 text-center text-muted-foreground">No archived items yet.</CardContent></Card>;
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <Card key={item.id} size="sm">
          <CardHeader>
            <CardTitle>{item.name}{item.quantity ? ` · ${item.quantity}` : ""}</CardTitle>
            <CardDescription>
              {item.archiveLabel}
              {item.categoryName ? ` · ${item.categoryName}` : ""}
              {item.storeNames?.length ? ` · ${item.storeNames.join(", ")}` : ""}
            </CardDescription>
          </CardHeader>
          {item.note && <CardContent className="text-muted-foreground">{item.note}</CardContent>}
          <CardFooter className="justify-end"><Button onClick={() => void reAddItem(item)} disabled={reAddingId === item.id}>Re-add</Button></CardFooter>
        </Card>
      ))}
    </div>
  );
}
