import { requireActiveOrganization } from "@/lib/request-auth";
import { clearCompletedItems } from "@/server/services/items";

export async function POST() {
  const authContext = await requireActiveOrganization();
  if (authContext instanceof Response) {
    return authContext;
  }

  try {
    const clearedItems = await clearCompletedItems(authContext.orgId);
    return Response.json({ clearedItems }, { status: 200 });
  } catch {
    return Response.json({ error: "Failed to clear completed items" }, { status: 500 });
  }
}
