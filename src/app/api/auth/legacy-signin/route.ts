import { NextRequest } from "next/server";
import { z } from "zod";
import type { User } from "@supabase/supabase-js";
import { findLegacyAccount } from "@/lib/legacy-auth/legacy-account";
import {
  verifyAgainstNothing,
  verifyLegacyPassword,
} from "@/lib/legacy-auth/verify-password";
import {
  findGoTrueUser,
  provisionGoTrueUser,
  setGoTruePassword,
} from "@/lib/legacy-auth/supabase";
import { signInWithPassword } from "@/lib/legacy-auth/sign-in";
import { setActiveHousehold } from "@/lib/legacy-auth/active-household";
import { admit, settle } from "@/lib/legacy-auth/attempt-limit";

const credentialsSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

/**
 * The transitional sign-in.
 *
 * Better Auth's scrypt hashes cannot be turned into GoTrue's bcrypt, so a
 * password cannot be carried across: it is verified once against the legacy
 * hash and handed to GoTrue, which hashes it again (§13.2c). The plaintext
 * lives for this one request, over TLS, and it is never logged.
 *
 * The route tries Supabase Auth first, and the legacy path is the fallback
 * for an account that has not signed in on the new side yet. It goes with
 * the legacy tables when the rollback window closes (§13.2a step 8).
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = credentialsSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Email and password are required" },
      { status: 400 },
    );
  }

  const { password } = parsed.data;
  const email = parsed.data.email.toLowerCase();
  const client = clientKey(req);

  // The admission limit runs before anything expensive: the route is
  // unauthenticated, and every attempt costs a scrypt and a lookup of the
  // GoTrue accounts. The capacity is reserved here and settled below,
  // whatever the outcome.
  if (!admit(client, email)) {
    return Response.json({ error: "Too many attempts" }, { status: 429 });
  }

  let succeeded = false;
  try {
    // The sign-in the application uses, and the only one that is not
    // transitional. An account that already works is signed in here, and the
    // legacy path is never reached.
    const signedIn = await signInWithPassword(email, password);
    if (signedIn) {
      succeeded = true;
      await setActiveHousehold(signedIn);
      return Response.json({ ok: true }, { status: 200 });
    }

    // The transitional path. Every step below runs whatever the outcome is,
    // so the failures cost the same as well as answer the same.
    const legacy = await findLegacyAccount(email);
    const existing = await findGoTrueUser(email);
    const verified = legacy
      ? await verifyLegacyPassword(legacy.passwordHash, password)
      : await verifyAgainstNothing(password);

    if (!legacy || !verified) {
      return unauthorized();
    }

    if (existing) {
      // The account is on the new side already. The Supabase attempt above
      // is the one that failed, and that failure is the answer the caller
      // gets: an account that has signed in is never taken over from the
      // legacy password, and no second account is ever made for the address.
      if (!mayTakeOver(existing)) {
        return unauthorized();
      }

      await setGoTruePassword(existing.id, password);
    } else {
      // No account on the new side: GoTrue hashes the password with bcrypt,
      // which is what the legacy scrypt hash could not be carried into.
      await provisionGoTrueUser({ email, password, name: legacy.name });
    }

    const userId = await signInWithPassword(email, password);
    if (!userId) {
      return unauthorized();
    }

    succeeded = true;

    // The household the membership rows point at: a migrated user lands in
    // their household, not in an empty one.
    await setActiveHousehold(userId);

    return Response.json({ ok: true }, { status: 200 });
  } finally {
    settle(client, email, succeeded);
  }
}

/**
 * Whether the transitional path may take the account over.
 *
 * The cutover provisions a GoTrue user for every legacy account, with a
 * password nobody has (§13.2a step 2), and those accounts have never signed
 * in — so they are the ones the transitional path is for. An account that
 * has signed in works on its own, and taking it over from the legacy
 * password would paper over a Supabase failure that was the caller's own
 * doing.
 */
function mayTakeOver(user: User): boolean {
  // The timestamp is optional in the SDK: an account that has never signed
  // in has none, and an omitted one says the same.
  return user.last_sign_in_at === null || user.last_sign_in_at === undefined;
}

/**
 * The one failure answer.
 *
 * "No such account", "wrong password" and "not yours" are the same answer,
 * so nothing here tells a caller which one it was.
 */
function unauthorized(): Response {
  return Response.json({ error: "Invalid email or password" }, { status: 401 });
}

/**
 * The client the attempt belongs to.
 *
 * The address the request came from, as the proxy in front of the
 * application reports it: the **rightmost** `x-forwarded-for` entry, which is
 * the nearest hop's observation. A proxy that appends puts its own entry
 * last, so a client cannot choose the key by setting the header itself.
 *
 * Next.js fills a missing `x-forwarded-for` from the socket's address and
 * keeps a value the caller supplied. So with no proxy in front the key is
 * the socket's address and every caller on the same machine shares one
 * bucket, which is the strict direction: one noisy caller then costs the
 * others their client quota, but the per-address quota still protects the
 * passwords.
 *
 * The case to know about is a client that reaches the server directly: it
 * can send its own header, Next.js keeps it, and it can rotate the value to
 * escape the client quota. The per-address quota is what protects the
 * passwords there. The deployment is safe because Vercel overwrites the
 * header before Next.js ever sees it (§13.2a).
 */
function clientKey(req: NextRequest): string {
  const entries = req.headers
    .get("x-forwarded-for")
    ?.split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  return entries?.at(-1) ?? "unknown";
}
