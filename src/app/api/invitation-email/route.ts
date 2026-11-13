import { eq } from "drizzle-orm";
import { db } from "@/db";
import { invitation } from "@/db/schema/auth";
import { requireRequestSession } from "@/lib/request-auth";

/**
 * The email an invitation was sent to.
 *
 * The endpoint used to answer without a session, so anybody who guessed an
 * invitation id could read the address it was sent to (S-4). It now needs a
 * session: the address is the household's business, not the internet's.
 */
export async function GET(req: Request) {
  const session = await requireRequestSession();
  if (session instanceof Response) {
    return session;
  }

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
