import { requireActiveOrganization } from "@/lib/request-auth";
import { createItem, listActiveItems } from "@/server/services/items";
import { ServiceError, getErrorMessage } from "@/server/services/service-error";
import type { Scope } from "@/db/scope";
import { NextRequest } from "next/server";
import { z } from "zod";

const itemSchema = z.object({
  name: z.string().trim().min(1).max(200),
  quantity: z.string().optional().nullable(),
  note: z.string().optional().nullable(),
  categoryId: z.string().trim().min(1).optional().nullable(),
  storeIds: z.array(z.string().trim().min(1)).optional(),
});

export async function GET() {
  const authResult = await requireActiveOrganization();
  if (authResult instanceof Response) {
    return authResult;
  }

  const scope: Scope = {
    userId: authResult.session.user.id,
    householdId: authResult.orgId,
  };

  try {
    const itemList = await listActiveItems(scope);
    return Response.json(itemList, { status: 200 });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Failed to fetch items" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const authResult = await requireActiveOrganization();
  if (authResult instanceof Response) {
    return authResult;
  }

  const body = await req.json().catch(() => null);
  const parsed = itemSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "name is required and must be 1-200 characters" },
      { status: 400 }
    );
  }

  const scope: Scope = {
    userId: authResult.session.user.id,
    householdId: authResult.orgId,
  };

  try {
    const item = await createItem({
      scope,
      ...parsed.data,
    });

    return Response.json(item, { status: 201 });
  } catch (error) {
    if (error instanceof ServiceError) {
      return Response.json({ error: error.message }, { status: error.status });
    }

    console.error(error);
    return Response.json({ error: getErrorMessage(error, "Failed to create item") }, { status: 500 });
  }
}
