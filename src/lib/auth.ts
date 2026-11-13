import { getVerifiedUser } from "@/lib/supabase/server";

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
 *
 * `activeOrganizationId` keeps Better Auth's name. Eleven API route files and
 * their tests read it, and this change may not touch them, so renaming it
 * here would break the build in a pull request that is not allowed to edit
 * those files. The rename belongs with the rewrite of those files. The value
 * it holds is now a household's uuid.
 */
export type Session = {
  user: {
    id: string;
    name: string;
    email: string;
  };
  session: {
    activeOrganizationId: string | null;
  };
};

/**
 * The session, resolved from the Supabase session cookie.
 *
 * The name and the `api.getSession` shape are Better Auth's, and they are
 * kept for the same reason `Session` keeps `activeOrganizationId`: the API
 * route files and their tests call this, and this change may not touch them.
 * What is behind it is not Better Auth — the session comes from Supabase
 * Auth, and the identity is verified against the auth server's claims.
 */
export const auth = {
  api: {
    getSession: async (_options?: { headers?: Headers }): Promise<Session | null> => {
      const user = await getVerifiedUser();
      if (!user) return null;

      return {
        user: {
          id: user.userId,
          name: user.name ?? "",
          email: user.email ?? "",
        },
        session: {
          activeOrganizationId: user.householdId,
        },
      };
    },
  },
};
