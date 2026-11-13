import { headers } from "next/headers";
import type { Session } from "@/lib/auth";
import { getVerifiedSession } from "@/lib/supabase/server";

/**
 * The caller, and the household they are acting on.
 *
 * `userId` is the caller's verified identity — the uuid the auth server
 * vouches for. `householdId` is the household the `sb-household` cookie
 * names; it is a pointer, and whether the caller may act on it is what
 * `household_members` says inside the scope helper's transaction. `claims`
 * are the access token's claims, as the auth server signed them.
 */
export type RequestContext = {
  userId: string;
  householdId: string;
  claims: Record<string, unknown>;
};

export async function getRequestHeaders() {
  return headers();
}

/**
 * The caller's session, or null when there is none.
 *
 * The session is resolved from the Supabase session cookie and verified
 * against the auth server's claims. It is not read out of the cookie: the
 * cookie is a place a caller can write to, and the claims are what the auth
 * server signed.
 */
export async function getRequestSession(): Promise<Session | null> {
  const session = await getVerifiedSession();
  if (!session) return null;

  return {
    user: {
      id: session.userId,
      name: session.name ?? "",
      email: session.email ?? "",
    },
    activeHouseholdId: session.householdId,
  };
}

export async function requireRequestSession(): Promise<Session | Response> {
  const session = await getRequestSession();
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  return session;
}

/**
 * The caller and the household they are acting on.
 *
 * The shape every household-scoped route works from: the user's id, the
 * household's id, and the claims.
 */
export async function requireRequestContext(): Promise<RequestContext | Response> {
  const session = await getVerifiedSession();
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!session.householdId) {
    return Response.json({ error: "No active household" }, { status: 400 });
  }

  return {
    userId: session.userId,
    householdId: session.householdId,
    claims: session.claims,
  };
}

/**
 * The caller's session and the household it is looking at.
 *
 * The `orgId` field keeps Better Auth's name: the route files and their
 * tests read it, and the rename belongs with their rewrite.
 */
export async function requireActiveOrganization(): Promise<
  { session: Session; orgId: string; requestHeaders: Awaited<ReturnType<typeof getRequestHeaders>> } | Response
> {
  const session = await requireRequestSession();
  if (session instanceof Response) {
    return session;
  }

  const requestHeaders = await getRequestHeaders();
  const orgId = session.activeHouseholdId;
  if (!orgId) {
    return Response.json({ error: "No active household" }, { status: 400 });
  }

  return { session, orgId, requestHeaders };
}
