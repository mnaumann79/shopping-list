import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { withScope } from "@/db/scope";
import { households, householdMembers } from "@/db/schema/households";

/**
 * The creator must be able to read the household they just made.
 *
 * PostgreSQL applies a table's SELECT policies to the rows an
 * INSERT ... RETURNING returns. The application's `createHousehold` writes
 * the household with `.returning()`, so the row it had just written had to
 * pass the households policies — and it could not: the bootstrap policy
 * asked a SECURITY DEFINER function over the households table, which cannot
 * see the row the statement is writing into it. The insert was refused with
 * "new row violates row-level security policy for table households", and
 * the application could not create a household at all.
 *
 * These scenarios run as the application role, so a policy that is not
 * applied is invisible here: the insert would simply succeed.
 */

const USER_A = "aaaaaaaa-1111-4111-8111-111111111111";
const USER_B = "bbbbbbbb-2222-4222-8222-222222222222";

// The household the application role creates in the first scenario.
const HOUSEHOLD_NEW = "cccccccc-3333-4333-8333-333333333333";
// A household created by somebody else: the creator is B.
const HOUSEHOLD_OTHER = "dddddddd-4444-4444-8444-444444444444";
// Created by A, with B in it, and A has been removed from it.
const HOUSEHOLD_REMOVED = "eeeeeeee-5555-4555-8555-555555555555";

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
       ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rls-create-a@example.test', '{}', '{}', now(), now()),
       ($2, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rls-create-b@example.test', '{}', '{}', now(), now())
     ON CONFLICT (id) DO NOTHING`,
    [USER_A, USER_B],
  );

  // A household that belongs to B, and one that A created and was removed
  // from. Both are seeded as the owner: the owner bypasses RLS by design.
  await owner.query(
    `INSERT INTO households (id, name, created_by) VALUES
       ($1, 'Other Household', $3),
       ($2, 'Removed Household', $4)
     ON CONFLICT (id) DO NOTHING`,
    [HOUSEHOLD_OTHER, HOUSEHOLD_REMOVED, USER_B, USER_A],
  );
  await owner.query(
    `INSERT INTO household_members (household_id, user_id, role) VALUES
       ($1, $3, 'owner'),
       ($2, $3, 'member'),
       ($2, $4, 'owner')
     ON CONFLICT DO NOTHING`,
    [HOUSEHOLD_OTHER, HOUSEHOLD_REMOVED, USER_B, USER_A],
  );
  // A is removed from the household they created. B is still in it.
  await owner.query(
    `DELETE FROM household_members
      WHERE household_id = $1 AND user_id = $2`,
    [HOUSEHOLD_REMOVED, USER_A],
  );
});

afterAll(async () => {
  await owner.query("DELETE FROM household_members WHERE household_id = ANY($1::uuid[])", [
    [HOUSEHOLD_NEW, HOUSEHOLD_OTHER, HOUSEHOLD_REMOVED],
  ]);
  await owner.query("DELETE FROM households WHERE id = ANY($1::uuid[])", [
    [HOUSEHOLD_NEW, HOUSEHOLD_OTHER, HOUSEHOLD_REMOVED],
  ]);
  await owner.query("DELETE FROM auth.users WHERE id = ANY($1::uuid[])", [[USER_A, USER_B]]);
  await owner.end();
});

describe("creating a household as the application role", () => {
  it("returns the row it just inserted", async () => {
    // The application's own two statements: the household, then the
    // membership row that makes its creator the owner.
    const created = await withScope(
      { userId: USER_A, householdId: HOUSEHOLD_NEW },
      async (tx) => {
        const [household] = await tx
          .insert(households)
          .values({ id: HOUSEHOLD_NEW, name: "New Household", createdBy: USER_A })
          .returning();

        await tx.insert(householdMembers).values({
          householdId: HOUSEHOLD_NEW,
          userId: USER_A,
          role: "owner",
        });

        return household;
      },
    );

    expect(created?.id).toBe(HOUSEHOLD_NEW);
    expect(created?.name).toBe("New Household");
  });

  it("shows the creator the household they just joined", async () => {
    // The membership row exists now, so the read goes through the member
    // policy rather than the bootstrap one.
    const rows = await withScope({ userId: USER_A, householdId: HOUSEHOLD_NEW }, (tx) =>
      tx.select().from(households),
    );

    expect(rows.length).toBe(1);
    expect(rows[0].id).toBe(HOUSEHOLD_NEW);
  });

  it("shows a caller no household they did not create", async () => {
    const rows = await withScope({ userId: USER_A, householdId: HOUSEHOLD_OTHER }, (tx) =>
      tx.select().from(households),
    );

    expect(rows).toEqual([]);
  });

  it("shows a removed creator no household that still has a member", async () => {
    // A created HOUSEHOLD_REMOVED and was removed from it. The bootstrap
    // policy asks whether the household has no members at all - and it has
    // B's - so the read is refused. A membership sub-query inside the
    // policy would not see B's row either, and the creator would keep
    // reading the household.
    const rows = await withScope({ userId: USER_A, householdId: HOUSEHOLD_REMOVED }, (tx) =>
      tx.select().from(households),
    );

    expect(rows).toEqual([]);
  });

  it("is the policies and not an empty table", async () => {
    // The owner bypasses RLS by design, so it still sees the rows. Without
    // this check, the zero-row results above would prove nothing.
    const { rows } = await owner.query("SELECT id FROM households WHERE id = $1", [
      HOUSEHOLD_OTHER,
    ]);

    expect(rows.length).toBe(1);
  });
});
