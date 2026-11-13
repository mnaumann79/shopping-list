import { headers } from "next/headers";
import type { Session } from "@/lib/auth";
import { getVerifiedUser } from "@/lib/supabase/server";

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
  const user = await getVerifiedUser();
  if (!user) return null;

  return {
    user: {
      id: user.userId,
      name: user.name ?? "",
      email: user.email ?? "",
    },
    activeHouseholdId: user.householdId,
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
 * The caller's session and the household it is looking at.
 *
 * The name and the `orgId` field are Better Auth's, and they are kept for
 * now: eleven API route files call this, and they are being rewritten with
 * the scope helper. Renaming them here would break every one of those files
 * in a pull request that is not allowed to touch them. The rename belongs
 * with the rewrite.
 */
export async function requireActiveOrganization(): Promise<
  { session: Session; orgId: string; requestHeaders: Awaited<ReturnType<typeof getRequestHeaders>> } | Response
> {
  const session = await requireRequestSession();
  if (session instanceof Response) {
    return session;
  }

  const requestHeaders = await getRequestHeaders();
  const householdId = session.activeHouseholdId;
  if (!householdId) {
    return Response.json({ error: "No active household" }, { status: 400 });
  }

  return { session, orgId: householdId, requestHeaders };
}
