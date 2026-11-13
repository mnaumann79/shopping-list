import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}));

// Mock the request seam.
//
// A route test fakes the caller here, not at the auth provider: what is
// under test is the route's contract, not the provider's. The seam answers
// with the caller and the household they are acting on.
vi.mock("@/lib/request-auth", () => ({
  requireActiveOrganization: vi.fn(),
  requireRequestSession: vi.fn(),
}));

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

import { requireActiveOrganization } from "@/lib/request-auth";
import { POST } from "@/app/api/items/clear-completed/route";

describe("POST /api/items/clear-completed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when no session", async () => {
    vi.mocked(requireActiveOrganization).mockResolvedValueOnce(
      Response.json({ error: "No active household" }, { status: 400 }),
    ); as never);

    const res = await POST();

    expect(res.status).toBe(400);
  });

  it("archives checked items and returns them for the active organization", async () => {
    vi.mocked(requireActiveOrganization).mockResolvedValueOnce({
      session: {
        user: { id: "u1", name: "Test User", email: "u1@example.com" },
        activeHouseholdId: "org-1",
      },
      orgId: "org-1",
      requestHeaders: new Headers(),
    }); as never);
    const { db } = await import("@/db");
    const selectWhere = vi.fn().mockResolvedValue([
      {
        item: {
          id: "item-checked-1",
          name: "Milk",
          quantity: "1",
          note: null,
          categoryId: "cat-1",
          isChecked: true,
          isActive: true,
          archivedAt: null,
          createdAt: new Date("2026-03-13T00:00:00.000Z"),
          updatedAt: new Date("2026-03-13T00:00:00.000Z"),
        },
        storeId: "store-1",
      },
      {
        item: {
          id: "item-checked-2",
          name: "Eggs",
          quantity: null,
          note: "Large",
          categoryId: null,
          isChecked: true,
          isActive: true,
          archivedAt: null,
          createdAt: new Date("2026-03-13T00:00:00.000Z"),
          updatedAt: new Date("2026-03-13T00:00:00.000Z"),
        },
        storeId: null,
      },
    ]);
    const leftJoin = vi.fn().mockReturnValue({ where: selectWhere });
    const from = vi.fn().mockReturnValue({ leftJoin });
    vi.mocked(db.select).mockReturnValue({ from } as never);
    const updateWhere = vi.fn().mockResolvedValue(undefined);
    const set = vi.fn().mockReturnValue({ where: updateWhere });
    vi.mocked(db.update).mockReturnValue({ set } as never);

    const res = await POST();

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({
      clearedItems: [
        {
          id: "item-checked-1",
          name: "Milk",
          quantity: "1",
          note: null,
          categoryId: "cat-1",
          isChecked: true,
          isActive: true,
          archivedAt: null,
          createdAt: "2026-03-13T00:00:00.000Z",
          updatedAt: "2026-03-13T00:00:00.000Z",
          storeIds: ["store-1"],
        },
        {
          id: "item-checked-2",
          name: "Eggs",
          quantity: null,
          note: "Large",
          categoryId: null,
          isChecked: true,
          isActive: true,
          archivedAt: null,
          createdAt: "2026-03-13T00:00:00.000Z",
          updatedAt: "2026-03-13T00:00:00.000Z",
          storeIds: [],
        },
      ],
    });
    expect(selectWhere).toHaveBeenCalledOnce();
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ archivedAt: expect.any(Date) }));
    expect(set).not.toHaveBeenCalledWith(expect.objectContaining({ isActive: false }));
    expect(updateWhere).toHaveBeenCalledOnce();
  });

  it("returns an empty clearedItems array when no checked items exist", async () => {
    vi.mocked(requireActiveOrganization).mockResolvedValueOnce({
      session: {
        user: { id: "u1", name: "Test User", email: "u1@example.com" },
        activeHouseholdId: "org-1",
      },
      orgId: "org-1",
      requestHeaders: new Headers(),
    }); as never);
    const { db } = await import("@/db");
    const selectWhere = vi.fn().mockResolvedValue([]);
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        leftJoin: vi.fn().mockReturnValue({ where: selectWhere }),
      }),
    } as never);
    const updateWhere = vi.fn().mockResolvedValue(undefined);
    vi.mocked(db.update).mockReturnValue({
      set: vi.fn().mockReturnValue({ where: updateWhere }),
    } as never);

    const res = await POST();

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ clearedItems: [] });
    expect(db.update).not.toHaveBeenCalled();
  });
});
