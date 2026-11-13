export type { HouseholdClaims, SessionUser } from "@/lib/supabase/server";

/**
 * The session the request helpers return.
 *
 * The user is the caller's verified identity: the user id is the uuid the
 * auth server vouches for, and the name and email come from the same
 * verified claims.
 *
 * The household is the one the session is looking at. It comes from the
 * `sb-household` cookie, and it is null when the cookie names no household.
 * It is a pointer, not a permission: `household_members` decides whether the
 * caller may act on it.
 */
export type Session = {
  user: {
    id: string;
    name: string;
    email: string;
  };
  activeHouseholdId: string | null;
};
