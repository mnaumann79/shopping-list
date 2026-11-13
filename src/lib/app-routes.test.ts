import { afterEach, describe, expect, test } from "vitest";
import {
  getAcceptInvitePath,
  getAcceptInviteUrl,
  getJoinPath,
  getJoinUrl,
} from "@/lib/app-routes";

describe("app-routes", () => {
  afterEach(() => {
    delete process.env.BETTER_AUTH_URL;
    delete process.env.VERCEL_BRANCH_URL;
    delete process.env.VERCEL_URL;
    delete process.env.NEXT_PUBLIC_APP_URL;
  });

  test("builds the accept-invite path with the expected query param", () => {
    expect(getAcceptInvitePath("inv-123")).toBe("/accept-invite?invitationId=inv-123");
  });

  test("builds the join path with the expected query param", () => {
    expect(getJoinPath("token-123")).toBe("/join?token=token-123");
  });

  test("uses BETTER_AUTH_URL when building absolute URLs", () => {
    process.env.BETTER_AUTH_URL = "https://app.example.com";

    expect(getAcceptInviteUrl("inv-123")).toBe(
      "https://app.example.com/accept-invite?invitationId=inv-123"
    );
    expect(getJoinUrl("token-123")).toBe("https://app.example.com/join?token=token-123");
  });
});


