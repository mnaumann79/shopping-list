import { db } from "@/db";
import { stores } from "@/db/schema";
import { requireActiveOrganization } from "@/lib/request-auth";
import { and, eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { z } from "zod";

const storeSchema = z.object({
  name: z.string().trim().min(1).max(100),
});

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(req: NextRequest, { params }: RouteContext) {
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

  const { id } = await params;

  try {
    const [store] = await db
      .update(stores)
      .set({ name: parsed.data.name, updatedAt: new Date() })
      .where(and(eq(stores.id, id), eq(stores.householdId, authContext.orgId)))
      .returning();

    if (!store) {
      return Response.json({ error: "Store not found" }, { status: 404 });
    }

    return Response.json(store, { status: 200 });
  } catch {
    return Response.json({ error: "Failed to update store" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  const authContext = await requireActiveOrganization();
  if (authContext instanceof Response) {
    return authContext;
  }

  const { id } = await params;

  try {
    const [deleted] = await db
      .delete(stores)
      .where(and(eq(stores.id, id), eq(stores.householdId, authContext.orgId)))
      .returning();

    if (!deleted) {
      return Response.json({ error: "Store not found" }, { status: 404 });
    }

    return Response.json({ success: true }, { status: 200 });
  } catch {
    return Response.json({ error: "Failed to delete store" }, { status: 500 });
  }
}
