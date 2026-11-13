import { requireActiveOrganization } from "@/lib/request-auth";
import { listMembers } from "@/server/services/households";
import type { Scope } from "@/db/scope";

/**
 * The household's members.
 *
 * The list is scoped to the *user*, not to a household, so it goes through
 * the read-only membership scope. It is one of the two callers of that
 * scope, and there is no third.
 */
export async function GET() {
  const authContext = await requireActiveOrganization();
  if (authContext instanceof Response) {
    return authContext;
  }

  const scope: Scope = {
    userId: authContext.session.user.id,
    householdId: authContext.orgId,
  };

  try {
    const members = await listMembers(scope);
    return Response.json(members, { status: 200 });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Failed to fetch members" }, { status: 500 });
  }
}
