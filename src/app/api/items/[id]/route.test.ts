import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock next/headers
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

import { requireActiveOrganization } from "@/lib/request-auth";
import { PATCH, DELETE } from "@/app/api/items/[id]/route";
import { NextRequest } from "next/server";

function makeRequest(
  method: string,
  body?: unknown,
  id = "item-1"
): NextRequest {
  return new NextRequest(`http://localhost:3000/api/items/${id}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

// ITEM-02: PATCH /api/items/[id] - update item fields + replace store tags
describe("PATCH /api/items/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when no session", async () => {
    vi.mocked(requireActiveOrganization).mockResolvedValueOnce({
      session: {
        user: { id: "u1", name: "Test User", email: "u1@example.com" },
        activeHouseholdId: "org-1",
      },
      orgId: "org-1",
      requestHeaders: new Headers(),
    }););
    const res = await PATCH(req, { params: Promise.resolve({ id: "item-1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 400 when no fields provided", async () => {
    vi.mocked(requireActiveOrganization).mockResolvedValueOnce({
      session: {
        user: { id: "u1", name: "Test User", email: "u1@example.com" },
        activeHouseholdId: "org-1",
      },
      orgId: "org-1",
      requestHeaders: new Headers(),
    }); as never);
    const req = makeRequest("PATCH", {});
    const res = await PATCH(req, { params: Promise.resolve({ id: "item-1" }) });
    expect(res.status).toBe(400);
  });

  it("returns 200 and updates item fields", async () => {
    vi.mocked(requireActiveOrganization).mockResolvedValueOnce({
      session: {
        user: { id: "u1", name: "Test User", email: "u1@example.com" },
        activeHouseholdId: "org-1",
      },
      orgId: "org-1",
      requestHeaders: new Headers(),
    }); as never);
    const { db } = await import("@/db");
    vi.mocked(db.transaction).mockImplementationOnce(async (fn) => fn(db as never));
    vi.mocked(db.update).mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([
            {
              id: "item-1",
              householdId: "org-1",
              name: "Whole Milk",
              isActive: true,
              isChecked: false,
            },
          ]),
        }),
      }),
    } as never);
    const req = makeRequest("PATCH", { name: "Whole Milk" });
    const res = await PATCH(req, { params: Promise.resolve({ id: "item-1" }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.name).toBe("Whole Milk");
  });

  it("returns 200 when checking an item", async () => {
    vi.mocked(requireActiveOrganization).mockResolvedValueOnce({
      session: {
        user: { id: "u1", name: "Test User", email: "u1@example.com" },
        activeHouseholdId: "org-1",
      },
      orgId: "org-1",
      requestHeaders: new Headers(),
    }); as never);
    const { db } = await import("@/db");
    vi.mocked(db.update).mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([
            {
              id: "item-1",
              householdId: "org-1",
              name: "Milk",
              isActive: true,
              isChecked: true,
            },
          ]),
        }),
      }),
    } as never);

    const req = makeRequest("PATCH", { isChecked: true });
    const res = await PATCH(req, { params: Promise.resolve({ id: "item-1" }) });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.isChecked).toBe(true);
  });

  it("returns 200 when unchecking an item", async () => {
    vi.mocked(requireActiveOrganization).mockResolvedValueOnce({
      session: {
        user: { id: "u1", name: "Test User", email: "u1@example.com" },
        activeHouseholdId: "org-1",
      },
      orgId: "org-1",
      requestHeaders: new Headers(),
    }); as never);
    const { db } = await import("@/db");
    vi.mocked(db.update).mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([
            {
              id: "item-1",
              householdId: "org-1",
              name: "Milk",
              isActive: true,
              isChecked: false,
            },
          ]),
        }),
      }),
    } as never);

    const req = makeRequest("PATCH", { isChecked: false });
    const res = await PATCH(req, { params: Promise.resolve({ id: "item-1" }) });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.isChecked).toBe(false);
  });

  it("returns 200 when restoring a cleared item", async () => {
    vi.mocked(requireActiveOrganization).mockResolvedValueOnce({
      session: {
        user: { id: "u1", name: "Test User", email: "u1@example.com" },
        activeHouseholdId: "org-1",
      },
      orgId: "org-1",
      requestHeaders: new Headers(),
    }); as never);
    const { db } = await import("@/db");
    const set = vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([
          {
            id: "item-1",
            householdId: "org-1",
            name: "Milk",
            isActive: true,
            isChecked: false,
          },
        ]),
      }),
    });
    vi.mocked(db.update).mockReturnValue({
      set,
    } as never);

    const req = makeRequest("PATCH", { isActive: true, isChecked: false });
    const res = await PATCH(req, { params: Promise.resolve({ id: "item-1" }) });

    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({ isActive: true, isChecked: false })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.isActive).toBe(true);
    expect(json.isChecked).toBe(false);
  });

  it("returns 200 when updating storeIds only", async () => {
    vi.mocked(requireActiveOrganization).mockResolvedValueOnce({
      session: {
        user: { id: "u1", name: "Test User", email: "u1@example.com" },
        activeHouseholdId: "org-1",
      },
      orgId: "org-1",
      requestHeaders: new Headers(),
    }); as never);
    const { db } = await import("@/db");

    const selectWhere = vi.fn().mockResolvedValue([{ id: "store-1" }]);
    const selectFrom = vi.fn().mockReturnValue({ where: selectWhere });
    vi.mocked(db.select).mockReturnValue({ from: selectFrom } as never);

    const updateReturning = vi.fn().mockResolvedValue([
      {
        id: "item-1",
        householdId: "org-1",
        name: "Milk",
        isActive: true,
        isChecked: false,
      },
    ]);
    const updateWhere = vi.fn().mockReturnValue({ returning: updateReturning });
    const updateSet = vi.fn().mockReturnValue({ where: updateWhere });
    const deleteWhere = vi.fn().mockResolvedValue(undefined);
    const insertValues = vi.fn().mockResolvedValue(undefined);

    vi.mocked(db.update).mockReturnValue({ set: updateSet } as never);
    vi.mocked(db.delete).mockReturnValue({ where: deleteWhere } as never);
    vi.mocked(db.insert).mockReturnValue({ values: insertValues } as never);

    const req = makeRequest("PATCH", { storeIds: ["store-1"] });
    const res = await PATCH(req, { params: Promise.resolve({ id: "item-1" }) });

    expect(res.status).toBe(200);
    expect(insertValues).toHaveBeenCalledWith([{ itemId: "item-1", storeId: "store-1" }]);
    const json = await res.json();
    expect(json.storeIds).toEqual(["store-1"]);
  });
});

// ITEM-03: DELETE /api/items/[id] - soft-delete (sets isActive=false)
describe("DELETE /api/items/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when no session", async () => {
    vi.mocked(requireActiveOrganization).mockResolvedValueOnce({
      session: {
        user: { id: "item-1", name: "Test User", email: "item-1@example.com" },
        activeHouseholdId: "org-1",
      },
      orgId: "org-1",
      requestHeaders: new Headers(),
    }););
    expect(res.status).toBe(401);
  });

  it("returns 200 and soft-deletes item (sets isActive=false)", async () => {
    vi.mocked(requireActiveOrganization).mockResolvedValueOnce({
      session: {
        user: { id: "u1", name: "Test User", email: "u1@example.com" },
        activeHouseholdId: "org-1",
      },
      orgId: "org-1",
      requestHeaders: new Headers(),
    }); as never);
    const { db } = await import("@/db");
    vi.mocked(db.update).mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([
            { id: "item-1", isActive: false },
          ]),
        }),
      }),
    } as never);
    const req = makeRequest("DELETE");
    const res = await DELETE(req, { params: Promise.resolve({ id: "item-1" }) });
    expect(res.status).toBe(200);
  });
});
