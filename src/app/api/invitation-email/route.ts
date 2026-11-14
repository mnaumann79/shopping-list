import { eq } from "drizzle-orm";
import { z } from "zod";
import { withScope } from "@/db/scope";
import { householdInvitations } from "@/db/schema/households";
import { requireActiveOrganization } from "@/lib/request-auth";

/**
 * The email an invitation was sent to.
 *
 * The endpoint used to answer without a session, so anybody who guessed an
 * invitation id could read the address it was sent to (S-4). It now needs a
 * session: the address is the household's business, not the internet's.
 *
 * **The scope is the caller's active household.** The invitation is one of
 * that household's rows, and it is read through the policies: the caller has
 * to be a member of the household the invitation belongs to, and the
 * household has to be the one the caller is looking at. A read that named no
 * household would be narrowed by the membership alone, and would answer for
 * every household the caller belongs to.
 *
 * The row it reads is `household_invitations` — the table the application
 * writes. It used to read Better Auth's `invitation` table, which nothing
 * writes since the auth swap, so the endpoint answered `{email: null}` for
 * every id the application creates.
 */
export async function GET(req: Request) {
  const authContext = await requireActiveOrganization();
  if (authContext instanceof Response) {
    return authContext;
  }

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return Response.json({ email: null });
  if (!z.string().uuid().safeParse(id).success) {
    // The ids are uuids, and a string that is not one is not an invitation.
    return Response.json({ email: null });
  }

  const scope = {
    userId: authContext.session.user.id,
    householdId: authContext.orgId,
  };

  const row = await withScope(scope, (tx) =>
    tx
      .select({ email: householdInvitations.email })
      .from(householdInvitations)
      .where(eq(householdInvitations.id, id))
      .limit(1)
      .then((rows) => rows[0]),
  );

  // The invitation id is a bearer token, so a session is not enough: the
  // caller has to be the person the invitation was sent to. The household's
  // own view of its pending invitations is the invitations endpoint, which
  // checks the role.
  //
  // So there are two answers. A caller who is a member of the household the
  // invitation belongs to, and who is not the person it was sent to, is told
  // 403: the invitation exists, and it is not theirs. A caller whose
  // household has no such invitation gets no answer to give — the row was
  // never visible to them, and there is nothing to disclose.
  if (row && row.email !== authContext.session.user.email) {
    return Response.json({ email: null }, { status: 403 });
  }

  return Response.json({ email: row?.email ?? null });
}
