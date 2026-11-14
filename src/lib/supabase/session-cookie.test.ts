import { describe, expect, it } from "vitest";
import { stringToBase64URL } from "@supabase/ssr";
import { AUTH_COOKIE_NAME } from "./config";
import { readCookieSession } from "./session-cookie";

/** The cookie the way `@supabase/ssr` writes it. */
function cookieValue(session: unknown) {
  return `base64-${stringToBase64URL(JSON.stringify(session))}`;
}

/** A cookie store that holds the given cookies, and nothing else. */
function cookieStore(values: Record<string, string>) {
  return (name: string) => values[name] ?? null;
}

describe("readCookieSession", () => {
  it("reads the session the cookie holds", async () => {
    const store = cookieStore({
      [AUTH_COOKIE_NAME]: cookieValue({
        access_token: "access-token",
        refresh_token: "refresh-token",
      }),
    });

    await expect(readCookieSession(store)).resolves.toEqual({
      accessToken: "access-token",
      refreshToken: "refresh-token",
    });
  });

  it("reads a session the cookie had to split into chunks", async () => {
    // A long session is written as `name.0`, `name.1`, ... — the guard has to
    // see the same session the server does, however it was written.
    const value = cookieValue({
      access_token: "access-token",
      refresh_token: "refresh-token",
    });
    const store = cookieStore({
      [`${AUTH_COOKIE_NAME}.0`]: value.slice(0, 10),
      [`${AUTH_COOKIE_NAME}.1`]: value.slice(10),
    });

    await expect(readCookieSession(store)).resolves.toEqual({
      accessToken: "access-token",
      refreshToken: "refresh-token",
    });
  });

  it("returns null when there is no cookie", async () => {
    await expect(readCookieSession(cookieStore({}))).resolves.toBeNull();
  });

  it("returns null for a cookie the library did not write", async () => {
    // A cookie is a place a caller can write to, so its presence is nothing.
    const store = cookieStore({ [AUTH_COOKIE_NAME]: "anything" });

    await expect(readCookieSession(store)).resolves.toBeNull();
  });

  it("returns null for a cookie that cannot be decoded", async () => {
    const store = cookieStore({ [AUTH_COOKIE_NAME]: "base64-%%%" });

    await expect(readCookieSession(store)).resolves.toBeNull();
  });

  it("returns null for a cookie that holds no access token", async () => {
    const store = cookieStore({
      [AUTH_COOKIE_NAME]: cookieValue({ refresh_token: "refresh-token" }),
    });

    await expect(readCookieSession(store)).resolves.toBeNull();
  });

  it("reports a session with no refresh token as one that cannot be renewed", async () => {
    const store = cookieStore({
      [AUTH_COOKIE_NAME]: cookieValue({ access_token: "access-token" }),
    });

    await expect(readCookieSession(store)).resolves.toEqual({
      accessToken: "access-token",
      refreshToken: null,
    });
  });
});
