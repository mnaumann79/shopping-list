import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock next/headers
vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}));

// Mock auth (vi.fn() inline — vitest hoists vi.mock before const declarations)
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
import { POST } from "@/app/api/items/route";
import { NextRequest } from "next/server";

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/items", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ITEM-01: POST /api/items — create item scoped to org
describe("POST /api/items", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when no session", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValueOnce(null);
    const req = makeRequest({ name: "Milk" });
    const res = await POST(req);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBeDefined();
  });

  it("returns 400 when name is missing", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValueOnce({
      session: { activeOrganizationId: "org-1" },
      user: { id: "u1" },
    } as never);
    const req = makeRequest({});
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBeDefined();
  });

  it("returns 201 and creates item scoped to org", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValueOnce({
      session: { activeOrganizationId: "org-1" },
      user: { id: "u1" },
    } as never);
    const { db } = await import("@/db");
    vi.mocked(db.insert).mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([
          {
            id: "item-1",
            householdId: "org-1",
            name: "Milk",
            quantity: null,
            note: null,
            categoryId: null,
            isActive: true,
            isChecked: false,
            createdAt: new Date(),
            updatedAt: new Date(),
            createdById: "u1",
          },
        ]),
      }),
    } as never);
    const req = makeRequest({ name: "Milk" });
    const res = await POST(req);
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.id).toBeDefined();
    expect(json.name).toBe("Milk");
    expect(json.householdId).toBe("org-1");
  });

  it("returns 201 when quantity is null", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValueOnce({
      session: { activeOrganizationId: "org-1" },
      user: { id: "u1" },
    } as never);
    const { db } = await import("@/db");
    const returning = vi.fn().mockResolvedValue([
      {
        id: "item-2",
        householdId: "org-1",
        name: "Bananas",
        quantity: null,
        note: null,
        categoryId: null,
        isActive: true,
        isChecked: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdById: "u1",
      },
    ]);
    const values = vi.fn().mockReturnValue({ returning });
    vi.mocked(db.insert).mockReturnValue({ values } as never);

    const req = makeRequest({ name: "Bananas", quantity: null });
    const res = await POST(req);

    expect(res.status).toBe(201);
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Bananas", quantity: null })
    );
  });
});
