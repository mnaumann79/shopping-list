import { createBrowserClient } from "@supabase/ssr";
import { AUTH_COOKIE_NAME, getSupabaseConfig } from "./config";

/**
 * The browser's Supabase client.
 *
 * The browser is the session's owner: it signs in, it signs out, and it
 * refreshes the access token before it expires, writing the new session to
 * the cookie the server reads. The server verifies that session; it does not
 * mint one.
 *
 * The client is a singleton — `@supabase/ssr` keeps one instance per page so
 * that its auto-refresh timer is not started twice.
 */
function buildClient() {
  const { url, anonKey } = getSupabaseConfig();

  return createBrowserClient(url, anonKey, {
    cookieOptions: { name: AUTH_COOKIE_NAME },
  });
}

export type SupabaseBrowserClient = ReturnType<typeof buildClient>;

let client: SupabaseBrowserClient | undefined;

export function getSupabaseBrowserClient(): SupabaseBrowserClient {
  client ??= buildClient();

  return client;
}
