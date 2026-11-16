import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import pg from "pg";
import { updateItem } from "@/server/services/items";

/**
 * Replacing an item's store tags is one unit.
 *
 * `updateItem` deletes the item's tags and inserts the new ones. If the two
 * are not one unit, a failure between them leaves the item with **no tags at
 * all**: the delete has committed and the insert has not. The item is still
 * there, and it has silently lost the stores it was in.
 *
 * The cause of that is gone — the application runs on the standard `pg`
 * driver, `updateItem` runs inside `withScope`, and `withScope` is one
 * `db.transaction()` — so the delete and the insert are one unit today. But
 * nothing pins it: a change that moved the delete out of the transaction
 * would bring the defect back, silently, and nothing would say so.
 *
 * The scenario needs an insert that fails **after** the delete has run, and
 * the application's own check will not provide one: `updateItem` refuses a
 * store that is not in the household before it deletes anything, so that
 * failure would leave the tags untouched whatever the transaction did — and
 * the test would pass even if the two statements were in different
 * transactions. So the insert is made to fail by a trigger, on one store of
 * this household and no other, and the trigger is dropped again in the
 * teardown.
 *
 * The failure is asserted by what it says: the test fails unless the insert
 * was actually attempted, which is what makes the tags that survive it
 * meaningful.
 */

const USER = "a1a1a1a1-1111-4111-8111-111111111111";
const HOUSEHOLD = "b2b2b2b2-2222-4222-8222-222222222222";
const ITEM = "c3c3c3c3-3333-4333-8333-333333333333";

// The two stores the item carries to begin with.
const STORE_A = "d4d4d4d4-4444-4444-8444-444444444444";
const STORE_B = "e5e5e5e5-5555-4555-8555-555555555555";
// A third store of the same household: the one an update can really replace
// the tags with.
const STORE_C = "f6f6f6f6-6664-4664-8664-666666666666";
// The store whose tag cannot be inserted. The trigger refuses this one.
const STORE_REFUSED = "9c9c9c9c-9999-4999-8999-999999999999";

const ownerUrl = process.env.OWNER_DATABASE_URL;
const appUrl = process.env.DATABASE_URL;
if (!ownerUrl || !appUrl) {
  throw new Error(
    "OWNER_DATABASE_URL and DATABASE_URL are not set. The integration suite " +
      "needs a connection that owns the tables (to seed them) next to the " +
      "application's own connection in DATABASE_URL.",
  );
}

let owner: pg.Client;

/** The tags the item carries, read by the owner so the rows are the ones that count. */
async function tagsOf(itemId: string): Promise<string[]> {
  const { rows } = await owner.query(
    "SELECT store_id::text AS store_id FROM item_stores WHERE item_id = $1 ORDER BY store_id",
    [itemId],
  );
  return rows.map((row) => row.store_id);
}

