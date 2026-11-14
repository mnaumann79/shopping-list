import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { deleteChunks } from "@supabase/ssr";
import { AUTH_COOKIE_NAME, getSupabaseConfig } from "@/lib/supabase/config";
import { isProtectedRoute } from "@/lib/supabase/protected-routes";
import { readCookieSession, type CookieSession } from "@/lib/supabase/session-cookie";
import {
  RETURN_TO_HEADER,
  decideSessionState,
  readExpiry,
  signInPath,
  type SessionState,
} from "@/lib/supabase/session-guard";

/**
 * The application's edge guard.
 *
 * It runs on every request, and it does three things:
 *
 * - it decides what the caller has, from the session rather than from the
 *   cookie's presence, and sends a caller who cannot be signed in to the
 *   sign-in page with the page they asked for;
 * - it tells the application's own guard where the caller was going, because
 *   this is the only place that sees the request's path;
 * - it clears a cookie that holds a session the server will never accept,
 *   because the browser does not know that and would send the caller round
 *   in circles.
 *
 * It is not the authorization layer. The session is validated again, on the
 * server, in `src/app/(app)/layout.tsx` and in every API route (SEC-01), and
 * nothing here is allowed past that check.
 */

/**
 * The client the guard verifies access tokens with.
 *
 * One client for the module, so the signing key it fetches is fetched once
 * rather than on every request: the key is public, and the guard runs on
 * every request.
 *
 * It is a plain client rather than the server's: the server's client reads
 * the request's cookies through `next/headers`, which the edge runtime does
 * not have. The guard reads the cookie itself — with the same helper the
 * server uses, so the two read the same session.
 */
let verifier: SupabaseClient | undefined;

function getVerifier() {
  if (!verifier) {
    const { url, anonKey } = getSupabaseConfig();
    verifier = createClient(url, anonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  }

  return verifier;
}

/**
 * What the caller has, as far as the guard can tell.
 *
 * The access token decides it. A token that has expired is not verified — the
 * library refuses it before it looks at the signature — so the guard asks
 * the cookie whether a refresh token is behind it: if one is, the browser
 * may be able to renew the session on its own, and the guard does not send
 * the caller away.
 */
async function getSessionState(
  session: CookieSession | null,
): Promise<SessionState> {
  if (!session) return "not-signed-in";

  const expiry = readExpiry(session.accessToken);
  if (expiry === null) {
    // Not a token at all: there is nothing to verify and nothing to renew.
    return decideSessionState(session, "invalid");
  }
  if (expiry * 1000 <= Date.now()) {
    return decideSessionState(session, "expired");
  }

  try {
    const { error } = await getVerifier().auth.getClaims(session.accessToken);
    if (!error) return decideSessionState(session, "valid");

    // The signature did not verify, or the verification could not be carried
    // out. The first is a session the server will never accept; the second
    // is a question the guard cannot answer, and it does not refuse a caller
    // on a question it cannot answer.
    return decideSessionState(
      session,
      error.name === "AuthInvalidJwtError" ? "invalid" : "unknown",
    );
  } catch {
    return decideSessionState(session, "unknown");
  }
}

/**
 * Removes the session cookie from the browser.
 *
 * The cookie holds a session the server will never accept, and the browser
 * does not know that: it reads the cookie as a session and sends the caller
 * back to the page they came from. Clearing it is what makes the sign-in
 * page show its form instead of a circle.
 */
function clearSessionCookie(request: NextRequest, response: NextResponse) {
  return deleteChunks(
    AUTH_COOKIE_NAME,
    (name) => request.cookies.get(name)?.value ?? null,
    (name) => {
      response.cookies.set(name, "", { path: "/", maxAge: 0 });
    },
  );
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const session = await readCookieSession(
    (name) => request.cookies.get(name)?.value,
  );
  const state = await getSessionState(session);

  // The destination travels with the request. The application's own guard
  // sends a caller with no session to the sign-in page, and it can only
  // carry the destination if the guard tells it where the caller was going.
  const headers = new Headers(request.headers);
  headers.set(RETURN_TO_HEADER, pathname);

  // A caller who cannot be signed in is sent to the sign-in page, with the
  // page they asked for. A caller who might be signed in is not: the browser
  // may still renew the session, and the application's own check is the one
  // that decides.
  if (state === "not-signed-in" && isProtectedRoute(pathname)) {
    const response = NextResponse.redirect(
      new URL(signInPath(pathname), request.url),
    );
    if (session) await clearSessionCookie(request, response);

    return response;
  }

  const response = NextResponse.next({ request: { headers } });
  if (state === "not-signed-in" && session) {
    await clearSessionCookie(request, response);
  }

  return response;
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
