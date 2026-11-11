import { eq } from "drizzle-orm";
import { db } from "@/db";
import { invitation } from "@/db/schema/auth";

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return Response.json({ email: null });

  const row = await db
    .select({ email: invitation.email })
    .from(invitation)
    .where(eq(invitation.id, id))
    .limit(1)
    .then((rows) => rows[0]);

  return Response.json({ email: row?.email ?? null });
}
