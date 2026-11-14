/**
 * Where a visitor is sent back to after they sign in.
 *
 * The rule is here, in one place, because the destination is read in two: the
 * guard builds it into the sign-in link, and the sign-in page follows the one
 * it is given. A destination the visitor typed is no safer than one the guard
 * built, so both go through the same rule.
 */

/**
 * The destination, when it is a page of this application.
 *
 * A path that starts with a single slash is on this site; "//host" is not,
 * and neither is a path that names another site outright. A destination that
 * points at the sign-in page would send the visitor round in circles.
 */
export function safeDestination(returnTo?: string | null): string | null {
  if (!returnTo?.startsWith("/") || returnTo.startsWith("//")) return null;
  if (returnTo.startsWith("/sign-in") || returnTo.startsWith("/sign-up")) {
    return null;
  }

  return returnTo;
}
