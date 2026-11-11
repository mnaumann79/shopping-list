import { requireActiveOrganization } from "@/lib/request-auth";
import { listArchivedItems } from "@/server/services/items";

export async function GET() {
  const authContext = await requireActiveOrganization();
  if (authContext instanceof Response) return authContext;

  try {
    return Response.json(await listArchivedItems(authContext.orgId));
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Failed to fetch item history" }, { status: 500 });
  }
}
