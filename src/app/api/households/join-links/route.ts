import { requireActiveOrganization } from "@/lib/request-auth";
import { createJoinLink } from "@/server/services/households";
import { ServiceError } from "@/server/services/service-error";
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
    const result = await createJoinLink(scope);

    return Response.json(result, { status: 200 });
  } catch (error) {
    // An authorization failure is a 403, not a 500: a plain member asking
    // for a join link is told the truth (S-1, S-3).
    if (error instanceof ServiceError) {
      return Response.json({ error: error.message }, { status: error.status });
    }

    console.error(error);
    return Response.json({ error: "Failed to generate join link" }, { status: 500 });
  }
}
