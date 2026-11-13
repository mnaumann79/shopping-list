import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { withScope } from "@/db/scope";
import { items } from "@/db/schema/items";

/**
 * The proof that the row-level security policies are real.
 *
 * A policy that is not applied is invisible: the query still returns rows, and
 * the application-layer predicate filters them anyway, so nothing looks wrong.
 * So this suite removes the application-side predicate on purpose — it reads
 * every item of every household through the scope helper — and asserts that
 * the database itself refuses to show a household its neighbour's rows.
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
 *
 * NOT COMMITTED YET. This file imports `src/db/scope.ts`, which is being
 * written in P0S-T04, and the type-check that CI requires would fail on the
 * import until that lands. It goes into the pull request with:
 *
 *   - this file and `vitest.integration.config.ts`,
 *   - `vitest.config.ts`: the unit suite excludes `tests/`, so the
 *     integration suite never runs without a database,
 *   - `package.json`: the `test:integration` script,
 *   - `.github/workflows/integration.yml`: the step that runs it.
 */

const HOUSEHOLD_A = "aaaaaaaa-1111-4111-8111-111111111111";
const HOUSEHOLD_B = "bbbbbbbb-2222-4222-8222-222222222222";
const USER_A = "cccccccc-3333-4333-8333-333333333333";
const USER_B = "dddddddd-4444-4444-8444-444444444444";
const ITEM_B = "eeeeeeee-5555-4555-8555-555555555555";

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
  // so the foreign keys resolve.
  await owner.query(
    `INSERT INTO auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
     VALUES
       ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rls-a@example.test', '{}', '{}', now(), now()),
       ($2, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rls-b@example.test', '{}', '{}', now(), now())
     ON CONFLICT (id) DO NOTHING`,
    [USER_A, USER_B],
  );

  await owner.query(
    `INSERT INTO households (id, name, created_by) VALUES
       ($1, 'Household A', $3),
       ($2, 'Household B', $4)
     ON CONFLICT (id) DO NOTHING`,
    [HOUSEHOLD_A, HOUSEHOLD_B, USER_A, USER_B],
  );

  await owner.query(
    `INSERT INTO household_members (household_id, user_id, role) VALUES
       ($1, $2, 'owner'),
       ($3, $4, 'owner')
     ON CONFLICT (household_id, user_id) DO NOTHING`,
    [HOUSEHOLD_A, USER_A, HOUSEHOLD_B, USER_B],
  );

  // One item, in household B. Household A must not see it.
  await owner.query(
    `INSERT INTO items (id, household_id, name) VALUES ($1, $2, 'Eggs')
     ON CONFLICT (id) DO NOTHING`,
    [ITEM_B, HOUSEHOLD_B],
  );
});

afterAll(async () => {
  await owner.query("DELETE FROM items WHERE id = $1", [ITEM_B]);
  await owner.query("DELETE FROM household_members WHERE household_id = ANY($1::uuid[])", [
    [HOUSEHOLD_A, HOUSEHOLD_B],
  ]);
  await owner.query("DELETE FROM households WHERE id = ANY($1::uuid[])", [
    [HOUSEHOLD_A, HOUSEHOLD_B],
  ]);
  await owner.query("DELETE FROM auth.users WHERE id = ANY($1::uuid[])", [[USER_A, USER_B]]);
  await owner.end();
});

describe("the row-level security policies", () => {
  it("shows a member the rows of their own household", async () => {
    const rows = await withScope({ userId: USER_B, householdId: HOUSEHOLD_B }, (tx) =>
      tx.select().from(items),
    );

    expect(rows.length).toBe(1);
  });

  it("shows a member of another household no rows at all", async () => {
    // No predicate: the database, not the application, has to hide the row.
    const rows = await withScope({ userId: USER_A, householdId: HOUSEHOLD_A }, (tx) =>
      tx.select().from(items),
    );

    expect(rows).toEqual([]);
  });

  it("is the policies and not an empty table", async () => {
    // The owner bypasses RLS by design, so it still sees the row. Without this
    // check, a zero-row result above would prove nothing.
    const { rows } = await owner.query("SELECT id FROM items WHERE id = $1", [ITEM_B]);

    expect(rows.length).toBe(1);
  });
});
