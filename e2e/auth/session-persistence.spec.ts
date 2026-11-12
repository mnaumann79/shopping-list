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

    // The session survived the refresh, so the app did not send the
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

  // The app sends a signed-out visitor to /sign-in, but it does not put the
  // page they asked for in `returnTo` - the redirect carries no query string.
  // The sign-in page does honour a `returnTo` when one is present in the URL
  // (see the login spec), but nothing in the app ever creates one. The gap is
  // recorded in the pull request; this spec asserts today's behaviour.
  test("unauthenticated user visiting /dashboard is redirected to /sign-in", async ({ page }) => {
    await page.goto("/dashboard");

    // The pathname is /sign-in whether or not the redirect carries a query
    // string.
    await expect(page).toHaveURL((url) => url.pathname === "/sign-in");
    // Today's behaviour: no returnTo, so the visitor loses the page they
    // asked for.
    expect(new URL(page.url()).searchParams.get("returnTo")).toBeNull();
  });
});
