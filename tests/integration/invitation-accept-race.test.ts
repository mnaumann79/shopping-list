import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import pg from "pg";

/**
 * The invitation accept path, under concurrency.
 *
 * `app_accept_household_invitation` reads the invitation, decides, and then
 * writes to it. Two things can go wrong in the window between the read and
 * the write:
 *
 * - a revocation that commits in between is written over: the invitation
 *   ends up accepted *and* revoked, and the caller is in the household the
 *   operator believed they had taken back;
 * - two concurrent accepts both pass the check and both write.
 *
 * The scenarios below drive that window deliberately: the accept is made to
 * block with the invitation's row still open, and the second party is let
 * in while it is blocked. The connections are raw transactions rather than
 * the scope helper's, because the helper takes the household's advisory lock
 * and would serialise the accepts before the function ever sees them - the
 * race is in the database, so the test has to reach the database.
 *
 * The role is the application's own (`app`), so the policies apply to it and
 * the function's SECURITY DEFINER rights are the ones the application uses.
 */

const HOUSEHOLD = "77777777-1111-4111-8111-111111111111";
const INVITEE = "77777777-2222-4222-8222-222222222222";
const OWNER = "77777777-3333-4333-8333-333333333333";
const INVITATION = "77777777-4444-4444-8444-444444444444";

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
let app: pg.Client[];

/** Begin a transaction on an application connection, as a signed-in member. */
async function beginAs(
  client: pg.Client,
  userId: string,
  householdId: string,
): Promise<void> {
  await client.query("BEGIN");
  await client.query("select set_config('request.jwt.claims', $1, true)", [
    JSON.stringify({ sub: userId, role: "authenticated" }),
  ]);
  await client.query("select set_config('app.current_household', $1, true)", [
    householdId,
  ]);
}

/**
 * Start an acceptance without waiting for it.
 *
 * The returned promise settles when the function has finished; the caller
 * waits for it at the end. The query is issued and not awaited so that the
 * test can act while it is still running.
 */
function startAccept(
  client: pg.Client,
  userId: string,
  householdId: string,
): Promise<{ household: string | null }> {
  const promise = (async () => {
    await beginAs(client, userId, householdId);
    const result = await client.query(
      "select app_accept_household_invitation($1) as household",
      [INVITATION],
    );
    await client.query("COMMIT");
    return result.rows[0] as { household: string | null };
  })();
  // The test awaits the promise itself; this keeps a rejection from being
  // reported as an unhandled one while the test is still setting the stage.
  promise.catch(() => undefined);
  return promise;
}

/**
 * The backend's process id, for `pg_stat_activity`.
 *
 * The driver does not declare it, but it is there: every connection is a
 * backend, and the backend's pid is what the catalog lists it under.
 */
function backendId(client: pg.Client): number {
  return (client as unknown as { processID: number }).processID;
}

/** Wait until every one of these backends is waiting for a lock. */
async function waitForLock(pids: number[], timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { rows } = await owner.query(
      `select count(*)::int as count
         from pg_stat_activity
        where pid = any($1::int[]) and wait_event_type = 'Lock'`,
      [pids],
    );
    if (rows[0].count === pids.length) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("the accept did not block on a lock");
}

beforeAll(async () => {
  owner = new pg.Client({ connectionString: ownerUrl });
  await owner.connect();

  app = [];
  for (let i = 0; i < 3; i += 1) {
    const client = new pg.Client({ connectionString: appUrl });
    await client.connect();
    app.push(client);
  }

  // The fixture: a household with its owner, and an invitation addressed to
  // somebody who is not a member yet - which is the whole point of an
  // invitation.
  await owner.query(
    `INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
       ($1, 'race-owner@example.test', '{}'),
       ($2, 'race-invitee@example.test', '{}')
     ON CONFLICT (id) DO NOTHING`,
    [OWNER, INVITEE],
  );
  await owner.query(
    `INSERT INTO households (id, name, created_by) VALUES ($1, 'Race Household', $2)
     ON CONFLICT (id) DO NOTHING`,
    [HOUSEHOLD, OWNER],
  );
  await owner.query(
    `INSERT INTO household_members (household_id, user_id, role) VALUES ($1, $2, 'owner')
     ON CONFLICT DO NOTHING`,
    [HOUSEHOLD, OWNER],
  );
  await owner.query(
    `INSERT INTO household_invitations
       (id, household_id, email, role, token, invited_by, expires_at)
     VALUES ($1, $2, 'race-invitee@example.test', 'member', $3, $4, now() + interval '1 hour')
     ON CONFLICT (id) DO NOTHING`,
    [INVITATION, HOUSEHOLD, "race-token-" + HOUSEHOLD, OWNER],
  );
});

