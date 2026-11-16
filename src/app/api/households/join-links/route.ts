import { requireActiveOrganization } from "@/lib/request-auth";
import {
  ADMIN_ROLES,
  createJoinLink,
  requireHouseholdRole,
} from "@/server/services/households";
import { ServiceError } from "@/server/services/service-error";
import { admit, JOIN_LINK_LIMIT } from "@/lib/rate-limit";
import type { Scope } from "@/db/scope";

/**
 * Mints a join link.
 *
 * **The three answers, in the order they are given.** A caller with no
 * session is refused at the session check (401), before the database is
 * touched at all. A caller who may not mint a link is refused by the role
 * check (403). A caller who may mint one and has minted too many is refused
 * by the limit (429). The limit is the last of the three, and that order is
 * the point: a caller who may not act is not a caller to be counted, and a
 * 429 where a 403 belongs would tell the caller the wrong thing (S-1, S-3).
 */
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
    // The role check runs here as well as in the service, because the limit
    // below must not pre-empt it. The service's own check is the one that
    // decides; this one is what puts the refusal in front of the limit.
    await requireHouseholdRole(scope, ADMIN_ROLES);

    const admission = admit(`join-link:${scope.householdId}`, JOIN_LINK_LIMIT);

    if (!admission.allowed) {
      return Response.json(
        {
          error: "Too many join links. Try again later.",
          code: "RATE_LIMITED",
        },
        {
          status: 429,
          headers: { "Retry-After": String(admission.retryAfterSeconds) },
        },
      );
    }

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
