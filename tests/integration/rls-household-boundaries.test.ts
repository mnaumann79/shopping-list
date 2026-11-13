import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import pg from "pg";
import { sql, type SQL } from "drizzle-orm";
import { withScope, type Tx } from "@/db/scope";

/**
 * The boundaries the row-level security policies draw, measured as the
 * application role.
 *
 * The policies are the second layer of the isolation (§12.6): the
 * application-layer scope helper is the first, and the database is what makes
 * a missed predicate harmless instead of leaking. A policy that is not
 * applied is invisible — the query still returns rows, and the application
 * filters them anyway, so nothing looks wrong. So every scenario below runs
 * through the scope helper with the application-side predicate deliberately
 * absent, and asserts what the *database* does.
 *
 * The fixture is two households and a caller who belongs to both of them:
 *
 *   Household A            Household B
 *   ├─ the owner           ├─ the member (who is also the owner of A)
 *   └─ the member          └─ the other member
 *
 * The caller being a member of both is what makes the scope clause
 * load-bearing. A caller who is a member of neither sees nothing of either
 * household, and proves nothing about the scope.
 *
 * Two connections, and the difference between them is the whole point:
 *
 *   OWNER_DATABASE_URL  the role that owns the tables. It bypasses RLS by
 *                       design, so it can seed the rows and see them all.
 *   DATABASE_URL        the application's non-owner role. It is subject to
 *                       the policies, so it sees only what it may.
 *
 * The scope helper runs on the application's connection, so the reads below go
 * through the same path a request takes.
 */

const HOUSEHOLD_A = "10000000-0000-4000-8000-000000000001";
const HOUSEHOLD_B = "20000000-0000-4000-8000-000000000002";
const HOUSEHOLD_C = "90000000-0000-4000-8000-000000000009";
const OWNER_A = "30000000-0000-4000-8000-000000000003";
const MEMBER_B = "40000000-0000-4000-8000-000000000004";
const MEMBER_C = "50000000-0000-4000-8000-000000000005";
const OUTSIDER = "60000000-0000-4000-8000-000000000006";
const ITEM_A = "70000000-0000-4000-8000-000000000007";
const ITEM_B = "80000000-0000-4000-8000-000000000008";

const ownerUrl = process.env.OWNER_DATABASE_URL;
if (!ownerUrl) {
  throw new Error(
    "OWNER_DATABASE_URL is not set. The integration suite needs a connection " +
      "that owns the tables (to seed them) next to the application's own " +
      "connection in DATABASE_URL.",
  );
}

let owner: pg.Client;

beforeAll(async () => {
  owner = new pg.Client({ connectionString: ownerUrl });
  await owner.connect();

  // The users exist because the household tables reference auth.users. On a
  // Supabase instance GoTrue owns that schema; the rows are created here only
  // so the foreign keys resolve. Only the three columns every shape of the
  // table has are named, so the seeding works on the instance and on the
  // plain PostgreSQL of a local stack alike.
  await owner.query(
    `INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
       ($1, 'rls-owner-a@example.test', '{}'),
       ($2, 'rls-member-b@example.test', '{}'),
       ($3, 'rls-member-c@example.test', '{}'),
       ($4, 'rls-outsider@example.test', '{}')
     ON CONFLICT (id) DO NOTHING`,
    [OWNER_A, MEMBER_B, MEMBER_C, OUTSIDER],
  );
});

// Every scenario starts from the same fixture: some of them delete a row the
// next one needs.
beforeEach(async () => {
  await owner.query(
    `INSERT INTO households (id, name, created_by) VALUES
       ($1, 'Household A', $3),
       ($2, 'Household B', $4)
     ON CONFLICT (id) DO NOTHING`,
    [HOUSEHOLD_A, HOUSEHOLD_B, OWNER_A, MEMBER_B],
  );

  // The member of household A is the owner of household B. A transaction
  // scoped to A must not reach B, although the membership alone would allow
  // it.
  await owner.query(
    `INSERT INTO household_members (household_id, user_id, role) VALUES
       ($1, $2, 'owner'),
       ($1, $3, 'member'),
       ($4, $3, 'owner'),
       ($4, $5, 'member')
     ON CONFLICT (household_id, user_id) DO NOTHING`,
    [HOUSEHOLD_A, OWNER_A, MEMBER_B, HOUSEHOLD_B, MEMBER_C],
  );

  // One item per household. Household B's must not be reachable from a
  // transaction scoped to household A.
  await owner.query(
    `INSERT INTO items (id, household_id, name) VALUES
       ($1, $3, 'Milk'),
       ($2, $4, 'Eggs')
     ON CONFLICT (id) DO NOTHING`,
    [ITEM_A, ITEM_B, HOUSEHOLD_A, HOUSEHOLD_B],
  );
});

afterAll(async () => {
  await owner.query("DELETE FROM households WHERE id = ANY($1::uuid[])", [
    [HOUSEHOLD_A, HOUSEHOLD_B, HOUSEHOLD_C],
  ]);
  await owner.query("DELETE FROM auth.users WHERE id = ANY($1::uuid[])", [
    [OWNER_A, MEMBER_B, MEMBER_C, OUTSIDER],
  ]);
  await owner.end();
});

/** The number a count query answers. */
async function count(tx: Tx, query: SQL) {
  const result = await tx.execute(query);
  return result.rows[0].count as number;
}

/**
 * The refusal a policy makes.
 *
 * The driver wraps the database's own error, so the message that says what
 * the database refused is the cause's, not the wrapper's.
 */