/**
 * The fixture is reset before every scenario, so a run that failed leaves
 * nothing behind for the next one.
 */
beforeEach(async () => {
  await owner.query(
    "DELETE FROM household_members WHERE household_id = $1 AND user_id = $2",
    [HOUSEHOLD, INVITEE],
  );
  await owner.query(
    "UPDATE household_invitations SET accepted_at = NULL, revoked_at = NULL WHERE id = $1",
    [INVITATION],
  );
});

afterAll(async () => {
  await owner.query("DELETE FROM household_invitations WHERE id = $1", [INVITATION]);
  await owner.query("DELETE FROM household_members WHERE household_id = $1", [HOUSEHOLD]);
  await owner.query("DELETE FROM households WHERE id = $1", [HOUSEHOLD]);
  await owner.query("DELETE FROM auth.users WHERE id = ANY($1::uuid[])", [[OWNER, INVITEE]]);
  await owner.end();
  for (const client of app) await client.end();
});

describe("accepting an invitation", () => {
  it("lets only one of two concurrent accepts succeed", async () => {
    // The blocker holds the household's row, so the accept blocks in its
    // membership insert - after the function has read the invitation and
    // decided, and with the invitation still open.
    await owner.query("BEGIN");
    await owner.query("SELECT id FROM households WHERE id = $1 FOR UPDATE", [HOUSEHOLD]);

    const first = startAccept(app[0], INVITEE, HOUSEHOLD);
    const second = startAccept(app[1], INVITEE, HOUSEHOLD);

    await waitForLock([backendId(app[0]), backendId(app[1])]);

    // Let both accepts through.
    await owner.query("ROLLBACK");

    const [one, two] = await Promise.all([first, second]);

    // One of them joined the household; the other found the invitation
    // already accepted and said so. Without the lock, both would have passed
    // the check and both would have reported success.
    const results = [one.household, two.household];
    expect(results.filter((household) => household === HOUSEHOLD)).toHaveLength(1);
    expect(results.filter((household) => household === null)).toHaveLength(1);

    // And the membership was written once.
    const { rows } = await owner.query(
      "SELECT count(*)::int AS count FROM household_members WHERE household_id = $1 AND user_id = $2",
      [HOUSEHOLD, INVITEE],
    );
    expect(rows[0].count).toBe(1);

    // The invitation carries the acceptance once.
    const { rows: invitation } = await owner.query(
      "SELECT accepted_at IS NOT NULL AS accepted FROM household_invitations WHERE id = $1",
      [INVITATION],
    );
    expect(invitation[0].accepted).toBe(true);

  });

  it("does not let a revocation overtake an accept in flight", async () => {
    // The same blocker: the accept waits in its membership insert, with the
    // invitation's row open.
    await owner.query("BEGIN");
    await owner.query("SELECT id FROM households WHERE id = $1 FOR UPDATE", [HOUSEHOLD]);

    const accept = startAccept(app[0], INVITEE, HOUSEHOLD);
    await waitForLock([backendId(app[0])]);

    // The revocation goes in while the accept is in flight. With the
    // invitation's row locked, it waits for the accept - and the statement
    // timeout is what says so, without waiting forever.
    let blocked = false;
    try {
      await beginAs(app[2], OWNER, HOUSEHOLD);
      await app[2].query("SET LOCAL statement_timeout = '2s'");
      await app[2].query(
        "UPDATE household_invitations SET revoked_at = now() WHERE id = $1",
        [INVITATION],
      );
      await app[2].query("COMMIT");
    } catch (error) {
      const code = (error as { code?: string }).code;
      // 57014 is query_canceled: the statement timed out waiting for the
      // accept's lock.
      blocked = code === "57014";
      await app[2].query("ROLLBACK").catch(() => undefined);
    }
    expect(blocked).toBe(true);

    // Let the accept through and finish.
    await owner.query("ROLLBACK");
    await accept;

    // The invitation was accepted and not revoked: the revocation could not
    // get in while the accept held the row. Without the lock the revocation
    // would have committed here, and the accept would have written over it.
    const { rows } = await owner.query(
      "SELECT accepted_at IS NOT NULL AS accepted, revoked_at IS NULL AS not_revoked FROM household_invitations WHERE id = $1",
      [INVITATION],
    );
    expect(rows[0].accepted).toBe(true);
    expect(rows[0].not_revoked).toBe(true);

  });
});
