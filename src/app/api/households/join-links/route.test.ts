import { describe, test, expect, vi, beforeEach } from "vitest";

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

// Mock db. The scope helper opens a transaction and runs the caller's query
// on the transaction's client; in a unit test that client is the mocked db
// itself, so the mock's transaction hands the callback the same object.
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

// Mock households schema
vi.mock("@/db/schema/households", () => ({
  householdJoinLinks: {
    id: "id",
    token: "token",
    householdId: "householdId",
    createdById: "createdById",
    expiresAt: "expiresAt",
  },
  householdMembers: {
    householdId: "householdId",
    userId: "userId",
    role: "role",
  },
  households: {
    id: "id",
    name: "name",
    createdBy: "createdBy",
  },
}));

import { auth } from "@/lib/auth";
import { db } from "@/db";
import { POST } from "./route";

// The role the database reports for the caller.
function callerIs(role: string | null) {
  vi.mocked(db.execute).mockResolvedValue({ rows: [{ role }] } as never);
}

// HSHD-03: POST /api/households/join-links
describe("POST /api/households/join-links", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: the caller is an owner, and the insert is chainable.
    callerIs("owner");
    vi.mocked(db.insert).mockReturnValue({
      values: vi.fn().mockResolvedValue([]),
    } as never);
  });

  test("returns 401 if not authenticated", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValueOnce(null);
    const res = await POST();
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBeDefined();
  });

  test("returns 400 if there is no active organization", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValueOnce({
      user: { id: "u1" },
      session: { activeOrganizationId: null },
    } as never);
    const res = await POST();
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBeDefined();
  });

  test("returns 403 for a plain member", async () => {
    // S-1: the API does not let a plain member mint a join link. The UI hides
    // the button; this is the check that does not depend on the UI.
    vi.mocked(auth.api.getSession).mockResolvedValueOnce({
      user: { id: "u1" },
      session: { activeOrganizationId: "org-1" },
    } as never);
    callerIs("member");

    const res = await POST();

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBeDefined();
    expect(db.insert).not.toHaveBeenCalled();
  });

  test("returns 403 for somebody who is not a member at all", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValueOnce({
      user: { id: "u1" },
      session: { activeOrganizationId: "org-1" },
    } as never);
    callerIs(null);

    const res = await POST();

    expect(res.status).toBe(403);
  });

  test("returns 200 with a join URL containing a 64-char hex token", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValueOnce({
      user: { id: "u1" },
      session: { activeOrganizationId: "org-1" },
    } as never);
    const res = await POST();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.url).toBeDefined();
    // URL should contain a 64-char hex token
    const url = new URL(json.url);
    const token = url.searchParams.get("token");
    expect(token).toBeTruthy();
    expect(token).toHaveLength(64);
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  test("minting a link leaves the household's other links alone", async () => {
    // S-2: several links may exist at once, and each is revocable on its own.
    vi.mocked(auth.api.getSession).mockResolvedValueOnce({
      user: { id: "u1" },
      session: { activeOrganizationId: "org-1" },
    } as never);
    await POST();
    expect(db.delete).not.toHaveBeenCalled();
  });

  test("returned URL uses BETTER_AUTH_URL as base", async () => {
    process.env.BETTER_AUTH_URL = "https://app.example.com";
    vi.mocked(auth.api.getSession).mockResolvedValueOnce({
      user: { id: "u1" },
      session: { activeOrganizationId: "org-1" },
    } as never);
    const res = await POST();
    const json = await res.json();
    expect(json.url).toMatch(/^https:\/\/app\.example\.com\/join\?token=/);
    delete process.env.BETTER_AUTH_URL;
  });
});
