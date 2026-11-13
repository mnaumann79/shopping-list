import { randomBytes, randomUUID } from "crypto";
import { and, eq } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { householdJoinLinks, householdMembers, households } from "@/db/schema/households";
import { withClaimsOnly, withMembershipScope, withScope, type Scope, type Tx } from "@/db/scope";
import { getJoinUrl } from "@/lib/app-routes";
import { ServiceError } from "./service-error";

/**
 * The roles a household has. The vocabulary is §12.5's, and the database
 * checks it too: household_members carries a CHECK constraint that admits
 * exactly these three.
 */
export type HouseholdRole = "owner" | "admin" | "member";

/** The roles that may administer a household (FR-13). */
export const ADMIN_ROLES: readonly HouseholdRole[] = ["owner", "admin"];

/** The one form an id is written in: the hyphenated uuid. */
const uuidSchema = z.uuid();

/**
 * One spelling of an id.
 *
 * PostgreSQL accepts an id in several forms — upper and lower case, without
 * hyphens, in braces — and two spellings of one id must not be two things.
 * The id is parsed instead of trimmed, so the comparison is on the one
 * spelling, and a value that is not an id at all is a 400 rather than a
 * failed cast.
 */
function canonicalUuid(value: string): string {
  const parsed = uuidSchema.safeParse(value.trim());
  if (!parsed.success) {
    throw new ServiceError(400, "Invalid user id");
  }
  return parsed.data.toLowerCase();
}

/**
 * The caller's role in the household.
 *
 * The answer comes from `app_household_role`, the SECURITY DEFINER function
 * the policies themselves call: it reads household_members with the owner's
 * rights, so it answers the question without the policies getting in the
 * way, and without the application needing to see the other members' rows.
 *
 * A caller who is not a member has no role, and that is a 403 rather than a
 * 404: the route knows which household it was asked about, and hiding that
 * would tell the caller less than the truth does.
 */
export async function requireHouseholdRole(
  scope: Scope,
  roles: readonly HouseholdRole[],
): Promise<HouseholdRole> {
  const result = await withScope(scope, (tx) =>
    tx.execute(sql`select app_household_role(${scope.householdId}::uuid, ${scope.userId}::uuid) as role`),
  );

  const rows = (result as unknown as { rows?: Array<{ role: string | null }> }).rows ?? [];
  const role = rows[0]?.role ?? null;

  if (!role || !roles.includes(role as HouseholdRole)) {
    throw new ServiceError(403, "You do not have permission to do that");
  }

  return role as HouseholdRole;
}

/**
 * Creates a household and makes the caller its owner.
 *
 * The id is generated here, not by the database, because the transaction
 * that writes the household has to be scoped to it: the membership policy
 * only lets the creator write their own first membership row, and only
 * inside a transaction whose scope is that household. The bootstrap function
 * (app_household_bootstrap) is what allows that first row, and it answers
 * only for the household's creator.
 *
 * The household and the membership row are one unit of work: the membership
 * policy's bootstrap branch requires the household to have no members yet,
 * so the two statements cannot be separated by anything.
 */
export async function createHousehold(
  scope: Scope,
  name: string,
): Promise<{ householdId: string; name: string; role: HouseholdRole }> {
  const householdId = randomUUID();

  return withScope({ userId: scope.userId, householdId }, async (tx) => {
    const [household] = await tx
      .insert(households)
      .values({ id: householdId, name, createdBy: scope.userId })
      .returning();

    await tx.insert(householdMembers).values({
      householdId,
      userId: scope.userId,
      role: "owner",
    });

    return { householdId: household.id, name: household.name, role: "owner" as const };
  });
}

/**
 * The join link is a row, not a flag.
 *
 * It used to delete the household's other links before inserting its own,
 * which is what let a plain member invalidate the admin's link (S-2) and
 * which meant only one link could exist at a time. Several links may now
 * exist at once, and each is revocable on its own.
 *
 * Only an admin may mint one (S-1): the role check is on the server, not
 * only in the UI.
 */
export async function createJoinLink(scope: Scope): Promise<{ url: string }> {
  await requireHouseholdRole(scope, ADMIN_ROLES);

  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await withScope(scope, (tx) =>
    tx.insert(householdJoinLinks).values({
      token,
      householdId: scope.householdId,
      createdById: scope.userId,
      expiresAt,
    }),
  );

  return { url: getJoinUrl(token) };
}

/**
 * The link's household, for the caller who follows it.
 *
 * The link is looked up by its token, which is opaque and random.
 *
 * The lookup is not scoped to a household — the caller has none yet — and
 * that is exactly what the policies do not allow: household_join_links is
 * readable only by the household's members. A path that resolves a link to
 * its household without the caller being a member yet is a SECURITY DEFINER
 * function, the same shape as app_household_role, and it has to be added to
 * db/migrations before the join flow can work.
 */
export async function findJoinLink(token: string) {
  const { db } = await import("@/db");
  const [link] = await db
    .select()
    .from(householdJoinLinks)
    .where(eq(householdJoinLinks.token, token))
    .limit(1);

  return link ?? null;
}

