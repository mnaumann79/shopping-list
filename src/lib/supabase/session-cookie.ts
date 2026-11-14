import { combineChunks, stringFromBase64URL } from "@supabase/ssr";
import { AUTH_COOKIE_NAME } from "./config";

/**
 * The session the session cookie holds.
 *
 * `accessToken` is the token the auth server signed; `refreshToken` is the
 * token the browser can trade for a new one, and it is null when the cookie
 * holds none.
 */
export type CookieSession = {
  accessToken: string;
  refreshToken: string | null;
};

/** The prefix `@supabase/ssr` writes before a base64url-encoded cookie value. */
const BASE64_PREFIX = "base64-";

/**
 * The session the cookie holds, or null when it holds none.
 *
 * The cookie is a place a caller can write to, so nothing here is a session
 * until the access token is verified: this says what the cookie says, and the
 * caller says who they are.
 *
 * The getter is passed in rather than read from the request, because the
 * server reads the request's cookies and the middleware reads the request's
 * cookies too — from the edge runtime, where the server's `cookies()` is not
 * available.
 */
export async function readCookieSession(
  getCookie: (
    name: string,
  ) => string | undefined | null | Promise<string | undefined | null>,
): Promise<CookieSession | null> {
  const encoded = await combineChunks(
    AUTH_COOKIE_NAME,
    async (name) => (await getCookie(name)) ?? null,
  );

  if (!encoded?.startsWith(BASE64_PREFIX)) return null;

  try {
    const session = JSON.parse(
      stringFromBase64URL(encoded.slice(BASE64_PREFIX.length)),
    );
    if (typeof session?.access_token !== "string") return null;

    return {
      accessToken: session.access_token,
      refreshToken:
        typeof session.refresh_token === "string" && session.refresh_token
          ? session.refresh_token
          : null,
    };
  } catch {
    // A cookie that cannot be decoded is not a session. The library treats
    // the same thing as absent.
    return null;
  }
}
