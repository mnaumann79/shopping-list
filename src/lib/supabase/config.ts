/**
 * The Supabase project's public configuration.
 *
 * Both values are public by design: the URL names the project, and the anon
 * key is the key the browser is allowed to use. The service-role key is
 * deliberately not read here — it never belongs in code that can run in a
 * browser, and a module that could read it would invite that.
 */
export function getSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set. " +
        "They name the Supabase project the app authenticates against.",
    );
  }

  return { url, anonKey };
}

/**
 * The name of the cookie that carries the Supabase session.
 *
 * `@supabase/ssr` derives the cookie name from the project's reference unless
 * one is given, and the name is also the storage key the library reads and
 * writes. Naming it here means the server knows which cookie holds the
 * session without having to know the project's reference — and it keeps the
 * session cookie distinct from `sb-household`, which carries the active
 * household and is not a session at all.
 */
export const AUTH_COOKIE_NAME = "sb-household-auth-token";
