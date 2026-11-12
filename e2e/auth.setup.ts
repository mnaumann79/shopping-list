import { expect, test as setup, type Page } from "@playwright/test";
import fs from "fs";
import path from "path";
import { config as loadEnv } from "dotenv";

// playwright.config.ts belongs to another task, so the test env is loaded here.
loadEnv({ path: path.join(__dirname, "../.env.test") });

const authFile = path.join(__dirname, "../playwright/.auth/user.json");
const SIGNED_IN_URL = /\/(onboarding|dashboard)$/;

// The setup drives two full round trips against a dev server that compiles
// routes on demand, so it needs more than the default 30s.
setup.setTimeout(120_000);

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
  await page.getByRole("button", { name: "Sign up" }).click();

  if (await reachesApp(page)) return;

  // Sign-up did not get us in — the address may be registered already.
  const signUpError = await formError(page);
  await signIn(page, email, password, signUpError);
}

async function signIn(page: Page, email: string, password: string, signUpError: string | null) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();

  if (await reachesApp(page)) return;

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
  const outcome = await Promise.race([
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

  if (outcome === "existing") {
    await expect(page).toHaveURL(/\/dashboard$/);
    return;
  }
  if (outcome === "none") {
    throw new Error("The onboarding page neither showed the household form nor reached /dashboard");
  }

  await page.getByLabel("Household name").fill(householdName);
  await page.getByRole("button", { name: "Create household" }).click();

  const created = await page
    .waitForURL(/\/dashboard$/, { timeout: 30_000 })
    .then(() => true, () => false);
  if (!created) {
    const message = await formError(page);
    throw new Error(
      `Household "${householdName}" was not created: ${message ?? "the page never reached /dashboard"}`,
    );
  }
}

async function reachesApp(page: Page) {
  return page.waitForURL(SIGNED_IN_URL, { timeout: 30_000 }).then(() => true, () => false);
}

async function formError(page: Page) {
  return page
    .locator("p.text-destructive")
    .first()
    .textContent({ timeout: 5_000 })
    .catch(() => null);
}
