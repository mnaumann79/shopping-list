import { and, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { withScope } from "@/db/scope";
import { householdMembers } from "@/db/schema/households";
import { getSessionUser } from "@/lib/supabase/server";
import { HOUSEHOLD_COOKIE, householdCookieOptions } from "@/lib/supabase/household-cookie";

/**
 * Make a household the session's active household.
 *
 * The client asks; the server decides. The household id in the body is only
 * ever checked — it is never taken on trust, because a client that could
 * choose its own household could point the application at a household it does
 * not belong to. The membership is read inside the scope helper's
 * transaction, where the claims are set and the row-level policies apply, so
 * the row is there if and only if the caller is a member.
 *
 * The cookie itself is written here, httpOnly. The client never writes it.
 */
export async function POST(req: Request) {
  const session = await getSessionUser();
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as { householdId?: string } | null;
  const householdId = body?.householdId;
  if (!householdId) {
    return Response.json({ error: "householdId is required" }, { status: 400 });
  }

  const membership = await withScope({ userId: session.userId, householdId }, (tx) =>
    tx
      .select({ role: householdMembers.role })
      .from(householdMembers)
      .where(
        and(
          eq(householdMembers.householdId, householdId),
          eq(householdMembers.userId, session.userId),
        ),
      )
      .limit(1),
  );

  if (!membership.length) {
    return Response.json({ error: "Not a member of that household" }, { status: 403 });
  }

  const cookieStore = await cookies();
  cookieStore.set(HOUSEHOLD_COOKIE, householdId, householdCookieOptions());

  return Response.json({ householdId });
}
