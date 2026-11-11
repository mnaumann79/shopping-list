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
      addMember: vi.fn(),
    },
  },
}));

// Mock db
vi.mock("@/db", () => ({
  db: {
    select: vi.fn(),
    delete: vi.fn(),
  },
}));

// Mock drizzle-orm eq
vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col, val) => ({ col, val })),
}));

// Mock households schema
vi.mock("@/db/schema/households", () => ({
  householdJoinLinks: { token: "token", organizationId: "organizationId" },
}));

import { auth } from "@/lib/auth";
import { db } from "@/db";
import { POST } from "./route";
import { NextRequest } from "next/server";

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/households/join", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const VALID_LINK = {
  id: "link-1",
  token: "abc123",
  organizationId: "org-1",
  createdById: "admin-1",
  expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
  createdAt: new Date(),
};

const EXPIRED_LINK = {
  ...VALID_LINK,
  expiresAt: new Date(Date.now() - 1000), // 1 second ago
};

// HSHD-04: POST /api/households/join (join link path)
describe("POST /api/households/join", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: db.select().from().where().limit() returns valid link
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([VALID_LINK]),
        }),
      }),
    } as never);
    vi.mocked(auth.api.addMember).mockResolvedValue({} as never);
  });

  test("returns 401 if not authenticated", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValueOnce(null);
    const req = makeRequest({ token: "abc123" });
    const res = await POST(req);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBeDefined();
  });

  test("returns 400 if token is missing", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValueOnce({
      user: { id: "u1" },
    } as never);
    const req = makeRequest({});
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBeDefined();
  });

  test("returns 404 if token does not exist", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValueOnce({
      user: { id: "u1" },
    } as never);
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    } as never);
    const req = makeRequest({ token: "nonexistent" });
    const res = await POST(req);
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBeDefined();
  });

  test("returns 410 if token has expired", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValueOnce({
      user: { id: "u1" },
    } as never);
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([EXPIRED_LINK]),
        }),
      }),
    } as never);
    const req = makeRequest({ token: "abc123" });
    const res = await POST(req);
    expect(res.status).toBe(410);
    const json = await res.json();
    expect(json.error).toBeDefined();
  });

  test("returns 200 and adds caller as member on valid token", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValueOnce({
      user: { id: "u1" },
    } as never);
    const req = makeRequest({ token: "abc123" });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.organizationId).toBe("org-1");
    expect(auth.api.addMember).toHaveBeenCalledOnce();
  });

  test("does NOT delete the token after successful join (multi-use)", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValueOnce({
      user: { id: "u1" },
    } as never);
    const req = makeRequest({ token: "abc123" });
    await POST(req);
    // db.delete should never be called — tokens are multi-use
    expect(db.delete).not.toHaveBeenCalled();
  });
});
