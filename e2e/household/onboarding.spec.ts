import { test } from "@playwright/test";

// HSHD-01: User can create a household during onboarding
test.describe("Household onboarding", () => {
  test.fixme("new user after signup is redirected to /onboarding, not /dashboard", async () => {});
  test.fixme("onboarding cannot be skipped — /dashboard redirects back to /onboarding if no household", async () => {});
  test.fixme("submitting household name creates household and redirects to /dashboard", async () => {});
  test.fixme("household switcher shows created household name in header", async () => {});
});
