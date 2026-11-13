import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { account, user } from "@/db/schema/auth";

/**
 * The legacy account and its credential.
 *
 * Better Auth's tables: the user row, and the credential row that holds the
 * scrypt hash. They are in the new database for the rollback window (§13.2a
 * step 7) and are dropped with it (step 8).
 */
export type LegacyAccount = {
  userId: string;
  email: string;
  name: string;
  passwordHash: string;
};

/**
 * The legacy account for an email, with its password hash.
 *
 * The lookup is by email, case-insensitively: GoTrue treats the address as
 * the identity, and the legacy row may hold it in the case it was typed in.
 */
export async function findLegacyAccount(email: string): Promise<LegacyAccount | null> {
  const rows = await db
    .select({
      userId: user.id,
      email: user.email,
      name: user.name,
      passwordHash: account.password,
    })
    .from(user)
    .innerJoin(
      account,
      and(eq(account.userId, user.id), eq(account.providerId, "credential")),
    )
    .where(sql`lower(${user.email}) = lower(${email})`)
    .limit(1);

  const row = rows[0];
  if (!row || !row.passwordHash) {
    return null;
  }

  return {
    userId: row.userId,
    email: row.email,
    name: row.name,
    passwordHash: row.passwordHash,
  };
}
