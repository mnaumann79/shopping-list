import { db } from "@/db";
import { categories } from "@/db/schema";
import { and, eq } from "drizzle-orm";

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

export async function ensureDefaultCategories(orgId: string) {
  const existingDefaults = await db
    .select()
    .from(categories)
    .where(
      and(
        eq(categories.householdId, orgId),
        eq(categories.isDefault, true),
        eq(categories.isActive, true)
      )
    );

  if (existingDefaults.length > 0) {
    return existingDefaults;
  }

  const rows = DEFAULT_CATEGORIES.map((name) => ({
    householdId: orgId,
    name,
    isDefault: true,
  }));

  await db.insert(categories).values(rows);

  return rows;
}

export async function fetchCategories(orgId: string) {
  const allCategories = await db
    .select()
    .from(categories)
    .where(
      and(eq(categories.householdId, orgId), eq(categories.isActive, true))
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
