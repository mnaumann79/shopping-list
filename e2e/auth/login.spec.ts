import { test } from "@playwright/test";

// AUTH-02: User can log in with email and password
test.describe("Login", () => {
  test.fixme("valid credentials redirect to /dashboard", async () => {});
  test.fixme("wrong password shows error", async () => {});
  test.fixme("non-existent email shows error", async () => {});
  test.fixme("successful login sets session cookie", async () => {});
  test.fixme("returnTo param preserved after login", async () => {});
});
