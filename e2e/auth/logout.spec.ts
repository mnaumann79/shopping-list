import { test } from "@playwright/test";
import { expect, uniqueEmail } from "../support/helpers";
import { openAccountMenu, startOwnSession } from "./helpers";

// AUTH-04: User can log out from any page
//
// These tests cover the AppHeader logout flow that a JSDOM test could not
// reach: JSDOM + Base UI PointerEvents + React.lazy() are incompatible
// (vi.mock can't intercept React.lazy calls). Playwright handles all three
// correctly, so the actual click-through is verifiable here.
test.describe("Logout", () => {
  // These specs sign out, and signing out revokes the session on the server.
  // The shared storage state holds one session for every browser project, so
  // a logout spec that used it would take that session away from the
  // persistence specs. Each logout spec gets a session of its own.
  test.use({ storageState: { cookies: [], origins: [] } });

  test.beforeEach(async ({ page, request }) => {
    const email = uniqueEmail("logout");
    await startOwnSession(page, request, { email, householdName: `Logout Household ${email}` });

    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test("logout from /dashboard redirects to /sign-in", async ({ page }) => {
    // Click the avatar/account menu trigger (aria-label="Account menu")
    await openAccountMenu(page);

    await page.getByRole("menuitem", { name: /log out/i }).click();

    await expect(page).toHaveURL(/\/sign-in$/);
  });

  test("logout from another page redirects to /sign-in", async ({ page }) => {
    // The account menu is on every page, so the logout works from any of
    // them - not just from /dashboard.
    await page.goto("/history");
    await expect(page).toHaveURL(/\/history$/);

    await openAccountMenu(page);
    await page.getByRole("menuitem", { name: /log out/i }).click();

    await expect(page).toHaveURL(/\/sign-in$/);
  });

  test("after logout, navigating to /dashboard redirects to /sign-in", async ({ page }) => {
    await openAccountMenu(page);
    await page.getByRole("menuitem", { name: /log out/i }).click();
    await expect(page).toHaveURL(/\/sign-in$/);

    // Attempt to access the protected dashboard — should bounce back
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/sign-in$/);
  });

  test("logout clears session cookies", async ({ page, context }) => {
    // Confirm session cookie(s) exist before logout
    const cookiesBefore = await context.cookies();
    const sessionBefore = cookiesBefore.filter((c) => /session|token|auth/i.test(c.name));
    expect(sessionBefore.length).toBeGreaterThan(0);

    await openAccountMenu(page);
    await page.getByRole("menuitem", { name: /log out/i }).click();
    await expect(page).toHaveURL(/\/sign-in$/);

    // After logout the session cookies should be cleared (or invalidated)
    const cookiesAfter = await context.cookies();
    const sessionAfter = cookiesAfter.filter((c) => /session|token|auth/i.test(c.name));
    expect(sessionAfter.length).toBe(0);
  });
});