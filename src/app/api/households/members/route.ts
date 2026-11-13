import { requireActiveOrganization } from "@/lib/request-auth";
import { removeMember } from "@/server/services/households";
import { ServiceError } from "@/server/services/service-error";
import type { Scope } from "@/db/scope";
import { NextRequest } from "next/server";

/**
 * Removes a member from the household.
 *
 * The household comes from the session, and the role check is on the
 * server: a plain member gets a 403, not a 500 (S-3).
 *
 * The member is named by their user id. The path form
 * (`DELETE /api/households/members/:userId`) is the contract's; this one
 * takes the id in the body, which is what today's client calls, and it goes
 * when the client is rewritten.
 */
export async function DELETE(req: NextRequest) {
  const authContext = await requireActiveOrganization();
  if (authContext instanceof Response) {
    return authContext;
  }

  const body = await req.json().catch(() => null);
  if (!body?.memberId) {
    return Response.json({ error: "memberId is required" }, { status: 400 });
  }

  const scope: Scope = {
    userId: authContext.session.user.id,
    householdId: authContext.orgId,
  };

  try {
    await removeMember(scope, body.memberId);

    return Response.json({ success: true }, { status: 200 });
  } catch (error) {
    if (error instanceof ServiceError) {
      return Response.json({ error: error.message }, { status: error.status });
    }

    console.error(error);
    return Response.json({ error: "Failed to remove member" }, { status: 500 });
  }
}
