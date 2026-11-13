import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Signs in with Supabase Auth and sets the session cookies.
 *
 * The client is the application's own, so the session is written under the
 * name the application reads (`AUTH_COOKIE_NAME`) with the attributes it
 * expects — a sign-in that wrote its cookie under another name would look
 * like it worked and would not.
 *
 * Returns the user's id, or null when the credentials were refused: a wrong
 * password and an unknown account are the same answer, because GoTrue
 * answers the same for both.
 */
export async function signInWithPassword(
  email: string,
  password: string,
): Promise<string | null> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return null;
  }

  return data.user?.id ?? null;
}
