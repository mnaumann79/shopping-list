import { test as setup, type Page } from "@playwright/test";
import fs from "fs";
import path from "path";
import { config as loadEnv } from "dotenv";

// The config loads .env.test too; loading it here keeps this file
// self-contained, and dotenv never overrides a variable that is already set.
loadEnv({ path: path.join(__dirname, "../.env.test") });

const authFile = path.join(__dirname, "../playwright/.auth/user.json");
const SIGNED_IN_URL = /\/(onboarding|dashboard)$/;

/** The GoTrue endpoint the browser client signs up against. */
const SIGN_UP_ENDPOINT = "/auth/v1/signup";

/** The GoTrue endpoint the browser client signs in against. */
const SIGN_IN_ENDPOINT = "/auth/v1/token";

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

  if (!(await submitForm(page, "Sign up", SIGN_UP_ENDPOINT))) {
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

  const sent = await submitForm(page, "Sign in", SIGN_IN_ENDPOINT);
  if (sent && (await outcome(page)) === "in") return;

  const signInError = await formError(page);
  throw new Error(
    `Could not authenticate ${email}. Sign-up said: ${signUpError ?? "nothing"}. ` +
      `Sign-in said: ${signInError ?? "nothing"}.`,
  );
}

/**
 * Creates the household through the onboarding form.
 *
 * The onboarding page creates the household and makes it the session's
 * active household, so the setup drives the product rather than reaching for
 * an endpoint of its own.
 */
async function createHousehold(page: Page, householdName: string) {
  await page.goto("/onboarding");
  await page.getByLabel("Household name").fill(householdName);
  await page.getByRole("button", { name: "Create household" }).click();
  await page.waitForURL(/\/dashboard$/, { timeout: 30_000 });
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
  const error = page
    .locator("p.text-destructive")
    .first()
    .textContent({ timeout: 5_000 })
    .catch(() => null);

  return error;
}
