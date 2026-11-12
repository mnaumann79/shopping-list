import { expect, test } from "@playwright/test";
import {
  inviteFromSettings,
  INVITE_TIMEOUT,
  listHouseholds,
  listMembers,
  newUserContext,
  PASSWORD,
  signUp,
  submitForm,
  uniqueEmail,
  waitForSettingsReady,
} from "./helpers";

// HSHD-02: Admin can invite by email
// HSHD-04: User can join via email invite
test.describe("Email invite flow", () => {
  test.setTimeout(120_000);

  test("admin can send email invite from household settings", async ({ page }) => {
    const email = uniqueEmail("invitee");

    await page.goto("/household/settings");
    await waitForSettingsReady(page);
    await expect(page.getByRole("button", { name: "Send invite" })).toBeVisible();
    await page.getByPlaceholder("name@example.com").fill(email);
    await submitForm(page, "Send invite", "/api/households/invite");

    // The app answers only after the invitation mail has been sent, so the
    // toast waits for the mail call rather than for the click.
    await expect(page.getByText(`Invitation sent to ${email}`)).toBeVisible({
      timeout: INVITE_TIMEOUT,
    });
  });

  test("invitation record is created in DB after invite sent", async ({ page }) => {
    const email = uniqueEmail("invitee");

    const invitation = await inviteFromSettings(page, email);
    const households = await listHouseholds(page);

    expect(invitation.email).toBe(email);
    expect(invitation.status).toBe("pending");
    expect(invitation.role).toBe("member");
    expect(invitation.organization_id).toBe(households[0].id);
  });

  test("logged-in user visiting /accept-invite?invitationId= auto-joins household", async ({
    page,
    browser,
  }) => {
    const email = uniqueEmail("invitee");
    const invitation = await inviteFromSettings(page, email);

    const { context, page: invitee } = await newUserContext(browser);
    try {
      // The invitation is addressed to this address, and better-auth only
      // lets the recipient accept it.
      await signUp(invitee, { name: "Invitee", email }, /\/onboarding/);

      await invitee.goto(`/accept-invite?invitationId=${invitation.id}`);

      await expect(invitee.getByText("Joined!")).toBeVisible();
      await invitee.waitForURL(/\/dashboard/, { timeout: 60_000 });

      const members = await listMembers(page);
      expect(members.map((member) => member.user.email)).toContain(email);
    } finally {
      await context.close();
    }
  });

  test("new user visiting /accept-invite?invitationId= is redirected to sign-up", async ({
    page,
    browser,
  }) => {
    const email = uniqueEmail("invitee");
    const invitation = await inviteFromSettings(page, email);

    const { context, page: fresh } = await newUserContext(browser);
    try {
      await fresh.goto(`/accept-invite?invitationId=${invitation.id}`);

      await fresh.waitForURL(/\/sign-up/, { timeout: 60_000 });
      expect(new URL(fresh.url()).searchParams.get("invitationId")).toBe(invitation.id);
      // The invited address is carried across so the new account is the one
      // the invitation is addressed to.
      await expect(fresh.getByLabel("Email", { exact: true })).toHaveValue(email);
    } finally {
      await context.close();
    }
  });

  test("new user completes signup and auto-joins invited household (context preserved)", async ({
    page,
    browser,
  }) => {
    const email = uniqueEmail("invitee");
    const invitation = await inviteFromSettings(page, email);

    const { context, page: fresh } = await newUserContext(browser);
    try {
      await fresh.goto(`/accept-invite?invitationId=${invitation.id}`);
      await fresh.waitForURL(/\/sign-up/, { timeout: 60_000 });

      await fresh.getByLabel("Name", { exact: true }).fill("Invitee");
      await expect(fresh.getByLabel("Email", { exact: true })).toHaveValue(email);
      await fresh.getByLabel("Password", { exact: true }).fill(PASSWORD);
      await submitForm(fresh, "Sign up", "/api/auth/sign-up/email");

      // The invitation id survives the round trip through sign-up, so the
      // new account lands in the household instead of the onboarding page.
      await fresh.waitForURL(/\/dashboard/, { timeout: 60_000 });

      const members = await listMembers(page);
      expect(members.map((member) => member.user.email)).toContain(email);
    } finally {
      await context.close();
    }
  });

  test("member appears in household member list after joining", async ({ page, browser }) => {
    const email = uniqueEmail("invitee");
    const invitation = await inviteFromSettings(page, email);

    const { context, page: invitee } = await newUserContext(browser);
    try {
      await signUp(invitee, { name: "Invitee", email }, /\/onboarding/);
      await invitee.goto(`/accept-invite?invitationId=${invitation.id}`);
      await expect(invitee.getByText("Joined!")).toBeVisible();
      await invitee.waitForURL(/\/dashboard/, { timeout: 60_000 });
    } finally {
      await context.close();
    }

    await page.goto("/household/settings");
    await waitForSettingsReady(page);

    // The card title is a div, so the card is found by its title slot rather
    // than by a heading role.
    const membersCard = page
      .locator('[data-slot="card"]')
      .filter({ has: page.locator('[data-slot="card-title"]', { hasText: "Members" }) });

    const member = membersCard.locator("li").filter({ hasText: email });
    await expect(member).toBeVisible();
    await expect(member.getByText("member", { exact: true })).toBeVisible();
  });
});
