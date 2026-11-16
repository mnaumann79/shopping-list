import { describe, test, expect, vi, beforeEach, afterAll } from "vitest";
import { NextRequest } from "next/server";

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
  householdInvitations: {
    id: "id",
    token: "token",
    householdId: "householdId",
    email: "email",
    role: "role",
    invitedBy: "invitedBy",
    expiresAt: "expiresAt",
    acceptedAt: "acceptedAt",
    revokedAt: "revokedAt",
  },
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
import { INVITATION_LIMIT } from "@/lib/rate-limit";
import { POST } from "./route";

// The mail is sent when the environment carries a Resend key, and a test
// that sent one would send it. The key is taken out of the environment for
// the run and put back afterwards.
const resendKey = process.env.RESEND_API_KEY;
delete process.env.RESEND_API_KEY;

afterAll(() => {
  if (resendKey === undefined) {
    delete process.env.RESEND_API_KEY;
  } else {
    process.env.RESEND_API_KEY = resendKey;
  }
});

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/households/invitations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** A signed-in caller with a household active. */
function signedIn(householdId = "h1", userId = "u1") {
  vi.mocked(requireActiveOrganization).mockResolvedValue({
    session: { user: { id: userId, name: "U", email: "u@example.test" }, activeHouseholdId: householdId },
    orgId: householdId,
    requestHeaders: new Headers(),
  } as never);
}

/** The role the database reports for the caller. */
function callerIs(role: string | null) {
  vi.mocked(db.execute).mockResolvedValue({ rows: [{ role }] } as never);
}

/** The invitation the insert returns. */
function insertSucceeds() {
  vi.mocked(db.insert).mockReturnValue({
    values: vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([{ id: "invitation-1" }]),
    }),
  } as never);
}

// The three answers the route gives, and the order they are given in.
describe("POST /api/households/invitations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // The caller's household is the test's own: the limit counts per
    // household, and a household that carries one test's calls must not
    // carry the next one's.
    vi.mocked(requireActiveOrganization).mockReset();
    // Default: the caller is an owner, and the insert is chainable.
    callerIs("owner");
    insertSucceeds();
  });

  test("returns 401 if not authenticated, before the database is touched", async () => {
    // S-7: the session check is the first thing the route does, so a caller
    // with no session costs a cookie read and nothing else - no query, no
    // mail, no row.
    vi.mocked(requireActiveOrganization).mockResolvedValueOnce(
      Response.json({ error: "Unauthorized" }, { status: 401 }) as never,
    );

    const res = await POST(makeRequest({ email: "someone@example.test" }));

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBeDefined();
    expect(db.execute).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });

  test("returns 403 for a plain member, and writes nothing", async () => {
    // S-3: an authorization failure is a 403 with a stable answer, not a
    // 500, and it is not counted against the household's limit.
    signedIn();
    callerIs("member");

    const res = await POST(makeRequest({ email: "someone@example.test" }));

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBeDefined();
    expect(db.insert).not.toHaveBeenCalled();
  });

  test("returns 201 and writes the invitation for an administrator", async () => {
    signedIn();
    const res = await POST(makeRequest({ email: "someone@example.test" }));

    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.invitationId).toBe("invitation-1");
    expect(db.insert).toHaveBeenCalledTimes(1);
  });

  test("returns 429 when the household is over the limit, and writes nothing", async () => {
    // S-7: the limit answers 429 with a stable code, and the body says what
    // to try later.
    signedIn("h-limit");
    callerIs("owner");

    for (let call = 0; call < INVITATION_LIMIT.max; call += 1) {
      const allowed = await POST(makeRequest({ email: "someone@example.test" }));
      expect(allowed.status).toBe(201);
    }

    const res = await POST(makeRequest({ email: "someone@example.test" }));

    expect(res.status).toBe(429);
    const json = await res.json();
    expect(json.code).toBe("RATE_LIMITED");
    expect(json.error).toMatch(/try again/i);
    // The caller is told when to come back.
    expect(Number(res.headers.get("Retry-After"))).toBeGreaterThan(0);
    // The invitation was not written: the limit stops the work, it does not
    // only report it.
    expect(db.insert).toHaveBeenCalledTimes(INVITATION_LIMIT.max);
  });

  test("returns 403 for a plain member while the household is over the limit", async () => {
    // The order of the two answers: a caller who may not act is not a caller
    // to be counted, and a 429 where a 403 belongs would tell the caller the
    // wrong thing. The limit is asked after the role check, so the refusal
    // is the refusal.
    signedIn("h-over");
    callerIs("owner");

    for (let call = 0; call < INVITATION_LIMIT.max; call += 1) {
      await POST(makeRequest({ email: "someone@example.test" }));
    }

    callerIs("member");
    const res = await POST(makeRequest({ email: "someone@example.test" }));

    expect(res.status).toBe(403);
  });

  test("does not count a refusal against the household's limit", async () => {
    // A plain member's refusal is not an invitation, so it does not spend
    // the household's quota. The administrator who comes after it is still
    // inside the limit.
    signedIn("h-refused");
    callerIs("owner");

    for (let call = 0; call < INVITATION_LIMIT.max - 1; call += 1) {
      await POST(makeRequest({ email: "someone@example.test" }));
    }

    callerIs("member");
    const refused = await POST(makeRequest({ email: "someone@example.test" }));
    expect(refused.status).toBe(403);

    callerIs("owner");
    const allowed = await POST(makeRequest({ email: "someone@example.test" }));
    expect(allowed.status).toBe(201);

    const refusedByLimit = await POST(makeRequest({ email: "someone@example.test" }));
    expect(refusedByLimit.status).toBe(429);
  });

  test("keeps one household's limit out of another's", async () => {
    // The limit counts per household: the quota is the household's, and a
    // household is not affected by anybody else's.
    signedIn("h-one");
    callerIs("owner");

    for (let call = 0; call < INVITATION_LIMIT.max; call += 1) {
      await POST(makeRequest({ email: "someone@example.test" }));
    }

    const overLimit = await POST(makeRequest({ email: "someone@example.test" }));
    expect(overLimit.status).toBe(429);

    signedIn("h-two");
    const otherHousehold = await POST(makeRequest({ email: "someone@example.test" }));
    expect(otherHousehold.status).toBe(201);
  });
});
