import { requireActiveOrganization } from "@/lib/request-auth";
import { ServiceError } from "@/server/services/service-error";
import { reAddArchivedItem } from "@/server/services/items";
import type { Scope } from "@/db/scope";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: RouteContext) {
  const authContext = await requireActiveOrganization();
  if (authContext instanceof Response) return authContext;

  const { id } = await params;

  const scope: Scope = {
    userId: authContext.session.user.id,
    householdId: authContext.orgId,
  };

  try {
    return Response.json(await reAddArchivedItem(scope, id));
  } catch (error) {
    if (error instanceof ServiceError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error(error);
    return Response.json({ error: "Failed to re-add item" }, { status: 500 });
  }
}
