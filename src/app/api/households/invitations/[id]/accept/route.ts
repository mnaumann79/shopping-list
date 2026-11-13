import { requireRequestSession } from "@/lib/request-auth";
import { acceptInvitation } from "@/server/services/invitations";
import { ServiceError } from "@/server/services/service-error";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Accepts an invitation and joins the household.
 *
 * The membership row is written by app_accept_household_invitation, with the
 * owner's rights, so the caller's own identity is the only thing that
 * decides whether the invitation may be accepted: the function checks that
 * it is live and addressed to the caller's email, and it takes no user id.
 */
export async function POST(_req: Request, { params }: RouteContext) {
  const session = await requireRequestSession();
  if (session instanceof Response) {
    return session;
  }

  const { id } = await params;

  try {
    const result = await acceptInvitation(id);
    return Response.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof ServiceError) {
      return Response.json({ error: error.message }, { status: error.status });
    }

    console.error(error);
    return Response.json({ error: "Failed to accept invitation" }, { status: 500 });
  }
}
