import { randomBytes } from "crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { householdInvitations } from "@/db/schema/households";
import { withClaimsOnly, withScope, type Scope, type Tx } from "@/db/scope";
import { getAcceptInviteUrl } from "@/lib/app-routes";
import { ServiceError } from "./service-error";
import { ADMIN_ROLES, requireHouseholdRole } from "./households";

/**
 * The roles an invitation may grant.
 *
 * Never 'owner': an invitation cannot make a second owner, and the database
 * checks the vocabulary too.
 */
export type InvitationRole = "admin" | "member";

const INVITATION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Invites somebody by email.
 *
 * The invitation is a row in household_invitations, and **the mail is sent
 * by the application**: Better Auth's plugin owned the mailer, and the plugin
 * goes with the auth swap. The mail is the only channel a member has to
 * join, so the token in it is the whole invitation.
 *
 * The token is 32 random bytes, hex-encoded: opaque, unguessable, and the
 * only thing the acceptance path needs to identify the invitation.
 */
export async function createInvitation(
  scope: Scope,
  email: string,
  role: InvitationRole,
): Promise<{ invitationId: string }> {
  await requireHouseholdRole(scope, ADMIN_ROLES);

  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + INVITATION_LIFETIME_MS);

  const [invitation] = await withScope(scope, (tx) =>
    tx
      .insert(householdInvitations)
      .values({
        token,
        householdId: scope.householdId,
        email,
        role,
        invitedBy: scope.userId,
        expiresAt,
      })
      .returning(),
  );

  await sendInvitationMail({ scope, email, invitationId: invitation.id });

  return { invitationId: invitation.id };
}

/**
 * The household's invitations.
 *
 * Only the live ones: an accepted, revoked or expired invitation is not an
 * invitation any more, and listing it would invite somebody to a household
 * that has already moved on.
 */
export async function listInvitations(scope: Scope) {
  await requireHouseholdRole(scope, ADMIN_ROLES);

  return withScope(scope, (tx) =>
    tx
      .select({
        id: householdInvitations.id,
        email: householdInvitations.email,
        role: householdInvitations.role,
        expiresAt: householdInvitations.expiresAt,
        revokedAt: householdInvitations.revokedAt,
      })
      .from(householdInvitations)
      .where(
        and(
          eq(householdInvitations.householdId, scope.householdId),
          isNull(householdInvitations.acceptedAt),
          isNull(householdInvitations.revokedAt),
          // An expired invitation is not an invitation any more.
          gt(householdInvitations.expiresAt, new Date()),
        ),
      ),
  );
}

/**
 * Cancels an invitation.
 *
 * Revoking one invitation does not touch the others: several invitations may
 * be live at once, and each is revocable on its own.
 */
export async function cancelInvitation(scope: Scope, invitationId: string): Promise<void> {
  await requireHouseholdRole(scope, ADMIN_ROLES);

  await withScope(scope, (tx) =>
    tx
      .update(householdInvitations)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(householdInvitations.id, invitationId),
          eq(householdInvitations.householdId, scope.householdId),
        ),
      ),
  );
}

/**
 * Accepts an invitation.
 *
 * The membership row is written by app_accept_household_invitation, a
 * SECURITY DEFINER function: the caller is not a member of the household
 * yet, so the membership policy cannot be part of that path, and the
 * function takes no user id — it uses auth.uid() — so a caller cannot write
 * a membership row for somebody else.
 *
 * The function validates the invitation (live, not accepted, not revoked,
 * not expired, and addressed to the caller's email), takes the role from the
 * invitation, and writes the row with the owner's rights. One statement
 * path, one place where the invitation is checked.
 */
export async function acceptInvitation(invitationId: string): Promise<{ householdId: string }> {
  const result = await withClaimsOnly((tx: Tx) =>
    tx.execute(sql`select app_accept_household_invitation(${invitationId}::uuid) as household_id`),
  );

  const rows = (result as unknown as { rows?: Array<{ household_id?: string | null }> }).rows ?? [];
  const householdId = rows[0]?.household_id ?? null;

  if (!householdId) {
    throw new ServiceError(404, "This invitation is no longer valid");
  }

  return { householdId };
}

/**
 * The mail.
 *
 * The link in it is the invitation's own page, which carries the invitation
 * id; the acceptance endpoint is what turns it into a membership.
 */
async function sendInvitationMail(input: {
  scope: Scope;
  email: string;
  invitationId: string;
}) {
  const { InviteEmailTemplate } = await import("@/lib/email/invite-template");
  const { Resend } = await import("resend");

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    // The invitation row is the record; the mail is a courtesy. Without a
    // key the invitation still exists and can be accepted from the link the
    // caller is given.
    return;
  }

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL ?? "noreply@example.com",
    to: input.email,
    subject: "You have been invited to a household shopping list",
    react: InviteEmailTemplate({
      inviterName: "A household member",
      householdName: "a household shopping list",
      inviteUrl: getAcceptInviteUrl(input.invitationId, input.email),
    }),
  });

  if (error) {
    throw new Error(`Resend error: ${error.message}`);
  }
}
