import { requireActiveOrganization } from "@/lib/request-auth";
import { createInvitation, listInvitations } from "@/server/services/invitations";
import { ServiceError } from "@/server/services/service-error";
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
