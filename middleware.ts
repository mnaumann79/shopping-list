import { NextRequest, NextResponse } from "next/server";

// The session cookie is Supabase's now. Better Auth's helper went with the
// package, and this file reads the cookie itself.
//
// The file is dead code — the application lives under `src/`, and Next.js
// only loads a middleware from `src/` — and it stays exactly where it is,
// dead, because D-11 decides its fate with the cutover and not before. It
// only has to compile.
const SESSION_COOKIE = "sb-household-auth-token";

function getSessionCookie(request: NextRequest) {
  return request.cookies.get(SESSION_COOKIE)?.value;
}

// Routes that require authentication
const PROTECTED_PREFIXES = ["/dashboard", "/household", "/settings"];
// Auth routes (redirect away if already logged in)
const AUTH_ROUTES = ["/sign-in", "/sign-up"];
// Onboarding route — allow even without active household
// const ONBOARDING_ROUTE = "/onboarding"; // (reserved for Plan 04 use)

// SECURITY NOTE: Middleware is an optimistic guard only (CVE-2025-29927).
// Sessions MUST also be validated in Server Components (see Plan 04's app layout).
// Never rely on middleware as the sole auth layer.
export function middleware(request: NextRequest) {
  const session = getSessionCookie(request);
  const { pathname } = request.nextUrl;

  const isProtected = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p));
  const isAuthRoute = AUTH_ROUTES.some((p) => pathname.startsWith(p));

  // Not authenticated + protected route → redirect to /sign-in with returnTo
  if (!session && isProtected) {
    const loginUrl = new URL("/sign-in", request.url);
    loginUrl.searchParams.set("returnTo", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Already authenticated + auth route → redirect to /dashboard
  if (session && isAuthRoute) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
