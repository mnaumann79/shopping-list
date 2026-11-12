import { expect, test as setup, type Page } from "@playwright/test";
import fs from "fs";
import path from "path";
import { config as loadEnv } from "dotenv";

// playwright.config.ts belongs to another task, so the test env is loaded here.
loadEnv({ path: path.join(__dirname, "../.env.test") });

const authFile = path.join(__dirname, "../playwright/.auth/user.json");
const SIGNED_IN_URL = /\/(onboarding|dashboard)$/;

// The setup drives three forms against a dev server that compiles routes on
// demand, so it needs more than the default 30s.
setup.setTimeout(180_000);

setup("create authenticated user with household", async ({ page }) => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  // An address can only be registered once, so every run signs up its own user.
  const email = (process.env.TEST_EMAIL ?? "test@example.com").replace("@", `+${suffix}@`);
  const password = process.env.TEST_PASSWORD ?? "TestPassword123!";
  const householdName = `Test Household ${suffix}`;

  await authenticate(page, email, password);
  await createHousehold(page, householdName);

  fs.mkdirSync(path.dirname(authFile), { recursive: true });
  await page.context().storageState({ path: authFile });
});

async function authenticate(page: Page, email: string, password: string) {
  await page.goto("/sign-up");
  await page.getByLabel("Name").fill("Test User");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);

  if (!(await submitForm(page, "Sign up", "/api/auth/sign-up/email"))) {
    throw new Error(`The sign-up form sent no request: ${(await formError(page)) ?? "no error shown"}`);
  }
  if ((await outcome(page)) === "in") return;

  // The address is registered already — sign in with the same credentials.
  const signUpError = await formError(page);
  await signIn(page, email, password, signUpError);
}

async function signIn(page: Page, email: string, password: string, signUpError: string | null) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);

  const sent = await submitForm(page, "Sign in", "/api/auth/sign-in/email");
  if (sent && (await outcome(page)) === "in") return;

  const signInError = await formError(page);
  throw new Error(
    `Could not authenticate ${email}. Sign-up said: ${signUpError ?? "nothing"}. ` +
      `Sign-in said: ${signInError ?? "nothing"}.`,
  );
}

async function createHousehold(page: Page, householdName: string) {
  // The onboarding page redirects to /dashboard when the user already has a
  // household and shows the form when it does not.
  await page.goto("/onboarding");
  const state = await Promise.race([
    page
      .waitForURL(/\/dashboard$/, { timeout: 30_000 })
      .then(() => "existing" as const)
      .catch(() => "none" as const),
    page
      .getByLabel("Household name")
      .waitFor({ state: "visible", timeout: 30_000 })
      .then(() => "form" as const)
      .catch(() => "none" as const),
  ]);

  if (state === "existing") {
    await expect(page).toHaveURL(/\/dashboard$/);
    return;
  }
  if (state === "none") {
    throw new Error("The onboarding page neither showed the household form nor reached /dashboard");
  }

  await page.getByLabel("Household name").fill(householdName);
  const sent = await submitForm(page, "Create household", "/api/auth/organization/create");
  const created =
    sent && (await page.waitForURL(/\/dashboard$/, { timeout: 30_000 }).then(() => true, () => false));
  if (!created) {
    const message = await formError(page);
    throw new Error(
      `Household "${householdName}" was not created: ${message ?? "the page never reached /dashboard"}`,
    );
  }
}

// A click before React hydrates is swallowed, so wait for the request the
// handler sends and click again when nothing went out.
async function submitForm(page: Page, buttonName: string, endpoint: string) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const sent = page
      .waitForRequest((request) => request.url().includes(endpoint), { timeout: 5_000 })
      .then(() => true, () => false);
    await page.getByRole("button", { name: buttonName }).click();
    if (await sent) return true;
  }
  return false;
}

// Either the form got us in or it told us why it did not.
async function outcome(page: Page) {
  return Promise.race([
    page
      .waitForURL(SIGNED_IN_URL, { timeout: 30_000 })
      .then(() => "in" as const)
      .catch(() => "timeout" as const),
    page
      .locator("p.text-destructive")
      .first()
      .waitFor({ state: "visible", timeout: 30_000 })
      .then(() => "error" as const)
      .catch(() => "timeout" as const),
  ]);
}

async function formError(page: Page) {
  return page
    .locator("p.text-destructive")
    .first()
    .textContent({ timeout: 5_000 })
    .catch(() => null);
}
