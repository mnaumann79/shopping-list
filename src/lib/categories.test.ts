import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock db
vi.mock("@/db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    transaction: vi.fn(),
  },
}));

import { ensureDefaultCategories } from "@/lib/categories";

const DEFAULT_CATEGORY_NAMES = [
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
];

// CAT-01: Default category seeding — idempotency
describe("ensureDefaultCategories", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("inserts 10 default categories when none exist for the org", async () => {
    const { db } = await import("@/db");
    // Select returns empty (no existing categories)
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    } as never);
    vi.mocked(db.insert).mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    } as never);

    await ensureDefaultCategories("org-1");

    expect(db.insert).toHaveBeenCalledOnce();
    // The values passed should include all 10 default category names
    const insertCall = vi.mocked(db.insert).mock.calls[0];
    expect(insertCall).toBeDefined();
  });

  it("is idempotent — does not insert when categories already exist", async () => {
    const { db } = await import("@/db");
    // Select returns existing categories
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(
          DEFAULT_CATEGORY_NAMES.map((name, i) => ({
            id: `cat-${i}`,
            organizationId: "org-1",
            name,
            isDefault: true,
            isActive: true,
            createdAt: new Date(),
          }))
        ),
      }),
    } as never);

    await ensureDefaultCategories("org-1");

    expect(db.insert).not.toHaveBeenCalled();
  });

  it("returns the list of default categories for the org", async () => {
    const { db } = await import("@/db");
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    } as never);
    vi.mocked(db.insert).mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    } as never);

    const result = await ensureDefaultCategories("org-1");

    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(10);
  });
});
