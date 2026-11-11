import { test } from "@playwright/test";

// AUTH-03: Session persists across browser refresh
test.describe("Session persistence", () => {
  test.fixme("authenticated user refreshes page and stays on /dashboard", async () => {});
  test.fixme("authenticated user opens new tab to /dashboard and stays authenticated", async () => {});
  test.fixme("unauthenticated user visiting /dashboard is redirected to /sign-in with returnTo", async () => {});
});
