// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { stringToBase64URL } from "@supabase/ssr";

const { getClaims } = vi.hoisted(() => ({ getClaims: vi.fn() }));

// The guard verifies the access token with the auth server. The test says
// what the auth server answers, so that the guard's own rules are what is
// under test and not the network.
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ auth: { getClaims } }),
}));

import { NextRequest } from "next/server";
import { AUTH_COOKIE_NAME } from "@/lib/supabase/config";
import { RETURN_TO_HEADER } from "@/lib/supabase/session-guard";
import { middleware } from "./middleware";

process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";

/** A token that says when it expires. */
function tokenExpiringIn(seconds: number) {
  const expiry = Math.floor(Date.now() / 1000) + seconds;
  const payload = stringToBase64URL(JSON.stringify({ exp: expiry }));
  return `header.${payload}.signature`;
}

/** The session cookie, the way `@supabase/ssr` writes it. */
function sessionCookie(accessToken: string, refreshToken?: string) {
  const session: Record<string, string> = { access_token: accessToken };
  if (refreshToken) session.refresh_token = refreshToken;

  return `${AUTH_COOKIE_NAME}=base64-${stringToBase64URL(JSON.stringify(session))}`;
}

function request(path: string, cookie?: string) {
  return new NextRequest(`http://localhost${path}`, {
    headers: cookie ? { cookie } : undefined,
  });
}

describe("the edge guard", () => {
  beforeEach(() => {
    getClaims.mockReset();
    getClaims.mockResolvedValue({ data: { claims: {} }, error: null });
  });

  it("sends a caller with no session to the sign-in page, with the page they asked for", async () => {
    const response = await middleware(request("/dashboard"));

    expect(response.status).toBe(307);

    const location = new URL(response.headers.get("location") ?? "");
    expect(location.pathname).toBe("/sign-in");
    expect(location.searchParams.get("returnTo")).toBe("/dashboard");
  });

  it("lets a caller with a verified session through", async () => {
    const response = await middleware(
      request("/dashboard", sessionCookie(tokenExpiringIn(600))),
    );

    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("location")).toBeNull();
  });

  it("does not send a signed-in caller away from the sign-in page", async () => {
    // The branch that used to be here is what caught a visitor whose access
    // token had lapsed in a circle between this guard and the layout's.
    const response = await middleware(
      request("/sign-in", sessionCookie(tokenExpiringIn(600))),
    );

    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("location")).toBeNull();
  });

  it("lets a caller whose token lapsed renew it", async () => {
    const response = await middleware(
      request("/dashboard", sessionCookie(tokenExpiringIn(-600), "refresh-token")),
    );

    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("location")).toBeNull();
  });

  it("sends away a caller whose session cannot be renewed, and clears the cookie", async () => {
    const response = await middleware(
      request("/dashboard", sessionCookie(tokenExpiringIn(-600))),
    );

    expect(response.status).toBe(307);
    // The browser does not know that the session is dead: it reads the cookie
    // as a session and sends the caller back where they came from.
    expect(response.headers.get("set-cookie")).toContain(`${AUTH_COOKIE_NAME}=`);
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  it("tells the application's own guard where the caller was going", async () => {
    const response = await middleware(
      request("/household/settings", sessionCookie(tokenExpiringIn(600))),
    );

    expect(
      response.headers.get(`x-middleware-request-${RETURN_TO_HEADER}`),
    ).toBe("/household/settings");
    expect(response.headers.get("x-middleware-override-headers")).toContain(
      RETURN_TO_HEADER,
    );
  });

  it("does not refuse a caller whose session it could not check", async () => {
    // The auth server could not be reached. The guard refuses only what it
    // can show the caller cannot use.
    getClaims.mockRejectedValue(new Error("the auth server is unreachable"));

    const response = await middleware(
      request("/dashboard", sessionCookie(tokenExpiringIn(600))),
    );

    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("location")).toBeNull();
  });
});
