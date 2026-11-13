import { randomBytes, randomUUID } from "crypto";
import { auth } from "@/lib/auth";
import { and, eq } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { householdJoinLinks, householdMembers, households } from "@/db/schema/households";
import { withScope, type Scope } from "@/db/scope";
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
 */
export async function removeMember(scope: Scope, userId: string): Promise<void> {
  await requireHouseholdRole(scope, ADMIN_ROLES);

  if (userId === scope.userId) {
    throw new ServiceError(400, "You cannot remove yourself from the household");
  }

  await withScope(scope, (tx) =>
    tx
      .delete(householdMembers)
      .where(and(eq(householdMembers.householdId, scope.householdId), eq(householdMembers.userId, userId))),
  );
}

/**
 * An authorization failure is a 403, whatever the refusal says.
 *
 * Better Auth's own wording is "You are not allowed to invite users to this
 * organization", which the old mapping did not match, so a plain member
 * inviting somebody was answered with a 500 (S-3). The wording is not the
 * contract; the refusal is.
 */
function mapAuthorizationError(error: unknown, fallbackMessage: string) {
  const message = error instanceof Error ? error.message : fallbackMessage;
  const normalized = message.toLowerCase();

  if (
    normalized.includes("not authorized") ||
    normalized.includes("not allowed") ||
    normalized.includes("permission") ||
    normalized.includes("you don't have permission")
  ) {
    throw new ServiceError(403, fallbackMessage);
  }

  throw new ServiceError(500, fallbackMessage);
}

/**
 * The invitation, as Better Auth stores it.
 *
 * This is the path the new `household_invitations` table replaces, and it
 * stays until the membership rows move: the invitation belongs to Better
 * Auth's organization, and the organization is what the table's rows would
 * be keyed by. The role check is Better Auth's here — which is admin-only,
 * but whose refusal was reported as a 500 (S-3).
 */
export async function inviteMember(input: {
  email: string;
  orgId: string;
  requestHeaders: Headers;
}) {
  try {
    return await auth.api.createInvitation({
      body: {
        email: input.email,
        organizationId: input.orgId,
        role: "member",
      },
      headers: input.requestHeaders,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const normalized = message.toLowerCase();

    if (
      normalized.includes("not authorized") ||
      normalized.includes("not allowed") ||
      normalized.includes("permission") ||
      normalized.includes("you don't have permission")
    ) {
      throw new ServiceError(403, "Only household admins can send invitations");
    }

    if (normalized.includes("already invited")) {
      return resendInvitation(input);
    }

    throw new ServiceError(500, message || "Failed to send invitation");
  }
}

async function resendInvitation(input: {
  email: string;
  orgId: string;
  requestHeaders: Headers;
}) {
  const invitations = await auth.api.listInvitations({
    query: { organizationId: input.orgId },
    headers: input.requestHeaders,
  });

  const existing = (invitations as Array<{ id: string; email: string; status: string }>)
    .find((inv) => inv.email === input.email && inv.status === "pending");

  if (existing) {
    await auth.api.cancelInvitation({
      body: { invitationId: existing.id },
      headers: input.requestHeaders,
    });
  }

  return auth.api.createInvitation({
    body: { email: input.email, organizationId: input.orgId, role: "member" },
    headers: input.requestHeaders,
  });
}

/**
 * Joins the household the link names.
 *
 * This is the path the new tables replace. Two things it needs are not
 * there yet: the link lookup, because household_join_links is readable only
 * by the household's members and the caller is not one yet; and the
 * membership row, because the membership policy lets an owner or an admin
 * add somebody, or the creator bootstrap their own first row — and a caller
 * who follows a link is neither. Both want a SECURITY DEFINER function of
 * the shape of app_household_role, in db/migrations.
 */
export async function joinHousehold(input: {
  token: string;
  userId: string;
  requestHeaders: Headers;
}) {
  const link = await findJoinLink(input.token);

  if (!link) {
    throw new ServiceError(404, "Invalid join link");
  }

  if (link.expiresAt < new Date()) {
    throw new ServiceError(410, "This join link has expired");
  }

  try {
    await auth.api.addMember({
      body: {
        userId: input.userId,
        organizationId: link.householdId,
        role: "member",
      },
      headers: input.requestHeaders,
    });
  } catch (error) {
    mapAuthorizationError(error, "You cannot join this household");
  }

  return { householdId: link.householdId };
}
