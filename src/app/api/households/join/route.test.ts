import { describe, test, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}));

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: vi.fn(),
    },
  },
}));

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

// The scope helpers live in src/db/scope.ts. The two this task adds are not
// there yet, so the module is mocked here: the helper is somebody else's
// unit, and the integration suite is what proves it.
vi.mock("@/db/scope", () => ({
  withScope: vi.fn((_scope: unknown, fn: (tx: unknown) => unknown) => fn(dbMock)),
  withMembershipScope: vi.fn((_scope: unknown, fn: (tx: unknown) => unknown) => fn(dbMock)),
  withClaimsOnly: vi.fn((fn: (tx: unknown) => unknown) => fn(dbMock)),
}));

import { auth } from "@/lib/auth";
import { db } from "@/db";
import { POST } from "./route";

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/households/join", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/households/join", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("returns 401 if not authenticated", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValueOnce(null);
    const res = await POST(makeRequest({ token: "t" }));
    expect(res.status).toBe(401);
  });

  test("returns 400 if the token is missing", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValueOnce({
      user: { id: "u1" },
      session: { activeOrganizationId: "org-1" },
    } as never);
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  test("returns 404 when the link is not live", async () => {
    // The function resolves the token and writes the row in one statement
    // path, so an unknown, an expired and a revoked link are one answer:
    // nothing.
    vi.mocked(auth.api.getSession).mockResolvedValueOnce({
      user: { id: "u1" },
      session: { activeOrganizationId: "org-1" },
    } as never);
    vi.mocked(db.execute).mockResolvedValue({ rows: [{ household_id: null }] } as never);

    const res = await POST(makeRequest({ token: "dead-token" }));

    expect(res.status).toBe(404);
  });

  test("returns 200 and the household id when the link is live", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValueOnce({
      user: { id: "u1" },
      session: { activeOrganizationId: "org-1" },
    } as never);
    vi.mocked(db.execute).mockResolvedValue({ rows: [{ household_id: "h1" }] } as never);

    const res = await POST(makeRequest({ token: "live-token" }));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.householdId).toBe("h1");
  });
});
