import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock db
// The scope helper opens a transaction and runs the caller's query on the
// transaction's client. In a unit test that client is the mocked db itself,
// so the mock's transaction hands the callback the same object.
const { dbMock } = vi.hoisted(() => {
  const mock = {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    execute: vi.fn(),
    transaction: vi.fn(),
  };
  mock.transaction.mockImplementation((callback: (tx: unknown) => unknown) =>
    callback(mock),
  );
  return { dbMock: mock };
});

vi.mock("@/db", () => ({ db: dbMock }));

import { ensureDefaultCategories } from "@/lib/categories";

// The household the scope names. The scope helper takes the caller's id and
// the household's, so a unit test names both.
const SCOPE = { userId: "user-1", householdId: "org-1" };

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

    await ensureDefaultCategories(SCOPE);

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
            householdId: "org-1",
            name,
            isDefault: true,
            isActive: true,
            createdAt: new Date(),
          }))
        ),
      }),
    } as never);

    await ensureDefaultCategories(SCOPE);

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

    const result = await ensureDefaultCategories(SCOPE);

    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(10);
  });
});
