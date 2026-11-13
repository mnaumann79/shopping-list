import { AppHeader } from "@/components/AppHeader";
import { fetchCategories } from "@/lib/categories";
import { ArrowLeft } from "lucide-react";
import { getRequestSession } from "@/lib/request-auth";
import { listActiveStores, listArchivedItems } from "@/server/services/items";
import { redirect } from "next/navigation";
import { HistoryList } from "./_components/HistoryList";

export default async function HistoryPage() {
  const session = await getRequestSession();
  if (!session) redirect("/sign-in");
  const orgId = session.activeHouseholdId;
  if (!orgId) redirect("/onboarding");

  const [items, categories, stores] = await Promise.all([
    listArchivedItems({ userId: session.user.id, householdId: orgId }),
    fetchCategories({ userId: session.user.id, householdId: orgId }),
    listActiveStores({ userId: session.user.id, householdId: orgId }),
  ]);
  const categoryNames = new Map(categories.map((category) => [category.id, category.name]));
  const storeNames = new Map(stores.map((store) => [store.id, store.name]));
  const historyItems = items.map((item) => ({
    id: item.id,
    name: item.name,
    quantity: item.quantity,
    note: item.note,
    archiveLabel: item.archivedAt
      ? `Archived ${new Intl.DateTimeFormat("en-US", { timeZone: "UTC" }).format(new Date(item.archivedAt))}`
      : "Archived",
    categoryName: item.categoryId ? categoryNames.get(item.categoryId) ?? "Uncategorized" : null,
    storeNames: item.storeIds.flatMap((storeId) => {
      const storeName = storeNames.get(storeId);
      return storeName ? [storeName] : [];
    }),
  }));
  return (
    <div className="min-h-screen bg-background">
      <AppHeader userName={session.user.name} activeHouseholdId={session.activeHouseholdId} />
      <main className="mx-auto max-w-2xl space-y-4 p-4">
        <div className="space-y-2">
          <a href="/dashboard" className="-ml-2 inline-flex h-7 items-center gap-1 rounded-md px-2.5 text-sm hover:bg-muted hover:text-foreground">
            <ArrowLeft className="size-4" />
            Back to shopping list
          </a>
          <div><h1 className="text-xl font-semibold">Item history</h1><p className="text-muted-foreground text-sm">Re-add past items to your active list.</p></div>
        </div>
        <HistoryList initialItems={historyItems} />
      </main>
    </div>
  );
}
