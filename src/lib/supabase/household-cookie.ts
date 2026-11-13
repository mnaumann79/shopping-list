/**
 * The active household cookie.
 *
 * Supabase Auth knows *who* the user is. It does not know *which household*
 * the user is looking at — that was Better Auth's `session.activeOrganizationId`,
 * and it has no equivalent in GoTrue. The active household is this cookie.
 *
 * The cookie is deliberately not a claim in the JWT: a claim is issued when
 * the token is minted, so switching household would need a token refresh, and
 * a refresh can fail at exactly the wrong moment — mid-shop, on a bad
 * connection.
 *
 * **The cookie is never trusted.** It says which household to look at;
 * `household_members` says whether the caller may. Everything in this file is
 * about reading that pointer and refusing the values that cannot be one. The
 * membership check itself is not here — it needs the database.
 */

/** The name of the cookie that carries the active household's id. */
export const HOUSEHOLD_COOKIE = "sb-household";

/**
 * How long the cookie lives.
 *
 * The Supabase session is 30-day sliding, so a shorter-lived household cookie
 * would outlive it in the wrong direction: the user would still be signed in
 * but would arrive with no active household, and the app would send them to
 * onboarding to create a second one. The cookie therefore lives at least as
 * long as the session it points into.
 */
export const HOUSEHOLD_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

/**
 * The attributes the cookie is written with.
 *
 * `httpOnly` because the client has no business writing it: a client that
 * could set its own household id could point the application at a household
 * it does not belong to. `sameSite: "lax"` because the app is same-site and
 * the cookie has no reason to travel on cross-site requests.
 */
export function householdCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: HOUSEHOLD_COOKIE_MAX_AGE_SECONDS,
  };
}

/** A household id is a uuid. Anything else is not one, whatever the cookie says. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isHouseholdId(value: string): boolean {
  return UUID.test(value);
}

/**
 * The household id the cookie names, or null when it names none.
 *
 * A missing cookie and a cookie holding something that cannot be a household
 * id are the same thing here: the caller has no active household, and the
 * caller decides what to do about it. The id is not checked against
 * `household_members` here — that check needs the database, and it is the
 * check that actually decides whether the caller may look at the household.
 */
export function readHouseholdId(
  cookies: { get(name: string): { value: string } | undefined },
): string | null {
  const value = cookies.get(HOUSEHOLD_COOKIE)?.value;
  if (!value) return null;
  return isHouseholdId(value) ? value : null;
}
