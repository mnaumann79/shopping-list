import { test } from "@playwright/test";
import { expect, fillField, PASSWORD, submitForm, uniqueEmail } from "../support/helpers";
import { registerUser, SESSION_COOKIE, SIGN_IN_ENDPOINT } from "./helpers";

// AUTH-02: User can log in with email and password
//
// The specs run without the shared storage state: it is signed in, and the
// the app sends a signed-in visitor away from /sign-in.
test.describe("Login", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("valid credentials redirect to /dashboard", async ({ page, browser }) => {
    const email = uniqueEmail("login");
    await registerUser(browser, { email, householdName: `Login Household ${email}` });

    await page.goto("/sign-in");
    await fillField(page, "Email", email);
    await fillField(page, "Password", PASSWORD);

    await submitForm(page, "Sign in", SIGN_IN_ENDPOINT);

    await expect(page).toHaveURL(/\/dashboard$/);
    // The dashboard really rendered.
    await expect(page.getByLabel("Item name")).toBeVisible();
  });

  test("wrong password shows error", async ({ page, browser }) => {
    const email = uniqueEmail("login");
    await registerUser(browser, { email, householdName: `Login Household ${email}` });

    await page.goto("/sign-in");
    await fillField(page, "Email", email);
    await fillField(page, "Password", "TheWrongPassword1!");

    await submitForm(page, "Sign in", SIGN_IN_ENDPOINT);

    await expect(page.getByText("Invalid email or password")).toBeVisible();
    await expect(page).toHaveURL(/\/sign-in$/);
  });

  test("non-existent email shows error", async ({ page }) => {
    // An address that was never registered.
    const email = uniqueEmail("ghost");

    await page.goto("/sign-in");
    await fillField(page, "Email", email);
    await fillField(page, "Password", PASSWORD);

    await submitForm(page, "Sign in", SIGN_IN_ENDPOINT);

    await expect(page.getByText("Invalid email or password")).toBeVisible();
    await expect(page).toHaveURL(/\/sign-in$/);
  });

  test("successful login sets session cookie", async ({ page, browser }) => {
    const email = uniqueEmail("login");
    await registerUser(browser, { email, householdName: `Login Household ${email}` });

    await page.goto("/sign-in");
    await fillField(page, "Email", email);
    await fillField(page, "Password", PASSWORD);

    await submitForm(page, "Sign in", SIGN_IN_ENDPOINT);

    await expect(page).toHaveURL(/\/dashboard$/);
    const cookies = await page.context().cookies();
    expect(cookies.some((cookie) => cookie.name === SESSION_COOKIE)).toBe(true);
  });

  // The guard sends a signed-out visitor to /sign-in, and it carries the page
  // they asked for: the sign-in page honours a `returnTo` when one is present
  // in the URL, and the visitor comes back to the page they wanted.
  test("signed-out visitor is sent to /sign-in and logs in to the page they asked for", async ({
    page,
    browser,
  }) => {
    const email = uniqueEmail("login");
    await registerUser(browser, { email, householdName: `Login Household ${email}` });

    await page.goto("/history");

    // The pathname is /sign-in whether or not the redirect carries a query
    // string.
    await expect(page).toHaveURL((url) => url.pathname === "/sign-in");
    // The guard carries the page the visitor asked for.
    expect(new URL(page.url()).searchParams.get("returnTo")).toBe("/history");

    await fillField(page, "Email", email);
    await fillField(page, "Password", PASSWORD);

    await submitForm(page, "Sign in", SIGN_IN_ENDPOINT);

    // The visitor comes back to the page they asked for.
    await expect(page).toHaveURL((url) => url.pathname === "/history");
    // The page they came back to is a real signed-in page, not an error one.
    await expect(page.getByRole("heading", { name: "Item history" })).toBeVisible();
    const cookies = await page.context().cookies();
    expect(cookies.some((cookie) => cookie.name === SESSION_COOKIE)).toBe(true);
  });
});
