import { eq } from "drizzle-orm";
import { db } from "@/db";
import { user } from "@/db/schema/auth";
import { requireRequestSession } from "@/lib/request-auth";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL;

async function requireAdmin() {
  const session = await requireRequestSession();
  if (session instanceof Response) return session;
  if (!ADMIN_EMAIL || session.user.email !== ADMIN_EMAIL) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  return session;
}

export async function GET() {
  const auth = await requireAdmin();
  if (auth instanceof Response) return auth;

  const users = await db.select({
    id: user.id,
    name: user.name,
    email: user.email,
    createdAt: user.createdAt,
  }).from(user);

  return Response.json(users);
}

export async function DELETE(req: Request) {
  const auth = await requireAdmin();
  if (auth instanceof Response) return auth;

  const { userId } = await req.json() as { userId: string };
  if (!userId) {
    return Response.json({ error: "userId is required" }, { status: 400 });
  }

  if (userId === auth.user.id) {
    return Response.json({ error: "Cannot delete yourself" }, { status: 400 });
  }

  await db.delete(user).where(eq(user.id, userId));
  return Response.json({ success: true });
}
