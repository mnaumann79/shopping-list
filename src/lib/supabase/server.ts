import { combineChunks, createServerClient, stringFromBase64URL } from "@supabase/ssr";
import { cookies } from "next/headers";
import { AUTH_COOKIE_NAME, getSupabaseConfig } from "./config";
import { readHouseholdId } from "./household-cookie";

/**
 * What the application knows about the caller, once it has been verified.
 *
 * `userId` is the caller's `auth.uid()` — a uuid string, and the only
 * identity the application ever acts on.
 *
 * `householdId` is the household the `sb-household` cookie names, and it is
 * **not** a claim that the caller may act on that household. It is the pointer
 * the scope helper resolves: `withScope` opens a transaction, sets the
 * claims, and the membership row is there if and only if the caller is a
 * member. A cookie that names a household the caller does not belong to
 * resolves to no rows — the cookie says which household to look at, and
 * `household_members` says whether the caller may.
 */
export type HouseholdClaims = {
  userId: string;
  householdId: string | null;
};

export type SessionUser = {
  /** The caller's verified identity. */
  userId: string;
};

/**
 * The caller, as the verified claims describe them.
 *
 * Everything here comes from the access token's claims, which the auth server
 * signed. Nothing here comes from the cookie's own contents: the cookie is a
 * place a caller can write to.
 */
export type VerifiedSession = {
  userId: string;
  email: string | null;
  name: string | null;
  /** The household the cookie names. Not yet checked for membership. */
  householdId: string | null;
  /** The access token's claims, as the auth server signed them. */
  claims: Record<string, unknown>;
};

/**
 * The Supabase client for the server.
 *
 * A new client per request, never a shared one: the client reads and writes
 * the request's cookies, and a client that outlived its request would carry
 * one user's session into another's.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  const { url, anonKey } = getSupabaseConfig();

  return createServerClient(url, anonKey, {
    cookieOptions: { name: AUTH_COOKIE_NAME },
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // A Server Component's cookie store is read-only: Next.js only lets
          // a Route Handler or a Server Action write cookies. The browser
          // owns the session and refreshes it, so a refresh that cannot be
          // written here is not lost work — it is work the browser was going
          // to do anyway. The repository's root `middleware.ts` runs as the
          // edge middleware, and B1-T01 decides what replaces it.
        }
      },
    },
  });
}

/** The prefix `@supabase/ssr` writes before a base64url-encoded cookie value. */
const BASE64_PREFIX = "base64-";

/**
 * The access token in the session cookie, without refreshing anything.
 *
 * The server reads the session; it does not renew it. That distinction is
 * not cosmetic: refreshing rotates the refresh token, and a Server Component
 * cannot write the rotated token back to the cookie. A server that refreshed
 * and could not persist would spend the client's refresh token, and the
 * browser's own refresh a moment later would present a token the server had
 * already used — which is how a session gets revoked for no reason.
 *
 * So the token is read straight out of the cookie and handed to `getClaims`,
 * which verifies it. `getClaims` with an explicit token never refreshes.
 */
async function readAccessToken(): Promise<string | null> {
  const cookieStore = await cookies();

  const encoded = await combineChunks(
    AUTH_COOKIE_NAME,
    (name) => cookieStore.get(name)?.value ?? null,
  );
  if (!encoded || !encoded.startsWith(BASE64_PREFIX)) return null;

  try {
    const session = JSON.parse(stringFromBase64URL(encoded.slice(BASE64_PREFIX.length)));
    return typeof session?.access_token === "string" ? session.access_token : null;
  } catch {
    // A cookie that cannot be decoded is not a session. The library treats
    // the same thing as absent.
    return null;
  }
}

/**
 * The caller, as the verified claims describe them, or null when there is no
 * session.
 *
 * The identity comes from the access token's verified claims, never from the
 * cookie's contents: the cookie is a place a caller can write to, and the
 * claims are what the auth server signed.
 */
export async function getVerifiedSession(): Promise<VerifiedSession | null> {
  const accessToken = await readAccessToken();
  if (!accessToken) return null;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims(accessToken);
  if (error || !data?.claims?.sub) return null;

  const claims = data.claims;
  const metadata = claims.user_metadata as { name?: unknown } | undefined;

  return {
    userId: claims.sub,
    email: typeof claims.email === "string" ? claims.email : null,
    name: typeof metadata?.name === "string" ? metadata.name : null,
    householdId: readHouseholdId(await cookies()),
    claims: { ...claims },
  };
}

/**
 * The caller's verified identity, or null when there is no session.
 *
 * This is the contract the scope helper sits on top of: it says who the
 * caller is, and nothing else. The active household is a separate question —
 * it is the cookie's pointer, and whether the caller may act on it is what
 * `household_members` says inside the scope helper's transaction.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await getVerifiedSession();
  if (!session) return null;

  return { userId: session.userId };
}
