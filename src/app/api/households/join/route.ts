import { getRequestHeaders, requireRequestSession } from "@/lib/request-auth";
import { joinHousehold } from "@/server/services/households";
import { ServiceError } from "@/server/services/service-error";
import { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  const session = await requireRequestSession();
  if (session instanceof Response) {
    return session;
  }

  const body = await req.json().catch(() => null);
  if (!body?.token) {
    return Response.json({ error: "token is required" }, { status: 400 });
  }

  try {
    const result = await joinHousehold({
      token: body.token,
      userId: session.user.id,
      requestHeaders: await getRequestHeaders(),
    });

    return Response.json({ success: true, organizationId: result.organizationId }, { status: 200 });
  } catch (error) {
    if (error instanceof ServiceError) {
      return Response.json({ error: error.message }, { status: error.status });
    }

    console.error(error);
    return Response.json({ error: "Failed to join household" }, { status: 500 });
  }
}
