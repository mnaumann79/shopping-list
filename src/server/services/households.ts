import { randomBytes } from "crypto";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getJoinUrl } from "@/lib/app-routes";
import { ServiceError } from "./service-error";

type InviteMemberInput = {
  email: string;
  orgId: string;
  requestHeaders: Headers;
};

type CreateJoinLinkInput = {
  orgId: string;
  userId: string;
};

type JoinHouseholdInput = {
  token: string;
  userId: string;
  requestHeaders: Headers;
};

type RemoveMemberInput = {
  memberId: string;
  orgId: string;
  requestHeaders: Headers;
};

function mapAuthorizationError(error: unknown, fallbackMessage: string) {
  const message = error instanceof Error ? error.message : fallbackMessage;
  const normalized = message.toLowerCase();

  if (
    normalized.includes("not authorized") ||
    normalized.includes("permission") ||
    normalized.includes("you don't have permission")
  ) {
    throw new ServiceError(403, fallbackMessage);
  }

  throw new ServiceError(500, fallbackMessage);
}

async function getHouseholdLinkDb() {
  const [{ db }, { householdJoinLinks }] = await Promise.all([
    import("@/db"),
    import("@/db/schema/households"),
  ]);

  return { db, householdJoinLinks };
}

export async function inviteMember(input: InviteMemberInput) {
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

async function resendInvitation(input: InviteMemberInput) {
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

export async function createJoinLink(input: CreateJoinLinkInput) {
  const { db, householdJoinLinks } = await getHouseholdLinkDb();
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await db
    .delete(householdJoinLinks)
    .where(eq(householdJoinLinks.organizationId, input.orgId));

  await db.insert(householdJoinLinks).values({
    token,
    organizationId: input.orgId,
    createdById: input.userId,
    expiresAt,
  });

  return { url: getJoinUrl(token) };
}

export async function joinHousehold(input: JoinHouseholdInput) {
  const { db, householdJoinLinks } = await getHouseholdLinkDb();
  const [link] = await db
    .select()
    .from(householdJoinLinks)
    .where(eq(householdJoinLinks.token, input.token))
    .limit(1);

  if (!link) {
    throw new ServiceError(404, "Invalid join link");
  }

  if (link.expiresAt < new Date()) {
    throw new ServiceError(410, "This join link has expired");
  }

  await auth.api.addMember({
    body: {
      userId: input.userId,
      organizationId: link.organizationId,
      role: "member",
    },
    headers: input.requestHeaders,
  });

  return { organizationId: link.organizationId };
}

export async function removeHouseholdMember(input: RemoveMemberInput) {
  try {
    await auth.api.removeMember({
      body: {
        memberIdOrEmail: input.memberId,
        organizationId: input.orgId,
      },
      headers: input.requestHeaders,
    });
  } catch (error) {
    mapAuthorizationError(error, "Only household admins can remove members");
  }
}
