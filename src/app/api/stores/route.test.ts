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
import { POST } from "@/app/api/stores/route";
import { NextRequest } from "next/server";

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/stores", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// STOR-01: POST /api/stores — create store scoped to org
describe("POST /api/stores", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when no session", async () => {
    vi.mocked(requireActiveOrganization).mockResolvedValueOnce(
      Response.json({ error: "Unauthorized" }, { status: 401 }),
    );
    const req = makeRequest({ name: "Costco" });
    const res = await POST(req);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBeDefined();
  });

  it("returns 400 when name is missing", async () => {
    vi.mocked(requireActiveOrganization).mockResolvedValueOnce({
      session: {
        user: { id: "u1", name: "Test User", email: "u1@example.com" },
        activeHouseholdId: "org-1",
      },
      orgId: "org-1",
      requestHeaders: new Headers(),
    });
    const req = makeRequest({});
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBeDefined();
  });

  it("returns 201 and creates store scoped to org", async () => {
    vi.mocked(requireActiveOrganization).mockResolvedValueOnce({
      session: {
        user: { id: "u1", name: "Test User", email: "u1@example.com" },
        activeHouseholdId: "org-1",
      },
      orgId: "org-1",
      requestHeaders: new Headers(),
    });
    const { db } = await import("@/db");
    vi.mocked(db.insert).mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([
          {
            id: "store-1",
            householdId: "org-1",
            name: "Costco",
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ]),
      }),
    } as never);
    const req = makeRequest({ name: "Costco" });
    const res = await POST(req);
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.id).toBeDefined();
    expect(json.name).toBe("Costco");
    expect(json.householdId).toBe("org-1");
  });
});
