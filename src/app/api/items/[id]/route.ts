import { requireActiveOrganization } from "@/lib/request-auth";
import { softDeleteItem, updateItem } from "@/server/services/items";
import { ServiceError } from "@/server/services/service-error";
import { NextRequest } from "next/server";
import { z } from "zod";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const itemPatchSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    quantity: z.string().optional().nullable(),
    note: z.string().optional().nullable(),
    categoryId: z.string().trim().min(1).optional().nullable(),
    isActive: z.boolean().optional(),
    isChecked: z.boolean().optional(),
    storeIds: z.array(z.string().trim().min(1)).optional(),
  })
  .refine(
    (value) =>
      value.name !== undefined ||
      value.quantity !== undefined ||
      value.note !== undefined ||
      value.categoryId !== undefined ||
      value.isActive !== undefined ||
      value.isChecked !== undefined ||
      value.storeIds !== undefined,
    { message: "At least one field is required" }
  );

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const authContext = await requireActiveOrganization();
  if (authContext instanceof Response) {
    return authContext;
  }

  const body = await req.json().catch(() => null);
  const parsed = itemPatchSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "At least one valid field is required" },
      { status: 400 }
    );
  }

  const { id } = await params;

  try {
    const updated = await updateItem({
      orgId: authContext.orgId,
      itemId: id,
      updates: parsed.data,
    });

    return Response.json(updated, { status: 200 });
  } catch (error) {
    if (error instanceof ServiceError) {
      return Response.json({ error: error.message }, { status: error.status });
    }

    console.error(error);
    return Response.json({ error: "Failed to update item" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  const authContext = await requireActiveOrganization();
  if (authContext instanceof Response) {
    return authContext;
  }

  const { id } = await params;

  try {
    await softDeleteItem(authContext.orgId, id);
    return Response.json({ success: true }, { status: 200 });
  } catch (error) {
    if (error instanceof ServiceError) {
      return Response.json({ error: error.message }, { status: error.status });
    }

    console.error(error);
    return Response.json({ error: "Failed to delete item" }, { status: 500 });
  }
}
