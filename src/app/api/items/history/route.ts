import { requireActiveOrganization } from "@/lib/request-auth";
import { listArchivedItems } from "@/server/services/items";
import type { Scope } from "@/db/scope";

export async function GET() {
  const authContext = await requireActiveOrganization();
  if (authContext instanceof Response) return authContext;

  const scope: Scope = {
    userId: authContext.session.user.id,
    householdId: authContext.orgId,
  };

  try {
    return Response.json(await listArchivedItems(scope));
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Failed to fetch item history" }, { status: 500 });
  }
}
