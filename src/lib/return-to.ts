/**
 * Where a visitor is sent back to after they sign in.
 *
 * The rule is here, in one place, because the destination is read in two: the
 * guard builds it into the sign-in link, and the sign-in page follows the one
 * it is given. A destination the visitor typed is no safer than one the guard
 * built, so both go through the same rule.
 */

/**
 * The characters a browser reads as something else.
 *
 * A backslash is a slash to a browser, and the tab and the newline are
 * removed from a URL before it is read — so `/\evil.com` is another site
 * and not a page of this one. A percent-encoded backslash
 * (`/%5cevil.com`) stays on this site: the URL parser does not decode it
 * before it looks for the authority.
 */
const UNSAFE = /[\\\u0000-\u001f\u007f]/;

/**
 * The destination, when it is a page of this application.
 *
 * A path that starts with a single slash is on this site; "//host" is not,
 * and neither is a path that names another site outright. A destination that
 * points at the sign-in page would send the visitor round in circles.
 */
export function safeDestination(returnTo?: string | null): string | null {
  if (!returnTo?.startsWith("/") || returnTo.startsWith("//")) return null;
  if (UNSAFE.test(returnTo)) return null;
  if (returnTo.startsWith("/sign-in") || returnTo.startsWith("/sign-up")) {
    return null;
  }

  return returnTo;
}
