import { requireActiveOrganization } from "@/lib/request-auth";
import { inviteMember } from "@/server/services/households";
import { ServiceError } from "@/server/services/service-error";
import { NextRequest } from "next/server";
import { z } from "zod";

const inviteSchema = z.object({ email: z.string().email() });

export async function POST(req: NextRequest) {
  const authContext = await requireActiveOrganization();
  if (authContext instanceof Response) {
    return authContext;
  }

  const body = await req.json().catch(() => null);
  const parsed = inviteSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "A valid email address is required" }, { status: 400 });
  }

  try {
    const invitation = await inviteMember({
      email: parsed.data.email,
      orgId: authContext.orgId,
      requestHeaders: authContext.requestHeaders,
    });

    return Response.json({ success: true, invitation }, { status: 200 });
  } catch (error) {
    if (error instanceof ServiceError) {
      return Response.json({ error: error.message }, { status: error.status });
    }

    console.error(error);
    return Response.json({ error: "Failed to send invitation" }, { status: 500 });
  }
}
