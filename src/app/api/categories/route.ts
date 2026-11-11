import { db } from "@/db";
import { categories } from "@/db/schema";
import { ensureDefaultCategories, fetchCategories } from "@/lib/categories";
import { requireActiveOrganization } from "@/lib/request-auth";
import { NextRequest } from "next/server";
import { z } from "zod";

const categorySchema = z.object({
  name: z.string().trim().min(1).max(100),
});

export async function GET() {
  const authContext = await requireActiveOrganization();
  if (authContext instanceof Response) {
    return authContext;
  }

  try {
    await ensureDefaultCategories(authContext.orgId);
    const categoryList = await fetchCategories(authContext.orgId);
    return Response.json(categoryList, { status: 200 });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Failed to fetch categories" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const authContext = await requireActiveOrganization();
  if (authContext instanceof Response) {
    return authContext;
  }

  const body = await req.json().catch(() => null);
  const parsed = categorySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "name is required and must be 1-100 characters" }, { status: 400 });
  }

  try {
    const [category] = await db
      .insert(categories)
      .values({
        organizationId: authContext.orgId,
        name: parsed.data.name,
        isDefault: false,
      })
      .returning();

    return Response.json(category, { status: 201 });
  } catch (error: unknown) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
      return Response.json({ error: "A category with this name already exists" }, { status: 409 });
    }

    console.error(error);
    return Response.json({ error: "Failed to create category" }, { status: 500 });
  }
}
