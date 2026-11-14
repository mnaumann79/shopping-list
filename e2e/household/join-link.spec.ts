import { expect, test } from "@playwright/test";
import {
  closePool,
  generateJoinLink,
  joinPath,
  joinToken,
  listMembers,
  newUserContext,
  PASSWORD,
  queryRows,
  scopeFor,
  signUp,
  submitForm,
  uniqueEmail,
  waitForSettingsReady,
} from "./helpers";

// This spec reads the join-link table, so it opens the Postgres pool. The
// teardown closes it again, so the worker does not keep the socket open.
test.afterAll(closePool);

// HSHD-03: Admin can generate shareable join link
// HSHD-04: User can join via join link
test.describe("Shareable join link flow", () => {
  test.setTimeout(120_000);

  test("admin can generate a join link from household settings", async ({ page }) => {
    await page.goto("/household/settings");
    await waitForSettingsReady(page);

    await expect(page.getByRole("button", { name: "Generate join link" })).toBeVisible();
    await submitForm(page, "Generate join link", "/api/households/join-links");

    await expect(page.locator("input[readonly]")).toBeVisible();
  });

  test("generated link has /join?token= format", async ({ page }) => {
    await page.goto("/household/settings");
    await waitForSettingsReady(page);
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
      expect(members.map((member) => member.email)).toContain(email);
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
      expect(members.map((member) => member.email)).toContain(email);
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
    const emails = members.map((member) => member.email);
    expect(emails).toContain(first);
    expect(emails).toContain(second);
  });

  test("expired join link shows error page", async ({ page }) => {
    const scope = await scopeFor(page);
    const token = `expired${Date.now()}${Math.random().toString(36).slice(2, 10)}`;

    // The application has no way to make an expired link, so this one is
    // written directly — in the scope the application uses, so the write is
    // a write the application's own role may make.
    await queryRows(
      "insert into household_join_links (id, token, household_id, created_by_id, expires_at, created_at) values (gen_random_uuid(), $1, $2, $3, now() - interval '1 day', now())",
      [token, scope.householdId, scope.userId],
      scope,
    );

    await page.goto(`/join?token=${token}`);

    await expect(page.getByText("Link expired")).toBeVisible();
    await expect(
      page.getByText("This join link has expired. Ask the household admin to generate a new one."),
    ).toBeVisible();
  });

  test("generating a link leaves the previous one in place", async ({ page }) => {
    await page.goto("/household/settings");
    await waitForSettingsReady(page);
    const linkInput = page.locator("input[readonly]");
    const scope = await scopeFor(page);

    await submitForm(page, "Generate join link", "/api/households/join-links");
    await expect(linkInput).toHaveValue(/\/join\?token=[0-9a-f]{64}$/);
    const first = await linkInput.inputValue();

    // The token is in the database before the second link is minted. Without
    // this, what follows would also be true of a token that was never there.
    const before = await queryRows(
      "select token from household_join_links where token = $1",
      [joinToken(first)],
      scope,
    );
    expect(before).toHaveLength(1);

    await submitForm(page, "Generate join link", "/api/households/join-links");
    await expect(async () => {
      expect(await linkInput.inputValue()).not.toBe(first);
    }).toPass({ timeout: 30_000 });
    const second = await linkInput.inputValue();

    expect(second).not.toBe(first);

    // The first link is still there. Several links may exist at once, and
    // each is revocable on its own — the link is a row, not a flag. The read
    // is scoped to the caller's household, so "one row" means the row is
    // there and not that the read was blind.
    const rows = await queryRows(
      "select token from household_join_links where token = $1",
      [joinToken(first)],
      scope,
    );
    expect(rows).toHaveLength(1);
  });
});
