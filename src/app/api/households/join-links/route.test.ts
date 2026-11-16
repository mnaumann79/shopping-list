import { describe, test, expect, vi, beforeEach } from "vitest";

// Mock next/headers
vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}));

// Mock auth
// The caller is faked at the request-auth seam, not at the auth provider:
// the auth swap removes the auth export from that module, and a route test
// that mocked it would break the moment the swap lands.
vi.mock("@/lib/request-auth", () => ({
  requireActiveOrganization: vi.fn(),
  requireRequestSession: vi.fn(),
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

import { requireActiveOrganization } from "@/lib/request-auth";
import { db } from "@/db";
import { JOIN_LINK_LIMIT } from "@/lib/rate-limit";
import { POST } from "./route";

// A signed-in caller with a household active.
function signedIn(userId = "u1", householdId = "h1") {
  vi.mocked(requireActiveOrganization).mockResolvedValue({
    session: { user: { id: userId, name: "U", email: "u@example.test" }, activeHouseholdId: householdId },
    orgId: householdId,
    requestHeaders: new Headers(),
  } as never);
}

// The role the database reports for the caller.
function callerIs(role: string | null) {
  vi.mocked(db.execute).mockResolvedValue({ rows: [{ role }] } as never);
}

// HSHD-03: POST /api/households/join-links
describe("POST /api/households/join-links", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // The caller's household is the test's own: the limit counts per
    // household, and a household that carries one test's calls must not
    // carry the next one's.
    vi.mocked(requireActiveOrganization).mockReset();
    // Default: the caller is an owner, and the insert is chainable.
    callerIs("owner");
    vi.mocked(db.insert).mockReturnValue({
      values: vi.fn().mockResolvedValue([]),
    } as never);
  });

  test("returns 401 if not authenticated", async () => {
    vi.mocked(requireActiveOrganization).mockResolvedValueOnce(
      Response.json({ error: "Unauthorized" }, { status: 401 }) as never,
    );
    const res = await POST();
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBeDefined();
  });

  test("returns 400 if there is no active organization", async () => {
    vi.mocked(requireActiveOrganization).mockResolvedValueOnce(
      Response.json({ error: "No active household" }, { status: 400 }) as never,
    );
    const res = await POST();
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBeDefined();
  });

  test("returns 403 for a plain member", async () => {
    // S-1: the API does not let a plain member mint a join link. The UI hides
    // the button; this is the check that does not depend on the UI.
    signedIn();
    callerIs("member");

    const res = await POST();

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBeDefined();
    expect(db.insert).not.toHaveBeenCalled();
  });

  test("returns 403 for somebody who is not a member at all", async () => {
    signedIn();
    callerIs(null);

    const res = await POST();

    expect(res.status).toBe(403);
  });

  test("returns 200 with a join URL containing a 64-char hex token", async () => {
    signedIn();
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
    signedIn();
    await POST();
    expect(db.delete).not.toHaveBeenCalled();
  });

  test("returns 429 when the household is over the limit, and mints no link", async () => {
    // S-7: the limit answers 429 with a stable code, and the body says what
    // to try later.
    signedIn("u1", "h-limit");
    callerIs("owner");

    for (let call = 0; call < JOIN_LINK_LIMIT.max; call += 1) {
      const allowed = await POST();
      expect(allowed.status).toBe(200);
    }

    const res = await POST();

    expect(res.status).toBe(429);
    const json = await res.json();
    expect(json.code).toBe("RATE_LIMITED");
    expect(json.error).toMatch(/try again/i);
    // The caller is told when to come back.
    expect(Number(res.headers.get("Retry-After"))).toBeGreaterThan(0);
    // The link was not minted: the limit stops the work, it does not only
    // report it.
    expect(db.insert).toHaveBeenCalledTimes(JOIN_LINK_LIMIT.max);
  });

  test("returns 403 for a plain member while the household is over the limit", async () => {
    // The order of the two answers: a caller who may not act is not a caller
    // to be counted, and a 429 where a 403 belongs would tell the caller the
    // wrong thing. The limit is asked after the role check, so the refusal
    // is the refusal.
    signedIn("u1", "h-over");
    callerIs("owner");

    for (let call = 0; call < JOIN_LINK_LIMIT.max; call += 1) {
      await POST();
    }

    callerIs("member");
    const res = await POST();

    expect(res.status).toBe(403);
  });

  test("returned URL uses NEXT_PUBLIC_APP_URL as base", async () => {
    const before = process.env.NEXT_PUBLIC_APP_URL;
    process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com";
    signedIn();
    const res = await POST();
    const json = await res.json();
    expect(json.url).toMatch(/^https:\/\/app\.example\.com\/join\?token=/);
    if (before === undefined) {
      delete process.env.NEXT_PUBLIC_APP_URL;
    } else {
      process.env.NEXT_PUBLIC_APP_URL = before;
    }
  });
});
