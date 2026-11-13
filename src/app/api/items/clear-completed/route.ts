import { requireActiveOrganization } from "@/lib/request-auth";
import { clearCompletedItems } from "@/server/services/items";
import type { Scope } from "@/db/scope";

export async function POST() {
  const authContext = await requireActiveOrganization();
  if (authContext instanceof Response) {
    return authContext;
  }

  const scope: Scope = {
    userId: authContext.session.user.id,
    householdId: authContext.orgId,
  };

  try {
    const clearedItems = await clearCompletedItems(scope);
    return Response.json({ clearedItems }, { status: 200 });
  } catch {
    return Response.json({ error: "Failed to clear completed items" }, { status: 500 });
  }
}
