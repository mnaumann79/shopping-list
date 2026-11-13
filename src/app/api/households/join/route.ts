import { requireRequestSession } from "@/lib/request-auth";
import { joinHousehold } from "@/server/services/households";
import { ServiceError } from "@/server/services/service-error";
import { NextRequest } from "next/server";
import { withActiveHousehold } from "@/app/api/households/active-cookie";

/**
 * Joins the household the link names.
 *
 * The membership row is written by app_join_household_by_link, with the
 * owner's rights: the caller is not a member of the household yet, so the
 * membership policy cannot be part of that path, and the function takes no
 * user id — it uses auth.uid() — so a caller cannot write a membership row
 * for somebody else.
 */
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
    const result = await joinHousehold({ token: body.token });

    // The household the caller just joined is the active one.
    return withActiveHousehold(
      Response.json({ success: true, householdId: result.householdId }, { status: 200 }),
      result.householdId,
    );
  } catch (error) {
    if (error instanceof ServiceError) {
      return Response.json({ error: error.message }, { status: error.status });
    }

    console.error(error);
    return Response.json({ error: "Failed to join household" }, { status: 500 });
  }
}
