import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE_NAME } from "@/lib/supabase/config";

// The session cookie is Supabase's now. Better Auth's helper went with the
// package, and this file reads the cookie itself. The name comes from the
// one place it is defined, so the cookie this file guards and the cookie the
// application reads cannot drift apart.
//
// This file is the application's edge middleware: Next.js loads a
// `middleware.ts` from the project root as well as from `src/`, and this one
// runs. Its guard is optimistic — it goes by the cookie's presence, not by a
// verified session — and the real guard is server-side, in the app layout.
//
// What replaces it is D-11's decision.
const SESSION_COOKIE = AUTH_COOKIE_NAME;

function getSessionCookie(request: NextRequest) {
  return request.cookies.get(SESSION_COOKIE)?.value;
}

// Routes that require authentication
const PROTECTED_PREFIXES = ["/dashboard", "/household", "/settings"];
// Onboarding route — allow even without active household
// const ONBOARDING_ROUTE = "/onboarding"; // (reserved for Plan 04 use)

// SECURITY NOTE: Middleware is an optimistic guard only (CVE-2025-29927).
// Sessions MUST also be validated in Server Components (see Plan 04's app layout).
// Never rely on middleware as the sole auth layer.
export function middleware(request: NextRequest) {
  const session = getSessionCookie(request);
  const { pathname } = request.nextUrl;

  const isProtected = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p));

  // Not authenticated + protected route → redirect to /sign-in with returnTo
  if (!session && isProtected) {
    const loginUrl = new URL("/sign-in", request.url);
    loginUrl.searchParams.set("returnTo", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // A visitor who is already signed in is not redirected away from the sign-in
  // page. The page owns that check, and it owns it better: it asks the
  // browser for the session, and the browser can renew a session whose access
  // token lapsed while the browser was closed. A check on the cookie's
  // presence cannot do that, and redirecting on it sent such a visitor round
  // in a circle — the app layout sends them back to the sign-in page when the
  // token is expired, and the middleware sent them to the dashboard again.

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
