import { expect, test } from "@playwright/test";
import {
  generateJoinLink,
  joinPath,
  joinToken,
  listHouseholds,
  listMembers,
  newUserContext,
  PASSWORD,
  queryRows,
  signUp,
  submitForm,
  uniqueEmail,
} from "./helpers";

// HSHD-03: Admin can generate shareable join link
// HSHD-04: User can join via join link
test.describe("Shareable join link flow", () => {
  test.setTimeout(120_000);

  test("admin can generate a join link from household settings", async ({ page }) => {
    await page.goto("/household/settings");

    await expect(page.getByRole("button", { name: "Generate join link" })).toBeVisible();
    await submitForm(page, "Generate join link", "/api/households/join-links");

    await expect(page.locator("input[readonly]")).toBeVisible();
  });

  test("generated link has /join?token= format", async ({ page }) => {
    await page.goto("/household/settings");
    await submitForm(page, "Generate join link", "/api/households/join-links");

    const link = await page.locator("input[readonly]").inputValue();

    expect(link).toMatch(/\/join\?token=[0-9a-f]{64}$/);
  });

  test("logged-in user visiting /join?token= auto-joins household", async ({ page, browser }) => {
    const link = await generateJoinLink(page);
    const email = uniqueEmail("joiner");

    const { context, page: joiner } = await newUserContext(browser);
    try {
      await signUp(joiner, { name: "Joiner", email }, /\/onboarding/);

      await joiner.goto(joinPath(link));

      await expect(joiner.getByText("Joined!")).toBeVisible();
      await joiner.waitForURL(/\/dashboard/, { timeout: 60_000 });

      const members = await listMembers(page);
      expect(members.map((member) => member.user.email)).toContain(email);
    } finally {
      await context.close();
    }
  });

  test("new user visiting /join?token= is redirected to /sign-up?joinToken=", async ({ page, browser }) => {
    const link = await generateJoinLink(page);

    const { context, page: fresh } = await newUserContext(browser);
    try {
      await fresh.goto(joinPath(link));

      await fresh.waitForURL(/\/sign-up\?joinToken=/, { timeout: 60_000 });
      expect(new URL(fresh.url()).searchParams.get("joinToken")).toBe(joinToken(link));
    } finally {
      await context.close();
    }
  });

  test("new user completes signup and auto-joins via join token", async ({ page, browser }) => {
    const link = await generateJoinLink(page);
    const email = uniqueEmail("joiner");

    const { context, page: fresh } = await newUserContext(browser);
    try {
      await fresh.goto(joinPath(link));
      await fresh.waitForURL(/\/sign-up\?joinToken=/, { timeout: 60_000 });

      await fresh.getByLabel("Name", { exact: true }).fill("Joiner");
      await fresh.getByLabel("Email", { exact: true }).fill(email);
      await fresh.getByLabel("Password", { exact: true }).fill(PASSWORD);
      await submitForm(fresh, "Sign up", "/api/auth/sign-up/email");

      // The sign-up page sends the new user back to the join link, which
      // now has a session and joins them.
      await fresh.waitForURL(/\/join\?token=/, { timeout: 60_000 });
      await expect(fresh.getByText("Joined!")).toBeVisible();
      await fresh.waitForURL(/\/dashboard/, { timeout: 60_000 });

      const members = await listMembers(page);
      expect(members.map((member) => member.user.email)).toContain(email);
    } finally {
      await context.close();
    }
  });

  test("same join link works for a second new user (multi-use)", async ({ page, browser }) => {
    const link = await generateJoinLink(page);
    const first = uniqueEmail("first");
    const second = uniqueEmail("second");

    const { context: firstContext, page: firstPage } = await newUserContext(browser);
    try {
      await signUp(firstPage, { name: "First Joiner", email: first }, /\/onboarding/);
      await firstPage.goto(joinPath(link));
      await expect(firstPage.getByText("Joined!")).toBeVisible();
      await firstPage.waitForURL(/\/dashboard/, { timeout: 60_000 });
    } finally {
      await firstContext.close();
    }

    const { context: secondContext, page: secondPage } = await newUserContext(browser);
    try {
      await signUp(secondPage, { name: "Second Joiner", email: second }, /\/onboarding/);
      await secondPage.goto(joinPath(link));
      await expect(secondPage.getByText("Joined!")).toBeVisible();
      await secondPage.waitForURL(/\/dashboard/, { timeout: 60_000 });
    } finally {
      await secondContext.close();
    }

    const members = await listMembers(page);
    const emails = members.map((member) => member.user.email);
    expect(emails).toContain(first);
    expect(emails).toContain(second);
  });

  test("expired join link shows error page", async ({ page }) => {
    const households = await listHouseholds(page);
    const members = await listMembers(page);
    const owner = members.find((member) => member.role === "owner") ?? members[0];
    const token = `expired${Date.now()}${Math.random().toString(36).slice(2, 10)}`;

    await queryRows(
      "insert into household_join_links (id, token, organization_id, created_by_id, expires_at, created_at) values (gen_random_uuid(), $1, $2, $3, now() - interval '1 day', now())",
      [token, households[0].id, owner.userId],
    );

    await page.goto(`/join?token=${token}`);

    await expect(page.getByText("Link expired")).toBeVisible();
    await expect(
      page.getByText("This join link has expired. Ask the household admin to generate a new one."),
    ).toBeVisible();
  });

  test("admin regenerating link invalidates previous link", async ({ page }) => {
    await page.goto("/household/settings");
    const linkInput = page.locator("input[readonly]");

    await submitForm(page, "Generate join link", "/api/households/join-links");
    await expect(linkInput).toHaveValue(/\/join\?token=[0-9a-f]{64}$/);
    const first = await linkInput.inputValue();

    await submitForm(page, "Generate join link", "/api/households/join-links");
    await expect(async () => {
      expect(await linkInput.inputValue()).not.toBe(first);
    }).toPass({ timeout: 30_000 });
    const second = await linkInput.inputValue();

    expect(second).not.toBe(first);

    // The old token is gone from the database...
    const rows = await queryRows("select token from household_join_links where token = $1", [
      joinToken(first),
    ]);
    expect(rows).toHaveLength(0);

    // ...and it no longer works.
    await page.goto(joinPath(first));
    await expect(page.getByText("Unable to join")).toBeVisible();
    await expect(page.getByText("Invalid join link")).toBeVisible();
  });
});
