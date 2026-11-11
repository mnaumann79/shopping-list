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

// Mock db
vi.mock("@/db", () => ({
  db: {
    delete: vi.fn(),
    insert: vi.fn(),
  },
}));

// Mock drizzle-orm eq
vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col, val) => ({ col, val })),
}));

// Mock households schema
vi.mock("@/db/schema/households", () => ({
  householdJoinLinks: { organizationId: "organizationId", token: "token" },
}));

import { auth } from "@/lib/auth";
import { db } from "@/db";
import { POST } from "./route";
import { NextRequest } from "next/server";

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/households/join-links", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// HSHD-03: POST /api/households/join-links
describe("POST /api/households/join-links", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: db.delete returns chainable object with .where()
    vi.mocked(db.delete).mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    } as never);
    // Default: db.insert returns chainable object with .values()
    vi.mocked(db.insert).mockReturnValue({
      values: vi.fn().mockResolvedValue([{ id: "link-1" }]),
    } as never);
  });

  test("returns 401 if not authenticated", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValueOnce(null);
    const req = makeRequest({});
    const res = await POST(req);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBeDefined();
  });

  test("returns 400 if there is no active organization", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValueOnce({
      user: { id: "u1" },
      session: { activeOrganizationId: null },
    } as never);
    const req = makeRequest({});
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBeDefined();
  });

  test("returns 200 with a join URL containing a 64-char hex token", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValueOnce({
      user: { id: "u1" },
      session: { activeOrganizationId: "org-1" },
    } as never);
    const req = makeRequest({});
    const res = await POST(req);
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

  test("regenerating deletes the previous join link for the same household", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValueOnce({
      user: { id: "u1" },
      session: { activeOrganizationId: "org-1" },
    } as never);
    const whereMock = vi.fn().mockResolvedValue(undefined);
    vi.mocked(db.delete).mockReturnValue({ where: whereMock } as never);
    const req = makeRequest({});
    await POST(req);
    expect(db.delete).toHaveBeenCalledOnce();
    expect(whereMock).toHaveBeenCalledOnce();
  });

  test("returned URL uses BETTER_AUTH_URL as base", async () => {
    process.env.BETTER_AUTH_URL = "https://app.example.com";
    vi.mocked(auth.api.getSession).mockResolvedValueOnce({
      user: { id: "u1" },
      session: { activeOrganizationId: "org-1" },
    } as never);
    const req = makeRequest({});
    const res = await POST(req);
    const json = await res.json();
    expect(json.url).toMatch(/^https:\/\/app\.example\.com\/join\?token=/);
    delete process.env.BETTER_AUTH_URL;
  });
});
