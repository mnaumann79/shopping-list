/**
 * The routes that need a signed-in caller.
 *
 * One place, because the guard and the application must protect the same
 * routes. The guard reads this list; the test beside it walks
 * `src/app/(app)` and asserts that the list still covers every page the
 * application guards — so the two cannot drift apart without the test
 * saying so.
 *
 * `/dashboard`, `/history` and `/household` are the pages under the `(app)`
 * group, whose layout checks the session. `/onboarding` is here because it
 * asks the caller to create a household, which only a signed-in caller can
 * do; it stands outside the group, so the guard is the only guard it has.
 */
export const PROTECTED_ROUTE_PREFIXES = [
  "/dashboard",
  "/history",
  "/household",
  "/onboarding",
];

/**
 * Whether the path is one of the protected routes.
 *
 * A prefix matches the route itself and what is under it, and nothing else:
 * `/history` is protected and `/history-2024` is not.
 */
export function isProtectedRoute(pathname: string): boolean {
  return PROTECTED_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}
