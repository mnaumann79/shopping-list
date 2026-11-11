import { afterEach, describe, expect, test } from "vitest";
import {
  getAcceptInvitePath,
  getAcceptInviteUrl,
  getAuthBaseUrl,
  getAuthTrustedOrigins,
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

describe("getAuthBaseUrl", () => {
  afterEach(() => {
    delete process.env.BETTER_AUTH_URL;
    delete process.env.VERCEL_BRANCH_URL;
    delete process.env.VERCEL_URL;
  });

  test("falls back to http://localhost:3000 when no env vars are set", () => {
    expect(getAuthBaseUrl()).toBe("http://localhost:3000");
  });

  test("prefers BETTER_AUTH_URL over Vercel vars", () => {
    process.env.BETTER_AUTH_URL = "https://app.example.com";
    process.env.VERCEL_BRANCH_URL = "shopping-list-2026-git-feature-username.vercel.app";
    process.env.VERCEL_URL = "shopping-list-2026.vercel.app";

    expect(getAuthBaseUrl()).toBe("https://app.example.com");
  });

  test("uses VERCEL_BRANCH_URL when BETTER_AUTH_URL is unset", () => {
    process.env.VERCEL_BRANCH_URL = "shopping-list-2026-git-feature-username.vercel.app";
    process.env.VERCEL_URL = "shopping-list-2026.vercel.app";

    expect(getAuthBaseUrl()).toBe("https://shopping-list-2026-git-feature-username.vercel.app");
  });

  test("uses VERCEL_URL when only it is set", () => {
    process.env.VERCEL_URL = "shopping-list-2026.vercel.app";

    expect(getAuthBaseUrl()).toBe("https://shopping-list-2026.vercel.app");
  });
});

describe("getAuthTrustedOrigins", () => {
  afterEach(() => {
    delete process.env.BETTER_AUTH_URL;
    delete process.env.VERCEL_BRANCH_URL;
    delete process.env.VERCEL_URL;
  });

  test("always includes the production origin", () => {
    expect(getAuthTrustedOrigins()).toContain("https://shopping-list-2026.vercel.app");
  });

  test("includes the resolved baseURL alongside the production origin", () => {
    process.env.BETTER_AUTH_URL = "https://app.example.com";

    expect(getAuthTrustedOrigins()).toEqual(
      expect.arrayContaining([
        "https://shopping-list-2026.vercel.app",
        "https://app.example.com",
      ])
    );
  });

  test("deduplicates when VERCEL_BRANCH_URL resolves to the same URL as the base", () => {
    process.env.VERCEL_BRANCH_URL = "shopping-list-2026.vercel.app";

    const origins = getAuthTrustedOrigins();
    const occurrences = origins.filter(
      (origin) => origin === "https://shopping-list-2026.vercel.app"
    );

    expect(occurrences).toHaveLength(1);
  });

  test("includes the Vercel preview URLs when present", () => {
    process.env.VERCEL_BRANCH_URL = "shopping-list-2026-git-fix-13.vercel.app";
    process.env.VERCEL_URL = "shopping-list-2026.vercel.app";

    const origins = getAuthTrustedOrigins();

    expect(origins).toEqual(
      expect.arrayContaining([
        "https://shopping-list-2026.vercel.app",
        "https://shopping-list-2026-git-fix-13.vercel.app",
      ])
    );
  });
});
