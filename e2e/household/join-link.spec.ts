import { test } from "@playwright/test";

// HSHD-03: Admin can generate shareable join link
// HSHD-04: User can join via join link
test.describe("Shareable join link flow", () => {
  test.fixme("admin can generate a join link from household settings", async () => {});
  test.fixme("generated link has /join?token= format", async () => {});
  test.fixme("logged-in user visiting /join?token= auto-joins household", async () => {});
  test.fixme("new user visiting /join?token= is redirected to /sign-up?joinToken=", async () => {});
  test.fixme("new user completes signup and auto-joins via join token", async () => {});
  test.fixme("same join link works for a second new user (multi-use)", async () => {});
  test.fixme("expired join link shows error page", async () => {});
  test.fixme("admin regenerating link invalidates previous link", async () => {});
});
