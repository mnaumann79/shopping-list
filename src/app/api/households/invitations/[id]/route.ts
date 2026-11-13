import { requireActiveOrganization } from "@/lib/request-auth";
import { cancelInvitation } from "@/server/services/invitations";
import { ServiceError } from "@/server/services/service-error";
import type { Scope } from "@/db/scope";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Cancels an invitation.
 *
 * Revoking one invitation does not touch the others: several may be live at
 * once, and each is revocable on its own.
 */
export async function DELETE(_req: Request, { params }: RouteContext) {
  const authContext = await requireActiveOrganization();
  if (authContext instanceof Response) {
    return authContext;
  }

  const { id } = await params;

  const scope: Scope = {
    userId: authContext.session.user.id,
    householdId: authContext.orgId,
  };

  try {
    await cancelInvitation(scope, id);
    return new Response(null, { status: 204 });
  } catch (error) {
    if (error instanceof ServiceError) {
      return Response.json({ error: error.message }, { status: error.status });
    }

    console.error(error);
    return Response.json({ error: "Failed to cancel invitation" }, { status: 500 });
  }
}
