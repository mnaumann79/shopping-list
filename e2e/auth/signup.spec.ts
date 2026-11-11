import { test } from "@playwright/test";

// AUTH-01: User can sign up with email and password
test.describe("Sign up", () => {
  test.fixme("valid credentials create account and session, redirect to /onboarding", async () => {});
  test.fixme("empty email shows validation error", async () => {});
  test.fixme("invalid email format shows validation error", async () => {});
  test.fixme("password too short shows validation error", async () => {});
  test.fixme("duplicate email shows error", async () => {});
});
