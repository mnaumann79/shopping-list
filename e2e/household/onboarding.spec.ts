import { expect, test } from "@playwright/test";
import {
  listHouseholds,
  newUserContext,
  signUp,
  submitForm,
  uniqueEmail,
} from "./helpers";

// HSHD-01: User can create a household during onboarding
test.describe("Household onboarding", () => {
  // The dev server compiles routes on demand, and every spec here signs a
  // user up and waits for a full round trip through the app.
  test.setTimeout(120_000);

  test("new user after signup is redirected to /onboarding, not /dashboard", async ({ browser }) => {
    const { context, page } = await newUserContext(browser);
    try {
      await signUp(page, { name: "New User", email: uniqueEmail("newbie") }, /\/onboarding/);

      await expect(page).toHaveURL(/\/onboarding/);
      await expect(page).not.toHaveURL(/\/dashboard/);
      await expect(page.getByLabel("Household name")).toBeVisible();
    } finally {
      await context.close();
    }
  });

  test("onboarding cannot be skipped — /dashboard redirects back to /onboarding if no household", async ({
    browser,
  }) => {
    const { context, page } = await newUserContext(browser);
    try {
      await signUp(page, { name: "Skipper", email: uniqueEmail("skipper") }, /\/onboarding/);

      await page.goto("/dashboard");

      await expect(page).toHaveURL(/\/onboarding/);
      await expect(page.getByLabel("Household name")).toBeVisible();
    } finally {
      await context.close();
    }
  });

  test("submitting household name creates household and redirects to /dashboard", async ({ browser }) => {
    const { context, page } = await newUserContext(browser);
    try {
      await signUp(page, { name: "Creator", email: uniqueEmail("creator") }, /\/onboarding/);

      const householdName = `Onboarding Household ${Date.now()}`;
      await page.getByLabel("Household name").fill(householdName);
      await submitForm(page, "Create household", "/api/auth/organization/create");

      await expect(page).toHaveURL(/\/dashboard/);
      const households = await listHouseholds(page);
      expect(households.map((household) => household.name)).toContain(householdName);
    } finally {
      await context.close();
    }
  });

  test("household switcher shows created household name in header", async ({ browser }) => {
    // KNOWN DEFECT (reported, not worked around): src/components/household-switcher.tsx
    // has never been rendered by any route, so the header shows "Shopping List"
    // and the account avatar - never the household name. The assertion below is
    // the requirement as written; test.fail keeps the spec in the suite as a
    // tracked failure instead of deleting it or weakening it. Fixing it means
    // mounting <HouseholdSwitcher /> in a layout, which is outside the
    // e2e/household/** file scope of this task.
    test.fail(true, "HouseholdSwitcher is dead code - the header never renders it");

    const { context, page } = await newUserContext(browser);
    try {
      await signUp(page, { name: "Switcher", email: uniqueEmail("switcher") }, /\/onboarding/);

      const householdName = `Switcher Household ${Date.now()}`;
      await page.getByLabel("Household name").fill(householdName);
      await submitForm(page, "Create household", "/api/auth/organization/create");
      await expect(page).toHaveURL(/\/dashboard/);

      await expect(page.getByRole("banner")).toContainText(householdName);
    } finally {
      await context.close();
    }
  });
});
