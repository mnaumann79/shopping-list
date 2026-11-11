import { requireActiveOrganization } from "@/lib/request-auth";
import { removeHouseholdMember } from "@/server/services/households";
import { ServiceError } from "@/server/services/service-error";
import { NextRequest } from "next/server";

export async function DELETE(req: NextRequest) {
  const authContext = await requireActiveOrganization();
  if (authContext instanceof Response) {
    return authContext;
  }

  const body = await req.json().catch(() => null);
  if (!body?.memberId) {
    return Response.json({ error: "memberId is required" }, { status: 400 });
  }

  try {
    await removeHouseholdMember({
      memberId: body.memberId,
      orgId: authContext.orgId,
      requestHeaders: authContext.requestHeaders,
    });

    return Response.json({ success: true }, { status: 200 });
  } catch (error) {
    if (error instanceof ServiceError) {
      return Response.json({ error: error.message }, { status: error.status });
    }

    console.error(error);
    return Response.json({ error: "Failed to remove member" }, { status: 500 });
  }
}