beforeAll(async () => {
  owner = new pg.Client({ connectionString: ownerUrl });
  await owner.connect();

  // The user exists because the household tables reference auth.users. On a
  // Supabase instance GoTrue owns that schema; the row is created here only
  // so the foreign keys resolve.
  await owner.query(
    `INSERT INTO auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
     VALUES ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'atomicity@example.test', '{}', '{}', now(), now())
     ON CONFLICT (id) DO NOTHING`,
    [USER],
  );
  await owner.query(
    "INSERT INTO households (id, name, created_by) VALUES ($1, 'Atomicity Household', $2) ON CONFLICT (id) DO NOTHING",
    [HOUSEHOLD, USER],
  );
  await owner.query(
    "INSERT INTO household_members (household_id, user_id, role) VALUES ($1, $2, 'owner') ON CONFLICT DO NOTHING",
    [HOUSEHOLD, USER],
  );

  // Four stores of the household. The refused one is an ordinary store as
  // far as the application is concerned: it is in the household and it is
  // active, so the application's own check lets it through.
  await owner.query(
    `INSERT INTO stores (id, household_id, name) VALUES
       ($1, $3, 'Store A'),
       ($2, $3, 'Store B'),
       ($4, $3, 'Store C'),
       ($5, $3, 'Store Refused')
     ON CONFLICT (id) DO NOTHING`,
    [STORE_A, STORE_B, HOUSEHOLD, STORE_C, STORE_REFUSED],
  );
  await owner.query(
    "INSERT INTO items (id, household_id, name, created_by_id) VALUES ($1, $2, 'Milk', $3) ON CONFLICT (id) DO NOTHING",
    [ITEM, HOUSEHOLD, USER],
  );
  await owner.query(
    "INSERT INTO item_stores (item_id, store_id) VALUES ($1, $2), ($1, $3) ON CONFLICT DO NOTHING",
    [ITEM, STORE_A, STORE_B],
  );

  // The trigger that refuses one tag. It is a BEFORE INSERT trigger, so it
  // runs after the delete that `updateItem` has already done, and it fails
  // the statement that follows it.
  await owner.query(`
    CREATE OR REPLACE FUNCTION refuse_one_store_tag() RETURNS trigger AS $$
    BEGIN
      IF NEW.store_id = '${STORE_REFUSED}'::uuid THEN
        RAISE EXCEPTION 'the tag for this store cannot be inserted';
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);
  await owner.query(`
    CREATE TRIGGER refuse_one_store_tag_trigger
      BEFORE INSERT ON item_stores
      FOR EACH ROW EXECUTE FUNCTION refuse_one_store_tag();
  `);
});

/**
 * The fixture is reset before every scenario, so a run that failed leaves
 * nothing behind for the next one.
 */
beforeEach(async () => {
  await owner.query("DELETE FROM item_stores WHERE item_id = $1", [ITEM]);
  await owner.query(
    "INSERT INTO item_stores (item_id, store_id) VALUES ($1, $2), ($1, $3)",
    [ITEM, STORE_A, STORE_B],
  );
  await owner.query("UPDATE items SET name = 'Milk' WHERE id = $1", [ITEM]);
});

afterAll(async () => {
  await owner.query("DROP TRIGGER IF EXISTS refuse_one_store_tag_trigger ON item_stores");
  await owner.query("DROP FUNCTION IF EXISTS refuse_one_store_tag()");
  await owner.query("DELETE FROM item_stores WHERE item_id = $1", [ITEM]);
  await owner.query("DELETE FROM items WHERE id = $1", [ITEM]);
  await owner.query("DELETE FROM stores WHERE id = ANY($1::uuid[])", [
    [STORE_A, STORE_B, STORE_C, STORE_REFUSED],
  ]);
  await owner.query("DELETE FROM household_members WHERE household_id = $1", [HOUSEHOLD]);
  await owner.query("DELETE FROM households WHERE id = $1", [HOUSEHOLD]);
  await owner.query("DELETE FROM auth.users WHERE id = $1", [USER]);
  await owner.end();
});

describe("replacing an item's store tags", () => {
  it("leaves the tags in place when the insert cannot succeed", async () => {
    // The update deletes the tags and then inserts one that the trigger
    // refuses. The failure is the trigger's, so the insert really was
    // attempted — and the delete had already run when it was.
    const failure = await updateItem({
      scope: { userId: USER, householdId: HOUSEHOLD },
      itemId: ITEM,
      updates: { name: "Renamed", storeIds: [STORE_REFUSED] },
    }).then(
      () => null,
      (error: unknown) => error,
    );

    expect(failure).not.toBeNull();
    // The driver wraps the failure, so the trigger's own message is looked
    // for in the cause as well as in the message itself.
    const message = [
      (failure as Error).message,
      ((failure as { cause?: Error }).cause?.message ?? ""),
    ].join(" ");
    expect(message).toMatch(/cannot be inserted/);

    // The tags the item had are the tags it has. If the delete and the
    // insert were not one unit, the item would have no tags at all.
    expect(await tagsOf(ITEM)).toEqual([STORE_A, STORE_B]);

    // And the rest of the update went back with them: the name is the one
    // the item had, not the one the failed update wrote.
    const { rows } = await owner.query("SELECT name FROM items WHERE id = $1", [ITEM]);
    expect(rows[0].name).toBe("Milk");
  });

  it("replaces the tags when the insert can succeed", async () => {
    // The control: the same update with a store the insert can take. Without
    // it, the scenario above would also pass on a fixture that never had any
    // tags to begin with.
    const updated = await updateItem({
      scope: { userId: USER, householdId: HOUSEHOLD },
      itemId: ITEM,
      updates: { name: "Oat milk", storeIds: [STORE_C] },
    });

    expect(updated.storeIds).toEqual([STORE_C]);
    expect(await tagsOf(ITEM)).toEqual([STORE_C]);
  });
});
