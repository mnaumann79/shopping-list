import { ensureDefaultCategories, fetchCategories } from "@/lib/categories";
import { getRequestSession } from "@/lib/request-auth";
import { listActiveItems, listActiveStores } from "@/server/services/items";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AppHeader } from "@/components/AppHeader";
import { ShoppingList } from "./_components/ShoppingList";
import { ShoppingListSkeleton } from "./_components/ShoppingListSkeleton";

export default async function DashboardPage() {
  const session = await getRequestSession();
  if (!session) redirect("/sign-in");

  const orgId = session.activeHouseholdId;
  if (!orgId) redirect("/onboarding");

  const scope = { userId: session.user.id, householdId: orgId };

  const [, categories, initialItems, storeList] = await Promise.all([
    ensureDefaultCategories(scope),
    fetchCategories(scope),
    listActiveItems(scope),
    listActiveStores(scope),
  ]);

  return (
    <div className="bg-background min-h-screen">
      <AppHeader userName={session.user.name} activeHouseholdId={session.activeHouseholdId} />
      <main>
        <Suspense fallback={<ShoppingListSkeleton />}>
          <ShoppingList initialItems={initialItems} categories={categories} stores={storeList} />
        </Suspense>
      </main>
    </div>
  );
}
