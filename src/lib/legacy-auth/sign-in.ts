import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseAnonKey, supabaseUrl } from "./supabase";

/**
 * Signs in with Supabase Auth and sets the session cookies.
 *
 * The cookies are the session: @supabase/ssr writes them, and the rest of
 * the application reads them back. Returns the user's id, or null when the
 * credentials were refused — a wrong password and an unknown account are
 * the same answer, because GoTrue answers the same for both.
 */
export async function signInWithPassword(
  email: string,
  password: string,
): Promise<string | null> {
  const cookieStore = await cookies();

  const supabase = createServerClient(supabaseUrl(), supabaseAnonKey(), {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // A Server Component cannot set cookies. A route handler can, and
          // this is a route handler, so reaching here means the caller was
          // not one.
        }
      },
    },
  });

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return null;
  }

  return data.user?.id ?? null;
}
