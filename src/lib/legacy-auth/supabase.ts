import { createClient, type User } from "@supabase/supabase-js";
import { getSupabaseConfig } from "@/lib/supabase/config";

/** How many users one page of the admin API holds. */
const PER_PAGE = 1000;

/** How many pages the email lookup walks before it gives up. */
const MAX_PAGES = 20;

/**
 * The service role key.
 *
 * It never leaves the server: it is the only way to provision a GoTrue user
 * and the only way to look one up. The application's own configuration
 * deliberately does not read it — a module that could read it would invite
 * it — so it is read here, in the one place that needs it.
 */
function serviceRoleKey(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
  }
  return key;
}

/** The admin client: the service role, with no session of its own. */
function adminClient() {
  const { url } = getSupabaseConfig();

  return createClient(url, serviceRoleKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * The GoTrue user for an email, if there is one.
 *
 * The admin API has no email filter, so the users are paged and the one with
 * the address is looked for. That is a transitional cost on a family-sized
 * instance, and it goes with the legacy code.
 */
export async function findGoTrueUser(email: string): Promise<User | null> {
  const admin = adminClient().auth.admin;

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const { data, error } = await admin.listUsers({ page, perPage: PER_PAGE });
    if (error) {
      throw error;
    }

    const match = data?.users.find(
      (candidate) => candidate.email?.toLowerCase() === email.toLowerCase(),
    );
    if (match) {
      return match;
    }

    if (!data?.users.length) {
      return null;
    }
  }

  return null;
}

/**
 * Provisions the GoTrue user with the legacy password.
 *
 * GoTrue hashes it with bcrypt, and that is the whole point of the
 * transitional path: the scrypt hash cannot be carried across, so the
 * plaintext is handed over once and the new hash is made here.
 *
 * Returns null when the account already exists — the admin API refuses the
 * second account, and nothing here creates one.
 */
export async function provisionGoTrueUser(input: {
  email: string;
  password: string;
  name: string;
}): Promise<User | null> {
  const { data, error } = await adminClient().auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
    user_metadata: { name: input.name },
  });

  if (error) {
    if (isAlreadyRegistered(error)) {
      return null;
    }
    throw error;
  }

  return data.user;
}

/** Sets the password of an existing GoTrue user. */
export async function setGoTruePassword(userId: string, password: string): Promise<void> {
  const { error } = await adminClient().auth.admin.updateUserById(userId, { password });
  if (error) {
    throw error;
  }
}

/** Whether the admin API refused because the account is already there. */
function isAlreadyRegistered(error: { status?: number; message?: string }): boolean {
  return error.status === 422 || /already (been )?registered/i.test(error.message ?? "");
}
