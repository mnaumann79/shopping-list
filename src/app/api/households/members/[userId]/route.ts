import { requireActiveOrganization } from "@/lib/request-auth";
import { removeMember } from "@/server/services/households";
import { ServiceError } from "@/server/services/service-error";
import type { Scope } from "@/db/scope";

type RouteContext = {
  params: Promise<{ userId: string }>;
};

/**
 * Removes a member from the household.
 *
 * The member is named by their user id in the path, and the household comes
 * from the session — the caller cannot remove somebody from a household they
 * are not in, because the household is not theirs to name.
 */
export async function DELETE(_req: Request, { params }: RouteContext) {
  const authContext = await requireActiveOrganization();
  if (authContext instanceof Response) {
    return authContext;
  }

  const { userId } = await params;

  const scope: Scope = {
    userId: authContext.session.user.id,
    householdId: authContext.orgId,
  };

  try {
    await removeMember(scope, userId);

    return new Response(null, { status: 204 });
  } catch (error) {
    if (error instanceof ServiceError) {
      return Response.json({ error: error.message }, { status: error.status });
    }

    console.error(error);
    return Response.json({ error: "Failed to remove member" }, { status: 500 });
  }
}
