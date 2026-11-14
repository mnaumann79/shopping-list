import { stringFromBase64URL } from "@supabase/ssr";
import { safeDestination } from "@/lib/return-to";
import type { CookieSession } from "./session-cookie";

/**
 * What the guard knows about the caller's session.
 *
 * The three answers are the guard's whole vocabulary, and each one says what
 * the guard does about it:
 *
 * - **signed in** — the access token verified: the auth server signed it and
 *   it has not expired. The request goes through.
 * - **maybe signed in** — the access token did not verify, but the cookie
 *   still holds a refresh token, so the browser may be able to renew the
 *   session on its own. The request goes through as well: the application's
 *   own check decides, and the guard has told it where the caller was going.
 * - **not signed in** — there is no session, and no way to make one. The
 *   guard sends the caller to the sign-in page, with the page they asked
 *   for.
 */
export type SessionState = "signed-in" | "maybe-signed-in" | "not-signed-in";

/**
 * What the verification of an access token says.
 *
 * - **valid** — the signature is the auth server's and the token has not
 *   expired.
 * - **expired** — the token has expired. The library refuses an expired
 *   token before it looks at the signature, so an expired token is never
 *   verified here.
 * - **invalid** — the signature did not verify: the token was tampered with,
 *   or it is not a token at all.
 * - **unknown** — the verification could not be carried out: the auth server
 *   could not be reached, or the project is not configured.
 */
export type TokenState = "valid" | "expired" | "invalid" | "unknown";

/**
 * The header the guard writes the caller's destination into.
 *
 * The guard is the only place that sees the request's path, so it is the
 * only place that can tell the application's own guard where the caller was
 * going — and the application's guard is the one that sends a caller with no
 * session to the sign-in page.
 */
export const RETURN_TO_HEADER = "x-return-to";

/**
 * The guard's decision.
 *
 * The token's state and the cookie's contents together say what the guard
 * can know; the decision is here so that the guard and its test read the
 * same rules.
 */
export function decideSessionState(
  session: CookieSession | null,
  token: TokenState,
): SessionState {
  if (!session) return "not-signed-in";
  if (token === "valid") return "signed-in";

  // A lapsed token with a refresh token behind it is the one case the guard
  // cannot decide: the browser may renew the session and carry on, and the
  // guard cannot know that before it happens. So it does not send the caller
  // away — the application's own check decides, and the caller keeps the
  // page they asked for.
  //
  // A verification that could not be carried out is the same case: the guard
  // refuses only what it can show the caller cannot use.
  if (token === "expired" && session.refreshToken) return "maybe-signed-in";
  if (token === "unknown") return "maybe-signed-in";

  return "not-signed-in";
}

/**
 * The access token's expiry, in seconds since the epoch, or null when the
 * token cannot be read.
 *
 * The claim is read, not verified: it says whether the token has lapsed, and
 * a lapsed token never gets past the guard on this claim alone.
 */
export function readExpiry(accessToken: string): number | null {
  const payload = accessToken.split(".")[1];
  if (!payload) return null;

  try {
    const claims = JSON.parse(stringFromBase64URL(payload));
    return typeof claims?.exp === "number" ? claims.exp : null;
  } catch {
    return null;
  }
}

/**
 * Where a caller with no session is sent.
 *
 * The destination rides along, so the sign-in page can send the caller back
 * to the page they asked for.
 */
export function signInPath(returnTo?: string | null): string {
  const destination = safeDestination(returnTo);
  return destination
    ? `/sign-in?returnTo=${encodeURIComponent(destination)}`
    : "/sign-in";
}
