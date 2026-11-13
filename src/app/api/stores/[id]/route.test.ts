import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock next/headers
vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}));

// Mock auth
vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: vi.fn(),
    },
  },
}));

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

import { auth } from "@/lib/auth";
import { PATCH, DELETE } from "@/app/api/stores/[id]/route";
import { NextRequest } from "next/server";

function makeRequest(method: string, body?: unknown, id = "store-1"): NextRequest {
  return new NextRequest(`http://localhost:3000/api/stores/${id}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

// STOR-02: PATCH /api/stores/[id] — rename store
describe("PATCH /api/stores/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when no session", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValueOnce(null);
    const req = makeRequest("PATCH", { name: "Trader Joe's" });
    const res = await PATCH(req, { params: Promise.resolve({ id: "store-1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 400 when name is missing", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValueOnce({
      session: { activeOrganizationId: "org-1" },
      user: { id: "u1" },
    } as never);
    const req = makeRequest("PATCH", {});
    const res = await PATCH(req, { params: Promise.resolve({ id: "store-1" }) });
    expect(res.status).toBe(400);
  });

  it("returns 200 and renames store", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValueOnce({
      session: { activeOrganizationId: "org-1" },
      user: { id: "u1" },
    } as never);
    const { db } = await import("@/db");
    vi.mocked(db.update).mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([
            {
              id: "store-1",
              householdId: "org-1",
              name: "Trader Joe's",
              isActive: true,
            },
          ]),
        }),
      }),
    } as never);
    const req = makeRequest("PATCH", { name: "Trader Joe's" });
    const res = await PATCH(req, { params: Promise.resolve({ id: "store-1" }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.name).toBe("Trader Joe's");
  });
});

// STOR-03: DELETE /api/stores/[id] — hard-delete (cascade removes itemStores)
describe("DELETE /api/stores/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when no session", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValueOnce(null);
    const req = makeRequest("DELETE");
    const res = await DELETE(req, { params: Promise.resolve({ id: "store-1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 200 and hard-deletes store", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValueOnce({
      session: { activeOrganizationId: "org-1" },
      user: { id: "u1" },
    } as never);
    const { db } = await import("@/db");
    vi.mocked(db.delete).mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: "store-1" }]),
      }),
    } as never);
    const req = makeRequest("DELETE");
    const res = await DELETE(req, { params: Promise.resolve({ id: "store-1" }) });
    expect(res.status).toBe(200);
  });
});
