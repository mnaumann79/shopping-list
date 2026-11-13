import { stores } from "@/db/schema";
import { withScope, type Scope } from "@/db/scope";
import { requireActiveOrganization } from "@/lib/request-auth";
import { and, eq, asc } from "drizzle-orm";
import { NextRequest } from "next/server";
import { z } from "zod";

const storeSchema = z.object({
  name: z.string().trim().min(1).max(100),
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
    const storeList = await withScope(scope, (tx) =>
      tx
        .select()
        .from(stores)
        .where(and(eq(stores.householdId, scope.householdId), eq(stores.isActive, true)))
        .orderBy(asc(stores.name)),
    );

    return Response.json(storeList, { status: 200 });
  } catch {
    return Response.json({ error: "Failed to fetch stores" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const authContext = await requireActiveOrganization();
  if (authContext instanceof Response) {
    return authContext;
  }

  const body = await req.json().catch(() => null);
  const parsed = storeSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "name is required and must be 1-100 characters" },
      { status: 400 }
    );
  }

  const scope: Scope = {
    userId: authContext.session.user.id,
    householdId: authContext.orgId,
  };

  try {
    const [store] = await withScope(scope, (tx) =>
      tx
        .insert(stores)
        .values({
          householdId: scope.householdId,
          name: parsed.data.name,
        })
        .returning(),
    );

    return Response.json(store, { status: 201 });
  } catch {
    return Response.json({ error: "Failed to create store" }, { status: 500 });
  }
}
