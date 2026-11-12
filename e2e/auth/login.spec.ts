import { test, expect } from "@playwright/test";
import { PASSWORD, registerUser, submitForm, uniqueEmail } from "./helpers";

// AUTH-02: User can log in with email and password
//
// The specs run without the shared storage state: it is signed in, and the
// middleware sends a signed-in visitor away from /sign-in.
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

  test("returnTo param preserved after login", async ({ page, request }) => {
    const email = uniqueEmail("login");
    await registerUser(request, { email, householdName: `Login Household ${email}` });

    // The middleware sends an unauthenticated visitor to /sign-in with the
    // page they asked for in `returnTo`.
    await page.goto("/history");
    await expect(page).toHaveURL(/\/sign-in$/);
    expect(new URL(page.url()).searchParams.get("returnTo")).toBe("/history");

    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(PASSWORD);

    await submitForm(page, "Sign in", "/api/auth/sign-in/email");

    // The login lands on the page the visitor wanted, not on the default.
    await expect(page).toHaveURL(/\/history$/);
    await expect(page.getByRole("heading", { name: "Item history" })).toBeVisible();
  });
});
