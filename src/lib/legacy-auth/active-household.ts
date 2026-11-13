import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { householdMembers } from "@/db/schema/households";
import { withMembershipScope, type Tx } from "@/db/scope";

/**
 * The household the user lands in, and the cookie that names it.
 *
 * The membership comes from the new table: the cutover turned the legacy
 * member rows into `household_members` rows (§13.2b), so a migrated user
 * lands in their household rather than in an empty one.
 *
 * The cookie is the active household (§12.1a): httpOnly and SameSite=Lax, so
 * it is server-side only, and the role is never taken from it — a household
 * the caller is not a member of is refused by the policies.
 */
export async function setActiveHousehold(userId: string): Promise<void> {
  const householdId = await withMembershipScope({ userId }, async (tx: Tx) => {
    const [row] = await tx
      .select({ householdId: householdMembers.householdId })
      .from(householdMembers)
      .where(eq(householdMembers.userId, userId))
      .limit(1);

    return row?.householdId ?? null;
  });

  if (!householdId) {
    return;
  }

  const cookieStore = await cookies();
  cookieStore.set("sb-household", householdId, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}
