import { test } from "@playwright/test";
import { PASSWORD, expect, registerUser, submitForm, uniqueEmail } from "./helpers";

// AUTH-02: User can log in with email and password
//
// The specs run without the shared storage state: it is signed in, and the
// the app sends a signed-in visitor away from /sign-in.
test.describe("Login", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("valid credentials redirect to /dashboard", async ({ page, request }) => {
    const email = uniqueEmail("login");
    await registerUser(request, { email, householdName: `Login Household ${email}` });

    await page.goto("/sign-in");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(PASSWORD);

    await submitForm(page, "Sign in", "/api/auth/sign-in/email");

    await expect(page).toHaveURL(/\/dashboard$/);
    // The dashboard really rendered.
    await expect(page.getByLabel("Item name")).toBeVisible();
  });

  test("wrong password shows error", async ({ page, request }) => {
    const email = uniqueEmail("login");
    await registerUser(request, { email, householdName: `Login Household ${email}` });

    await page.goto("/sign-in");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("TheWrongPassword1!");

    await submitForm(page, "Sign in", "/api/auth/sign-in/email");

    await expect(page.getByText("Invalid email or password")).toBeVisible();
    await expect(page).toHaveURL(/\/sign-in$/);
  });

  test("non-existent email shows error", async ({ page }) => {
    // An address that was never registered.
    const email = uniqueEmail("ghost");

    await page.goto("/sign-in");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(PASSWORD);

    await submitForm(page, "Sign in", "/api/auth/sign-in/email");

    await expect(page.getByText("Invalid email or password")).toBeVisible();
    await expect(page).toHaveURL(/\/sign-in$/);
  });

  test("successful login sets session cookie", async ({ page, request }) => {
    const email = uniqueEmail("login");
    await registerUser(request, { email, householdName: `Login Household ${email}` });

    await page.goto("/sign-in");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(PASSWORD);

    await submitForm(page, "Sign in", "/api/auth/sign-in/email");

    await expect(page).toHaveURL(/\/dashboard$/);
    const cookies = await page.context().cookies();
    expect(cookies.some((cookie) => cookie.name === "better-auth.session_token")).toBe(true);
  });

  // The app sends a signed-out visitor to /sign-in, but it does not put the
  // page they asked for in `returnTo` - the redirect carries no query string.
  // The sign-in page does honour a `returnTo` when one is present in the URL
  // (see the next spec), but nothing in the app ever creates one. The gap is
  // recorded in the pull request; this spec asserts today's behaviour.
  test("signed-out visitor is sent to /sign-in and logs in to the default page", async ({ page, request }) => {
    const email = uniqueEmail("login");
    await registerUser(request, { email, householdName: `Login Household ${email}` });

    await page.goto("/history");

    // The pathname is /sign-in whether or not the redirect carries a query
    // string.
    await expect(page).toHaveURL((url) => url.pathname === "/sign-in");
    // Today's behaviour: no returnTo, so the visitor loses the page they
    // wanted.
    expect(new URL(page.url()).searchParams.get("returnTo")).toBeNull();

    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(PASSWORD);

    await submitForm(page, "Sign in", "/api/auth/sign-in/email");

    // Without a returnTo there is nothing to restore, so the sign-in page
    // sends the user to its default page. A user whose session has no active
    // household is sent on to /onboarding instead - either way they end up
    // on a signed-in page, which is what this spec asserts.
    await expect(page).not.toHaveURL(/\/sign-in/);
    const cookies = await page.context().cookies();
    expect(cookies.some((cookie) => cookie.name === "better-auth.session_token")).toBe(true);
  });
});