async function expectRefused(run: () => Promise<unknown>) {
  const error = await run().then(
    () => null,
    (thrown: unknown) => thrown,
  );

  expect(error).toBeTruthy();
  const cause = (error as { cause?: { message?: string } }).cause;
  expect(cause?.message ?? (error as Error).message).toMatch(
    /row-level security policy/,
  );
}

describe("the household scope", () => {
  it("shows a transaction scoped to household A no rows of household B", async () => {
    const rows = await withScope({ userId: MEMBER_B, householdId: HOUSEHOLD_A }, (tx) =>
      count(
        tx,
        sql`select count(*)::int as count from items where household_id = ${HOUSEHOLD_B}`,
      ),
    );

    expect(rows).toBe(0);
  });

  it("shows a transaction scoped to household A no household of B to delete", async () => {
    const deleted = await withScope({ userId: MEMBER_B, householdId: HOUSEHOLD_A }, (tx) =>
      tx.execute(sql`delete from households where id = ${HOUSEHOLD_B}`),
    );

    expect(deleted.rowCount).toBe(0);
  });

  it("is the policies and not an empty table", async () => {
    // The owner bypasses RLS by design, so it still sees the row. Without this
    // check, a zero-row result above would prove nothing.
    const { rows } = await owner.query("SELECT id FROM items WHERE id = $1", [ITEM_B]);

    expect(rows.length).toBe(1);
  });
});

describe("the membership policy", () => {
  it("refuses a caller who is a member of nothing writing themselves in as the owner", async () => {
    // The bare "user_id = auth.uid()" would accept this row: the write check
    // would be answered by "that is my row", and the caller would be the
    // owner of a household they know the id of.
    await expectRefused(() =>
      withScope({ userId: OUTSIDER, householdId: HOUSEHOLD_B }, (tx) =>
        tx.execute(
          sql`insert into household_members (household_id, user_id, role) values (${HOUSEHOLD_B}, ${OUTSIDER}, 'owner')`,
        ),
      ),
    );
  });

  it("shows the owner every member of the household", async () => {
    const rows = await withScope({ userId: OWNER_A, householdId: HOUSEHOLD_A }, (tx) =>
      count(
        tx,
        sql`select count(*)::int as count from household_members where household_id = ${HOUSEHOLD_A}`,
      ),
    );

    expect(rows).toBe(2);
  });

  it("lets the owner remove a member", async () => {
    const removed = await withScope({ userId: OWNER_A, householdId: HOUSEHOLD_A }, (tx) =>
      tx.execute(
        sql`delete from household_members where household_id = ${HOUSEHOLD_A} and user_id = ${MEMBER_B}`,
      ),
    );

    expect(removed.rowCount).toBe(1);
  });

  it("shows a plain member only their own row", async () => {
    const rows = await withScope({ userId: MEMBER_B, householdId: HOUSEHOLD_A }, (tx) =>
      count(
        tx,
        sql`select count(*)::int as count from household_members where household_id = ${HOUSEHOLD_A}`,
      ),
    );

    expect(rows).toBe(1);
  });

  it("lets a plain member remove nobody", async () => {
    const removed = await withScope({ userId: MEMBER_B, householdId: HOUSEHOLD_A }, (tx) =>
      tx.execute(
        sql`delete from household_members where household_id = ${HOUSEHOLD_A} and user_id = ${OWNER_A}`,
      ),
    );

    expect(removed.rowCount).toBe(0);
  });

  it("lets the creator bootstrap their own household", async () => {
    // The application creates the household and joins it to it in one
    // transaction, and the membership row is written before anybody else's.
    // The bootstrap is the only self-write the policy allows.
    const joined = await withScope({ userId: OUTSIDER, householdId: HOUSEHOLD_C }, async (tx) => {
      await tx.execute(
        sql`insert into households (id, name, created_by) values (${HOUSEHOLD_C}, 'Household of the outsider', ${OUTSIDER})`,
      );
      const result = await tx.execute(
        sql`insert into household_members (household_id, user_id, role) values (${HOUSEHOLD_C}, ${OUTSIDER}, 'owner')`,
      );
      return result.rowCount;
    });

    expect(joined).toBe(1);
  });
});

describe("nobody may remove themselves", () => {
  it("refuses a member deleting their own membership row", async () => {
    // Section 12.5: nobody removes themselves, because the owner cannot be
    // recreated and a self-delete is irreversible. The membership policy has
    // no command qualifier, so the restrictive policy is what refuses it.
    const removed = await withScope({ userId: MEMBER_B, householdId: HOUSEHOLD_A }, (tx) =>
      tx.execute(
        sql`delete from household_members where household_id = ${HOUSEHOLD_A} and user_id = ${MEMBER_B}`,
      ),
    );

    expect(removed.rowCount).toBe(0);
  });

  it("refuses the owner deleting their own membership row", async () => {
    const removed = await withScope({ userId: OWNER_A, householdId: HOUSEHOLD_A }, (tx) =>
      tx.execute(
        sql`delete from household_members where household_id = ${HOUSEHOLD_A} and user_id = ${OWNER_A}`,
      ),
    );

    expect(removed.rowCount).toBe(0);
  });

  it("takes the membership rows with the household all the same", async () => {
    // The cascade is not a self-delete: the referential action runs with the
    // table owner's rights, and an owner bypasses row-level security.
    const deleted = await withScope({ userId: OWNER_A, householdId: HOUSEHOLD_A }, (tx) =>
      tx.execute(sql`delete from households where id = ${HOUSEHOLD_A}`),
    );

    expect(deleted.rowCount).toBe(1);

    const { rows } = await owner.query(
      "SELECT count(*)::int AS count FROM household_members WHERE household_id = $1",
      [HOUSEHOLD_A],
    );
    expect(rows[0].count).toBe(0);
  });
});
