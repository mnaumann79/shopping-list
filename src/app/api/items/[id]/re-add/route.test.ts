import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ headers: vi.fn().mockResolvedValue(new Headers()) }));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock("@/db", () => ({ db: { select: vi.fn(), update: vi.fn() } }));

import { auth } from "@/lib/auth";
import { POST } from "@/app/api/items/[id]/re-add/route";

describe("POST /api/items/[id]/re-add", () => {
  beforeEach(() => vi.clearAllMocks());

  it("restores an archived item with a fresh active-list timestamp", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValueOnce({
      session: { activeOrganizationId: "org-1" }, user: { id: "user-1" },
    } as never);
    const { db } = await import("@/db");
    const updatedItem = {
      id: "item-1", organizationId: "org-1", name: "Milk", quantity: "1 gallon", note: null,
      categoryId: "category-1", isActive: true, isChecked: false, archivedAt: null,
      createdAt: new Date("2026-07-24T12:00:00.000Z"), updatedAt: new Date("2026-07-24T12:00:00.000Z"), createdById: "user-1",
    };
    const set = vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([updatedItem]) }) });
    vi.mocked(db.update).mockReturnValue({ set } as never);
    vi.mocked(db.select).mockReturnValue({ from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([{ storeId: "store-1" }]) }) } as never);

    const response = await POST(new Request("http://localhost/api/items/item-1/re-add", { method: "POST" }), {
      params: Promise.resolve({ id: "item-1" }),
    });

    expect(response.status).toBe(200);
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ archivedAt: null, isChecked: false, createdAt: expect.any(Date) }));
    await expect(response.json()).resolves.toEqual(expect.objectContaining({ id: "item-1", isChecked: false, archivedAt: null, storeIds: ["store-1"] }));
  });
});
