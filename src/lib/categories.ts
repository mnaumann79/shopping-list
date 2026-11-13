import { and, eq } from "drizzle-orm";
import { categories } from "@/db/schema";
import { withScope, type Scope } from "@/db/scope";

export const DEFAULT_CATEGORIES = [
  "Produce",
  "Meat & Seafood",
  "Dairy & Eggs",
  "Bakery",
  "Frozen",
  "Pantry",
  "Snacks",
  "Beverages",
  "Household",
  "Other",
] as const;

export async function ensureDefaultCategories(scope: Scope) {
  return withScope(scope, async (tx) => {
    const existingDefaults = await tx
      .select()
      .from(categories)
      .where(
        and(
          eq(categories.householdId, scope.householdId),
          eq(categories.isDefault, true),
          eq(categories.isActive, true)
        )
      );

    if (existingDefaults.length > 0) {
      return existingDefaults;
    }

    const rows = DEFAULT_CATEGORIES.map((name) => ({
      householdId: scope.householdId,
      name,
      isDefault: true,
    }));

    await tx.insert(categories).values(rows);

    return rows;
  });
}

export async function fetchCategories(scope: Scope) {
  const allCategories = await withScope(scope, (tx) =>
    tx
      .select()
      .from(categories)
      .where(and(eq(categories.householdId, scope.householdId), eq(categories.isActive, true))),
  );

  const defaults = allCategories.filter((category) => category.isDefault);
  const custom = allCategories.filter((category) => !category.isDefault);

  return [
    ...defaults.sort(
      (a, b) =>
        DEFAULT_CATEGORIES.indexOf(a.name as (typeof DEFAULT_CATEGORIES)[number]) -
        DEFAULT_CATEGORIES.indexOf(b.name as (typeof DEFAULT_CATEGORIES)[number])
    ),
    ...custom.sort((a, b) => a.name.localeCompare(b.name)),
  ];
}
