import { sql } from "drizzle-orm";
import { db } from "./index";

/**
 * The caller, and the household the query is scoped to.
 *
 * Both are uuids: the user id is the one Supabase Auth issues, and it is what
 * `auth.uid()` resolves to inside the transaction.
 */
export type Scope = {
  userId: string; // auth.uid() — a uuid
  householdId: string; // a uuid
};

/** The transaction client the caller's query runs on. */
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * The only sanctioned way to read or write a household-scoped table.
 *
 * One transaction, and everything that makes it a scoped one happens inside
 * it:
 *
 * 1. `request.jwt.claims` is set with the third argument `true`, so the claim
 *    is local to this transaction and cannot leak into the next request that
 *    borrows the connection. `auth.uid()` reads it, and the row-level
 *    security policies are written against it.
 * 2. `app.current_household` is set the same way, and the policies honour it:
 *    a user who belongs to two households can only reach the one this
 *    transaction is scoped to. A transaction that sets no scope is narrowed
 *    by nothing but the membership.
 * 3. The per-household advisory lock is taken, so two devices pushing at the
 *    same time are serialised for that household (ADR-05). It is
 *    transaction-scoped, so it is released when the transaction ends. The id
 *    goes through `uuid` first, because PostgreSQL accepts an id in several
 *    spellings and two spellings of one household must not be two locks.
 * 4. The caller's query runs on the transaction's client, so it sees the
 *    claims, the scope and the lock.
 *
 * A helper that set the claim on the ambient connection and then opened a
 * separate transaction would not work, and the difference is invisible until
 * a policy is bypassed.
 */
export async function withScope<T>(
  scope: Scope,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  const claims = JSON.stringify({ sub: scope.userId, role: "authenticated" });

  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select set_config('request.jwt.claims', ${claims}, true)`,
    );
    await tx.execute(
      sql`select set_config('app.current_household', ${scope.householdId}, true)`,
    );
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${scope.householdId}::uuid::text, 0))`,
    );
    return fn(tx);
  });
}
