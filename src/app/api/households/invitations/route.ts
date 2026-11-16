import { requireActiveOrganization } from "@/lib/request-auth";
import { createInvitation, listInvitations } from "@/server/services/invitations";
import { ADMIN_ROLES, requireHouseholdRole } from "@/server/services/households";
import { ServiceError } from "@/server/services/service-error";
import { admit, INVITATION_LIMIT } from "@/lib/rate-limit";
import type { Scope } from "@/db/scope";
import { NextRequest } from "next/server";
import { z } from "zod";

const invitationSchema = z.object({
  email: z.string().email(),
  role: z.enum(["admin", "member"]).default("member"),
});

export async function GET() {
  const authContext = await requireActiveOrganization();
  if (authContext instanceof Response) {
    return authContext;
  }

  const scope: Scope = {
    userId: authContext.session.user.id,
    householdId: authContext.orgId,
  };

  try {
    const invitations = await listInvitations(scope);
    return Response.json(invitations, { status: 200 });
  } catch (error) {
    if (error instanceof ServiceError) {
      return Response.json({ error: error.message }, { status: error.status });
    }

    console.error(error);
    return Response.json({ error: "Failed to fetch invitations" }, { status: 500 });
  }
}

/**
 * Invites somebody by email.
 *
 * The mail is sent by the application: Better Auth's plugin owned the
 * mailer, and the plugin goes with the auth swap. The mail is the only
 * channel a member has to join, so it carries the link to the invitation.
 *
 * **The three answers, in the order they are given.** A caller with no
 * session is refused at the session check (401), before the database is
 * touched at all. A caller who may not invite is refused by the role check
 * (403). A caller who may invite and has invited too often is refused by the
 * limit (429). The limit is the last of the three, and that order is the
 * point: a caller who may not act is not a caller to be counted, and a 429
 * where a 403 belongs would tell the caller the wrong thing (S-3).
 */
export async function POST(req: NextRequest) {
  const authContext = await requireActiveOrganization();
  if (authContext instanceof Response) {
    return authContext;
  }

  const body = await req.json().catch(() => null);
  const parsed = invitationSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "A valid email address is required" }, { status: 400 });
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

    const admission = admit(`invitation:${scope.householdId}`, INVITATION_LIMIT);

    if (!admission.allowed) {
      return Response.json(
        {
          error: "Too many invitations. Try again later.",
          code: "RATE_LIMITED",
        },
        {
          status: 429,
          headers: { "Retry-After": String(admission.retryAfterSeconds) },
        },
      );
    }

    const invitation = await createInvitation(scope, parsed.data.email, parsed.data.role);
    return Response.json(invitation, { status: 201 });
  } catch (error) {
    if (error instanceof ServiceError) {
      return Response.json({ error: error.message }, { status: error.status });
    }

    console.error(error);
    return Response.json({ error: "Failed to send invitation" }, { status: 500 });
  }
}
