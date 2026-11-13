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

  test("uses NEXT_PUBLIC_APP_URL when building absolute URLs", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com";

    expect(getAcceptInviteUrl("inv-123")).toBe(
      "https://app.example.com/accept-invite?invitationId=inv-123"
    );
    expect(getJoinUrl("token-123")).toBe("https://app.example.com/join?token=token-123");
  });

  test("a stale BETTER_AUTH_URL in the environment changes nothing", () => {
    // The regression this exists for. The application used to read two
    // names for its base URL and the Better Auth one won, so a deployment
    // that followed the old template built every join link and every
    // invitation link against the placeholder in the template while the
    // real value sat next to it, ignored. The failure was silent: the
    // links looked right and went somewhere else.
    process.env.BETTER_AUTH_URL = "https://wrong.example.com";
    process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com";

    expect(getJoinUrl("token-123")).toBe("https://app.example.com/join?token=token-123");
    expect(getAcceptInviteUrl("inv-123")).toBe(
      "https://app.example.com/accept-invite?invitationId=inv-123"
    );
  });

  test("falls back to the local address when no base URL is set", () => {
    delete process.env.NEXT_PUBLIC_APP_URL;

    expect(getJoinUrl("token-123")).toBe("http://localhost:3000/join?token=token-123");
  });
});
