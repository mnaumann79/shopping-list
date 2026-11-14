import { describe, expect, it } from "vitest";
import { stringToBase64URL } from "@supabase/ssr";
import { decideSessionState, readExpiry, signInPath } from "./session-guard";
import type { CookieSession } from "./session-cookie";

/** A session the cookie holds, with a refresh token behind it. */
const SESSION: CookieSession = {
  accessToken: "access-token",
  refreshToken: "refresh-token",
};

/** The same session, with no way to renew it. */
const SESSION_WITHOUT_REFRESH: CookieSession = {
  accessToken: "access-token",
  refreshToken: null,
};

/** A token that says when it expires. */
function tokenExpiringAt(expiry: number) {
  const payload = stringToBase64URL(JSON.stringify({ exp: expiry }));
  return `header.${payload}.signature`;
}

describe("decideSessionState", () => {
  it("calls a verified token a session", () => {
    expect(decideSessionState(SESSION, "valid")).toBe("signed-in");
  });

  it("sends away a caller with no session at all", () => {
    expect(decideSessionState(null, "valid")).toBe("not-signed-in");
  });

  it("lets a caller with a lapsed token and a refresh token renew it", () => {
    // The browser may renew the session on its own, and the guard cannot know
    // that before it happens — so it does not send the caller away.
    expect(decideSessionState(SESSION, "expired")).toBe("maybe-signed-in");
  });

  it("sends away a caller whose token lapsed and cannot be renewed", () => {
    expect(decideSessionState(SESSION_WITHOUT_REFRESH, "expired")).toBe(
      "not-signed-in",
    );
  });

  it("sends away a caller whose token did not verify", () => {
    // The signature did not verify: this is a session the server will never
    // accept, whatever the cookie says.
    expect(decideSessionState(SESSION, "invalid")).toBe("not-signed-in");
  });

  it("does not refuse a caller on a question it cannot answer", () => {
    // The auth server could not be reached. The guard refuses only what it can
    // show the caller cannot use.
    expect(decideSessionState(SESSION, "unknown")).toBe("maybe-signed-in");
  });
});

describe("readExpiry", () => {
  it("reads the expiry out of the token", () => {
    expect(readExpiry(tokenExpiringAt(1_800_000_000))).toBe(1_800_000_000);
  });

  it("returns null for a token that cannot be read", () => {
    expect(readExpiry("not-a-token")).toBeNull();
    expect(readExpiry("header.%%%.signature")).toBeNull();
  });

  it("returns null when the token carries no expiry", () => {
    const token = `header.${stringToBase64URL(JSON.stringify({ sub: "user" }))}.signature`;
    expect(readExpiry(token)).toBeNull();
  });
});

describe("signInPath", () => {
  it("carries the page the caller asked for", () => {
    expect(signInPath("/dashboard")).toBe("/sign-in?returnTo=%2Fdashboard");
  });

  it("sends a caller with nowhere to go back to to the sign-in page", () => {
    expect(signInPath(null)).toBe("/sign-in");
    expect(signInPath("")).toBe("/sign-in");
  });

  it("refuses a destination that points off this site", () => {
    expect(signInPath("//example.com")).toBe("/sign-in");
    expect(signInPath("https://example.com")).toBe("/sign-in");
  });

  it("refuses a destination that would send the caller in a circle", () => {
    expect(signInPath("/sign-in")).toBe("/sign-in");
    expect(signInPath("/sign-up")).toBe("/sign-in");
  });
});
