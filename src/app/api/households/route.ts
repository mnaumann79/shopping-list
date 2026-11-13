import { requireActiveOrganization, requireRequestSession } from "@/lib/request-auth";
import { createHousehold, listHouseholds } from "@/server/services/households";
import { ServiceError } from "@/server/services/service-error";
import type { Scope } from "@/db/scope";
import { NextRequest } from "next/server";
import { z } from "zod";

const householdSchema = z.object({
  name: z.string().trim().min(1).max(100),
});

/**
 * The caller's households.
 *
 * The household list is scoped to the *user*, not to a household: it is the
 * one call in the application that goes through the read-only membership
 * scope, and it is the only one.
 */
export async function GET() {
  const session = await requireRequestSession();
  if (session instanceof Response) {
    return session;
  }

  try {
    const households = await listHouseholds({ userId: session.user.id } as Scope);
    return Response.json(households, { status: 200 });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Failed to fetch households" }, { status: 500 });
  }
}

/**
 * Creates a household and makes the caller its owner.
 *
 * The household and its first membership row are one unit of work, and that
 * first row is a **bootstrap** rather than an ordinary membership write: the
 * membership policy has a special case for it, because the creator is not a
 * member of the household yet — there is nobody else in it — and the
 * bootstrap function (app_household_bootstrap) is what allows that one
 * insert, and only for the household's creator.
 */
export async function POST(req: NextRequest) {
  // The session, not an active household: a caller who has no household yet
  // is exactly the caller who creates the first one.
  const session = await requireRequestSession();
  if (session instanceof Response) {
    return session;
  }

  const body = await req.json().catch(() => null);
  const parsed = householdSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "name is required and must be 1-100 characters" }, { status: 400 });
  }

  const scope: Scope = {
    userId: session.user.id,
    householdId: "",
  };

  try {
    const household = await createHousehold(scope, parsed.data.name);
    return Response.json(household, { status: 201 });
  } catch (error) {
    if (error instanceof ServiceError) {
      return Response.json({ error: error.message }, { status: error.status });
    }

    console.error(error);
    return Response.json({ error: "Failed to create household" }, { status: 500 });
  }
}