/**
 * Removes a member from the household.
 *
 * Only an owner or an admin may do it, and the check is on the server. The
 * caller cannot remove themselves through it: an owner who leaves leaves the
 * household without an owner.
 *
 * And the privileged rows are the owner's to give and to take away: an admin
 * may remove a plain member, but the owner's row is only the owner's to
 * remove — §12.5 gives the role table "remove a member: owner or admin" and
 * "change a member's role: owner", and nothing can put an owner back
 * (an invitation never grants the owner role, and only the creator's
 * bootstrap makes one), so an admin who could remove the owner would leave a
 * household nobody could repair.
 */
export async function removeMember(scope: Scope, userId: string): Promise<void> {
  const callerRole = await requireHouseholdRole(scope, ADMIN_ROLES);

  // One spelling of the id, on both sides: an uppercase form of the
  // caller's own id is the same id, and a string comparison would let it
  // through.
  const targetUserId = canonicalUuid(userId);

  if (targetUserId === canonicalUuid(scope.userId)) {
    throw new ServiceError(400, "You cannot remove yourself from the household");
  }

  // The target's role and the removal are one transaction: the answer has to
  // be the role the row has when it is deleted.
  await withScope(scope, async (tx) => {
    const [target] = await tx
      .select({ role: householdMembers.role })
      .from(householdMembers)
      .where(
        and(
          eq(householdMembers.householdId, scope.householdId),
          eq(householdMembers.userId, targetUserId),
        ),
      )
      .limit(1);

    if (!target) {
      throw new ServiceError(404, "Member not found");
    }

    if (target.role !== "member" && callerRole !== "owner") {
      throw new ServiceError(403, "You do not have permission to do that");
    }

    await tx
      .delete(householdMembers)
      .where(
        and(
          eq(householdMembers.householdId, scope.householdId),
          eq(householdMembers.userId, targetUserId),
        ),
      );
  });
}


/**
 * Joins the household the link names.
 *
 * The membership row is written by app_join_household_by_link, a SECURITY
 * DEFINER function. Three things make that the only way:
 *
 * - The caller is not a member of the household yet, so the membership
 *   policy cannot be part of the path: it lets an owner or an admin add
 *   somebody, and the creator bootstrap their own first row, and a caller
 *   who follows a link is neither.
 * - The link itself is not readable by a non-member, so the token cannot be
 *   resolved outside the function either. On `main` the join is broken
 *   exactly that way: the lookup returns nothing and the join answers
 *   "Invalid join link".
 * - The function takes no user id — it uses auth.uid() — so a caller cannot
 *   write a membership row for somebody else.
 *
 * The role a link grants is 'member'. Never owner, never admin.
 */
export async function joinHousehold(input: { token: string }): Promise<{ householdId: string }> {
  const result = await withClaimsOnly((tx: Tx) =>
    tx.execute(sql`select app_join_household_by_link(${input.token}) as household_id`),
  );

  const rows = (result as unknown as { rows?: Array<{ household_id?: string | null }> }).rows ?? [];
  const householdId = rows[0]?.household_id ?? null;

  if (!householdId) {
    throw new ServiceError(404, "Invalid join link");
  }

  return { householdId };
}

/**
 * The households the caller belongs to.
 *
 * The one call in the application that is not scoped to a household: it is
 * scoped to the *user*, and the policies' membership branch is the whole of
 * the isolation there. The transaction is read-only, so it cannot become a
 * write path.
 *
 * It exists for the household list and the members list, and for nothing
 * else. A fourth caller would be a design question, not a convenience.
 */
export async function listHouseholds(
  userId: string,
): Promise<Array<{ id: string; name: string; role: HouseholdRole }>> {
  return withMembershipScope({ userId }, async (tx: Tx) => {
    const rows = await tx
      .select({ id: households.id, name: households.name, role: householdMembers.role })
      .from(householdMembers)
      .innerJoin(households, eq(households.id, householdMembers.householdId))
      .where(eq(householdMembers.userId, userId));

    return rows.map((row: { id: string; name: string; role: string }) => ({
      id: row.id,
      name: row.name,
      role: row.role as HouseholdRole,
    }));
  });
}

/**
 * The household's members.
 *
 * The names and the emails come from app_user_display, which exposes two
 * fields and nothing else: the application's role must not be able to reach
 * encrypted_password, and a grant on auth.users would.
 */
export async function listMembers(
  scope: Scope,
): Promise<Array<{ id: string; name: string | null; email: string | null; role: HouseholdRole }>> {
  return withMembershipScope({ userId: scope.userId }, async (tx: Tx) => {
    const result = await tx.execute(sql`
      select m.user_id as id, m.role, d.name, d.email
        from household_members m
        cross join lateral app_user_display(m.user_id) as d
       where m.household_id = ${scope.householdId}::uuid`);

    const rows = (result as unknown as {
      rows?: Array<{ id: string; role: string; name: string | null; email: string | null }>;
    }).rows ?? [];

    return rows.map((row: { id: string; role: string; name: string | null; email: string | null }) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      role: row.role as HouseholdRole,
    }));
  });
}
