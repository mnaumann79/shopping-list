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
      createInvitation: vi.fn(),
    },
  },
}));

import { auth } from "@/lib/auth";
import { POST } from "./route";
import { NextRequest } from "next/server";

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/households/invite", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// HSHD-02: POST /api/households/invite
describe("POST /api/households/invite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("returns 401 if not authenticated", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValueOnce(null);
    const req = makeRequest({ email: "bob@example.com" });
    const res = await POST(req);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBeDefined();
  });

  test("returns 400 if email is missing", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValueOnce({
      user: { id: "u1" },
      session: { activeOrganizationId: "org-1" },
    } as never);
    const req = makeRequest({});
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBeDefined();
  });

  test("returns 400 if there is no active organization", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValueOnce({
      user: { id: "u1" },
      session: { activeOrganizationId: null },
    } as never);
    const req = makeRequest({ email: "bob@example.com" });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBeDefined();
  });

  test("returns 403 if caller is not household admin or owner", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValueOnce({
      user: { id: "u1" },
      session: { activeOrganizationId: "org-1" },
    } as never);
    vi.mocked(auth.api.createInvitation).mockRejectedValueOnce(
      new Error("You are not authorized to invite members")
    );
    const req = makeRequest({ email: "bob@example.com" });
    const res = await POST(req);
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBeDefined();
  });

  test("returns 200 and creates invitation record when called by admin", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValueOnce({
      user: { id: "u1" },
      session: { activeOrganizationId: "org-1" },
    } as never);
    vi.mocked(auth.api.createInvitation).mockResolvedValueOnce({ id: "inv-1" } as never);
    const req = makeRequest({ email: "bob@example.com" });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(auth.api.createInvitation).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          email: "bob@example.com",
          organizationId: "org-1",
        }),
      })
    );
  });
});
