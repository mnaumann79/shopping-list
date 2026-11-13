import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type BrowserClient = ReturnType<typeof getSupabaseBrowserClient>;

/** The signed-in session, or null when there is none. */
export type AuthSession = Awaited<
  ReturnType<BrowserClient["auth"]["getSession"]>
>["data"]["session"];

/**
 * Sign in with an email address and a password.
 *
 * The error is returned rather than thrown, because a wrong password is an
 * ordinary outcome of a form, not an exception. The message the form shows
 * does not distinguish "no such address" from "wrong password": that would
 * tell an attacker which addresses have accounts.
 */
export async function signInWithPassword(
  email: string,
  password: string,
): Promise<{ error: { message: string } | null }> {
  const { error } = await getSupabaseBrowserClient().auth.signInWithPassword({
    email,
    password,
  });

  return { error: error ? { message: error.message } : null };
}

/**
 * Sign up with an email address and a password.
 *
 * Email confirmation is off (decision D-8), so a successful sign-up leaves
 * the user signed in. The name is stored in the user's metadata, which is
 * where GoTrue keeps what the application knows about the user.
 */
export async function signUpWithPassword(
  name: string,
  email: string,
  password: string,
): Promise<{ error: { message: string } | null }> {
  const { error } = await getSupabaseBrowserClient().auth.signUp({
    email,
    password,
    options: { data: { name } },
  });

  return { error: error ? { message: error.message } : null };
}

/**
 * Make a household the session's active household.
 *
 * The client never writes the `sb-household` cookie: it asks the server to,
 * and the server checks the membership before it does. A client that could
 * set its own household id could point the application at a household it does
 * not belong to.
 */
export async function setActiveHousehold(householdId: string): Promise<boolean> {
  const response = await fetch("/api/auth/household", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ householdId }),
  });

  return response.ok;
}

/** A household the signed-in user belongs to. */
export type Household = {
  id: string;
  name: string;
  role: string;
};

/** The households the signed-in user belongs to. */
export async function listHouseholds(): Promise<Household[]> {
  const response = await fetch("/api/households");
  if (!response.ok) return [];

  return (await response.json()) as Household[];
}

/**
 * A member of the active household.
 *
 * `id` is the user's id: the membership row is keyed by
 * (household_id, user_id), so there is no separate membership id to name.
 */
export type HouseholdMember = {
  id: string;
  name: string;
  email: string;
  role: string;
};

/** The members of the active household. */
export async function listHouseholdMembers(): Promise<HouseholdMember[]> {
  const response = await fetch("/api/households/members");
  if (!response.ok) return [];

  return (await response.json()) as HouseholdMember[];
}

/**
 * Create a household.
 *
 * The membership row is created by the server, with the signed-in user as
 * its owner. The client never writes one itself.
 */
export async function createHousehold(
  name: string,
): Promise<{ householdId: string } | { error: string }> {
  const response = await fetch("/api/households", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    return { error: body?.error ?? "Failed to create household" };
  }

  return body as { householdId: string };
}

/**
 * Accept an invitation to a household.
 *
 * The household id comes back with the acceptance: the invitation names the
 * household, and the server has just added the membership.
 */
export async function acceptInvitation(
  invitationId: string,
): Promise<{ householdId: string } | null> {
  const response = await fetch(
    `/api/households/invitations/${encodeURIComponent(invitationId)}/accept`,
    { method: "POST" },
  );

  if (!response.ok) return null;

  const body = (await response.json().catch(() => null)) as { householdId?: string } | null;

  return body?.householdId ? { householdId: body.householdId } : null;
}

/** Sign out. The session cookie goes with it. */
export async function signOut(): Promise<{ error: { message: string } | null }> {
  const { error } = await getSupabaseBrowserClient().auth.signOut();

  return { error: error ? { message: error.message } : null };
}

/**
 * The session, read once.
 *
 * On the client this is safe: the session came from the cookie the browser
 * holds, and the browser is the party that wrote it. The server never uses
 * this path — it verifies the session instead.
 */
export async function getSession(): Promise<AuthSession> {
  const { data } = await getSupabaseBrowserClient().auth.getSession();

  return data.session;
}

/**
 * The session, and whether it is still being read.
 *
 * `isPending` is true until the first read lands, so a caller can hold back
 * a render that would otherwise flash a signed-out header at a signed-in
 * user.
 */
export function useSession() {
  const [session, setSession] = useState<AuthSession>(null);
  const [isPending, setIsPending] = useState(true);

  useEffect(() => {
    const client = getSupabaseBrowserClient();

    client.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setIsPending(false);
    });

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setIsPending(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  return { session, isPending };
}
