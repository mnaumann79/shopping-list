import { headers } from "next/headers";
import { auth, type Session } from "@/lib/auth";

export async function getRequestHeaders() {
  return headers();
}

export async function getRequestSession(): Promise<Session | null> {
  return auth.api.getSession({ headers: await getRequestHeaders() });
}

export async function requireRequestSession(): Promise<Session | Response> {
  const session = await getRequestSession();
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  return session;
}

export async function requireActiveOrganization(): Promise<
  { session: Session; orgId: string; requestHeaders: Awaited<ReturnType<typeof getRequestHeaders>> } | Response
> {
  const session = await requireRequestSession();
  if (session instanceof Response) {
    return session;
  }

  const requestHeaders = await getRequestHeaders();
  const orgId = session.session.activeOrganizationId;
  if (!orgId) {
    return Response.json({ error: "No active household" }, { status: 400 });
  }

  return { session, orgId, requestHeaders };
}
