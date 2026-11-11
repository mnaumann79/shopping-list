import { test } from "@playwright/test";

// HSHD-02: Admin can invite by email
// HSHD-04: User can join via email invite
test.describe("Email invite flow", () => {
  test.fixme("admin can send email invite from household settings", async () => {});
  test.fixme("invitation record is created in DB after invite sent", async () => {});
  test.fixme("logged-in user visiting /accept-invite?invitationId= auto-joins household", async () => {});
  test.fixme("new user visiting /accept-invite?invitationId= is redirected to sign-up", async () => {});
  test.fixme("new user completes signup and auto-joins invited household (context preserved)", async () => {});
  test.fixme("member appears in household member list after joining", async () => {});
});
