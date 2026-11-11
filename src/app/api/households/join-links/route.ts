import { requireActiveOrganization } from "@/lib/request-auth";
import { createJoinLink } from "@/server/services/households";

export async function POST() {
  const authContext = await requireActiveOrganization();
  if (authContext instanceof Response) {
    return authContext;
  }

  try {
    const result = await createJoinLink({
      orgId: authContext.orgId,
      userId: authContext.session.user.id,
    });

    return Response.json(result, { status: 200 });
  } catch {
    return Response.json({ error: "Failed to generate join link" }, { status: 500 });
  }
}
