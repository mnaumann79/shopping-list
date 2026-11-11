import { requireActiveOrganization } from "@/lib/request-auth";
import { ServiceError } from "@/server/services/service-error";
import { reAddArchivedItem } from "@/server/services/items";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: RouteContext) {
  const authContext = await requireActiveOrganization();
  if (authContext instanceof Response) return authContext;

  const { id } = await params;
  try {
    return Response.json(await reAddArchivedItem(authContext.orgId, id));
  } catch (error) {
    if (error instanceof ServiceError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error(error);
    return Response.json({ error: "Failed to re-add item" }, { status: 500 });
  }
}
