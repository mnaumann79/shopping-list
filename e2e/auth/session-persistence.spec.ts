import { test, expect } from "@playwright/test";

// AUTH-03: Session persists across browser refresh
//
// The first two specs run with the shared storage state, so they start out
// signed in as the user the setup created.
test.describe("Session persistence", () => {
  test("authenticated user refreshes page and stays on /dashboard", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/dashboard$/);

    await page.reload();

    // The session survived the refresh, so the middleware did not send the
    // user back to /sign-in.
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByLabel("Item name")).toBeVisible();
  });

  test("authenticated user opens new tab to /dashboard and stays authenticated", async ({ context }) => {
    const newTab = await context.newPage();

    await newTab.goto("/dashboard");

    // The new tab shares the context's cookies, so it is signed in too.
    await expect(newTab).toHaveURL(/\/dashboard$/);
    await expect(newTab.getByLabel("Item name")).toBeVisible();

    await newTab.close();
  });
});

// The shared storage state is signed in, so this spec needs a context
// without it.
test.describe("Session persistence of an unauthenticated visitor", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("unauthenticated user visiting /dashboard is redirected to /sign-in with returnTo", async ({ page }) => {
    await page.goto("/dashboard");

    await expect(page).toHaveURL(/\/sign-in$/);
    expect(new URL(page.url()).searchParams.get("returnTo")).toBe("/dashboard");
  });
});
