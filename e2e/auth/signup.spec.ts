import { test } from "@playwright/test";
import { expect, PASSWORD, submitForm, uniqueEmail } from "../support/helpers";
import { registerUser, SESSION_COOKIE, SIGN_UP_ENDPOINT, trackRequests } from "./helpers";

// AUTH-01: User can sign up with email and password
//
// The specs run without the shared storage state: it is signed in, and the
// the app sends a signed-in visitor away from /sign-up.
test.describe("Sign up", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("valid credentials create account and session, redirect to /onboarding", async ({
    page,
  }) => {
    const email = uniqueEmail("signup");

    await page.goto("/sign-up");
    await page.getByLabel("Name").fill("Test User");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(PASSWORD);

    await submitForm(page, "Sign up", SIGN_UP_ENDPOINT);

    await expect(page).toHaveURL(/\/onboarding$/);
    await expect(page.getByText("Create your household")).toBeVisible();

    // The session exists...
    const cookies = await page.context().cookies();
    expect(cookies.some((cookie) => cookie.name === SESSION_COOKIE)).toBe(true);

    // ...and it is live: a protected route does not bounce back to /sign-in.
    // The new user has no household yet, so the app sends them to /onboarding.
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/onboarding$/);
  });

  test("empty email shows validation error", async ({ page }) => {
    const signups = trackRequests(page, SIGN_UP_ENDPOINT);

    await page.goto("/sign-up");
    await page.getByLabel("Name").fill("Test User");
    // The email field is left empty on purpose.
    await page.getByLabel("Password").fill(PASSWORD);

    await page.getByRole("button", { name: "Sign up" }).click();

    await expect(page.getByText("Invalid email address")).toBeVisible();
    await expect(page).toHaveURL(/\/sign-up$/);
    // The form never submitted, so no account was created.
    expect(signups).toHaveLength(0);
  });

  test("invalid email format shows validation error", async ({ page }) => {
    const signups = trackRequests(page, SIGN_UP_ENDPOINT);

    await page.goto("/sign-up");
    await page.getByLabel("Name").fill("Test User");
    await page.getByLabel("Email").fill("not-an-email");
    await page.getByLabel("Password").fill(PASSWORD);

    await page.getByRole("button", { name: "Sign up" }).click();

    await expect(page.getByText("Invalid email address")).toBeVisible();
    await expect(page).toHaveURL(/\/sign-up$/);
    expect(signups).toHaveLength(0);
  });

  test("password too short shows validation error", async ({ page }) => {
    const signups = trackRequests(page, SIGN_UP_ENDPOINT);

    await page.goto("/sign-up");
    await page.getByLabel("Name").fill("Test User");
    await page.getByLabel("Email").fill(uniqueEmail("signup"));
    await page.getByLabel("Password").fill("short");

    await page.getByRole("button", { name: "Sign up" }).click();

    await expect(page.getByText("Password must be at least 8 characters")).toBeVisible();
    await expect(page).toHaveURL(/\/sign-up$/);
    expect(signups).toHaveLength(0);
  });

  test("duplicate email shows error", async ({ page, browser }) => {
    const email = uniqueEmail("signup");
    await registerUser(browser, { email });

    await page.goto("/sign-up");
    await page.getByLabel("Name").fill("Test User");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(PASSWORD);

    await submitForm(page, "Sign up", SIGN_UP_ENDPOINT);

    // The message comes from the auth server, so match on its meaning and not
    // on its exact wording: GoTrue says the address is "already registered",
    // which is the same fact as "already exists".
    await expect(page.getByText(/already (exists|registered)/i)).toBeVisible();
    await expect(page).toHaveURL(/\/sign-up$/);
  });
});
