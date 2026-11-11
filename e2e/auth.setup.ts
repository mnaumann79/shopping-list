import { test as setup, expect } from "@playwright/test";
import path from "path";

const authFile = path.join(__dirname, "../playwright/.auth/user.json");

setup("create authenticated user with household", async ({ page }) => {
  const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = process.env.TEST_EMAIL ?? `test-${uniqueSuffix}@example.com`;
  const householdName = `Test Household ${uniqueSuffix}`;
  const password = process.env.TEST_PASSWORD ?? "TestPassword123!";

  await page.goto("/sign-up");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByLabel("Name").fill("Test User");
  await page.getByRole("button", { name: "Sign up" }).click();
  await page.waitForURL(/\/onboarding$/, { timeout: 30_000 });
  await page.getByLabel("Household name").fill(householdName);
  await page.getByRole("button", { name: /create/i }).click();
  await page.waitForURL(/\/dashboard$/, { timeout: 30_000 });
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.context().storageState({ path: authFile });
});
