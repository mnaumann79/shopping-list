import { describe, test, expect, vi, beforeEach } from "vitest";

// Mock next/headers
vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}));

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
import { DELETE } from "./route";

const OWNER_ID = "11111111-1111-4111-8111-111111111111";
const ADMIN_ID = "22222222-2222-4222-8222-222222222222";
const MEMBER_ID = "33333333-3333-4333-8333-333333333333";
const HOUSEHOLD_ID = "44444444-4444-4444-8444-444444444444";

/** A session for the given user, with the household active. */
function signedIn(userId: string) {
  vi.mocked(requireActiveOrganization).mockResolvedValueOnce({
    session: { user: { id: userId, name: "U", email: "u@example.test" }, activeHouseholdId: HOUSEHOLD_ID },
    orgId: HOUSEHOLD_ID,
    requestHeaders: new Headers(),
  } as never);
}

/** The role the database reports for the caller. */
function callerIs(role: string | null) {
  vi.mocked(db.execute).mockResolvedValue({ rows: [{ role }] } as never);
}

/** The membership row the target is — no role means no row. */
function targetIs(role: string | null) {
  vi.mocked(db.select).mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(role ? [{ role }] : []),
      }),
    }),
  } as never);
}

function remove(userId: string) {
  return DELETE(new Request("http://localhost"), {
    params: Promise.resolve({ userId }),
  });
}

describe("DELETE /api/households/members/:userId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: the caller is the owner, and the target is a plain member.
    callerIs("owner");
    targetIs("member");
    vi.mocked(db.delete).mockReturnValue({
      where: vi.fn().mockResolvedValue([{ userId: MEMBER_ID }]),
    } as never);
  });

  test("returns 401 without a session", async () => {
    vi.mocked(requireActiveOrganization).mockResolvedValueOnce(
      Response.json({ error: "Unauthorized" }, { status: 401 }) as never,
    );

    const res = await remove(MEMBER_ID);

    expect(res.status).toBe(401);
  });

  test("returns 400 when there is no active household", async () => {
    vi.mocked(requireActiveOrganization).mockResolvedValueOnce(
      Response.json({ error: "No active household" }, { status: 400 }) as never,
    );

    const res = await remove(MEMBER_ID);

    expect(res.status).toBe(400);
  });

  test("returns 403 for a plain member", async () => {
    signedIn(MEMBER_ID);
    callerIs("member");

    const res = await remove(MEMBER_ID);

    expect(res.status).toBe(403);
    expect(db.delete).not.toHaveBeenCalled();
  });

  test("the caller cannot remove themselves", async () => {
    signedIn(OWNER_ID);
    callerIs("owner");

    const res = await remove(OWNER_ID);

    expect(res.status).toBe(400);
    expect(db.delete).not.toHaveBeenCalled();
  });

  test("the caller cannot remove themselves through another spelling of their id", async () => {
    // PostgreSQL accepts an id without hyphens and in braces: they are the
    // same id, so a string comparison would let the removal through.
    signedIn(OWNER_ID);
    callerIs("owner");

    const res = await remove(OWNER_ID.replace(/-/g, ""));

    expect(res.status).toBe(400);
    expect(db.delete).not.toHaveBeenCalled();
  });

  test("the caller cannot remove themselves through an uppercase id", async () => {
    signedIn(OWNER_ID);
    callerIs("owner");

    const res = await remove(OWNER_ID.toUpperCase());

    expect(res.status).toBe(400);
    expect(db.delete).not.toHaveBeenCalled();
  });

  test("returns 400 for an id that is not an id", async () => {
    signedIn(OWNER_ID);
    callerIs("owner");

    const res = await remove("not-an-id");

    expect(res.status).toBe(400);
    expect(db.delete).not.toHaveBeenCalled();
  });

  test("an admin cannot remove the owner", async () => {
    // Nothing can put an owner back — an invitation never grants the owner
    // role — so the owner's row is the owner's to remove.
    signedIn(ADMIN_ID);
    callerIs("admin");
    targetIs("owner");

    const res = await remove(OWNER_ID);

    expect(res.status).toBe(403);
    expect(db.delete).not.toHaveBeenCalled();
  });

  test("an admin cannot remove another admin", async () => {
    signedIn(ADMIN_ID);
    callerIs("admin");
    targetIs("admin");

    const res = await remove(MEMBER_ID);

    expect(res.status).toBe(403);
    expect(db.delete).not.toHaveBeenCalled();
  });

  test("an owner removes a plain member", async () => {
    signedIn(OWNER_ID);
    callerIs("owner");
    targetIs("member");

    const res = await remove(MEMBER_ID);

    expect(res.status).toBe(204);
    expect(db.delete).toHaveBeenCalled();
  });

  test("an admin removes a plain member", async () => {
    signedIn(ADMIN_ID);
    callerIs("admin");
    targetIs("member");

    const res = await remove(MEMBER_ID);

    expect(res.status).toBe(204);
    expect(db.delete).toHaveBeenCalled();
  });

  test("an owner removes an admin", async () => {
    // Removing an admin is the reversible one: the owner can invite them
    // back as an admin.
    signedIn(OWNER_ID);
    callerIs("owner");
    targetIs("admin");

    const res = await remove(ADMIN_ID);

    expect(res.status).toBe(204);
    expect(db.delete).toHaveBeenCalled();
  });

  test("returns 404 when the member is not in the household", async () => {
    signedIn(OWNER_ID);
    callerIs("owner");
    targetIs(null);

    const res = await remove(MEMBER_ID);

    expect(res.status).toBe(404);
    expect(db.delete).not.toHaveBeenCalled();
  });
});
