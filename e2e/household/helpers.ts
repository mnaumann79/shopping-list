import { expect, type Browser, type BrowserContext, type Cookie, type Page } from "@playwright/test";
import { config as loadEnv } from "dotenv";
import path from "path";
import { Pool } from "pg";
import { SESSION_COOKIE, SIGN_UP_ENDPOINT } from "../auth/helpers";
import { PASSWORD, submitForm, uniqueEmail } from "../support/helpers";

// PASSWORD, uniqueEmail and submitForm are shared with the auth specs, so
// they live in e2e/support/helpers.ts. They are re-exported here so the
// household specs keep a single import path.
export { PASSWORD, submitForm, uniqueEmail };

// The Playwright config loads .env.test too; loading it here keeps this
// module self-contained, and dotenv never overrides a variable that is
// already set, so CI's explicit environment still wins.
loadEnv({ path: path.resolve(__dirname, "../../.env.test") });

// playwright.config.ts falls back to the same URL when PLAYWRIGHT_BASE_URL is
// unset. browser.newContext() does not inherit the config's baseURL, so the
// helper has to repeat it.
export const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

/**
 * An absolute URL for an app endpoint. A page that has not navigated yet is
 * still on about:blank, so a relative URL cannot be resolved inside
 * page.evaluate().
 */
function apiUrl(endpoint: string): string {
  return `${BASE_URL.replace(/\/$/, "")}${endpoint}`;
}

export type Household = { id: string; name: string; role?: string };

/**
 * A member of the household.
 *
 * `id` is the user id: the application reads it from `household_members` and
 * returns it beside the display fields, and it is the id a scoped read needs.
 */
export type Member = {
  id: string;
  name: string | null;
  email: string | null;
  role: string;
};

/**
 * An invitation the application lists.
 *
 * The application's endpoint lists the live invitations of the active
 * household and nothing else — an invitation that is accepted, revoked or
 * expired is not in the list. Being in the list is what "pending" and
 * "belongs to this household" mean here.
 */
export type Invitation = {
  id: string;
  email: string;
  role: string;
  expiresAt: string;
  revokedAt: string | null;
};

/**
 * The scope a read of the application's own tables runs under.
 *
 * The policies are written against `auth.uid()` and `app.current_household`,
 * so a read that sets neither sees no rows at all — which is not the same as
 * seeing no rows. These are the two settings `src/db/scope.ts` sets, in the
 * same transaction-local way, and the integration suite sets them the same
 * way (`tests/integration/`).
 */
export type Scope = { userId: string; householdId: string };

/**
 * The cookie the application writes the active household's id into.
 *
 * The application's own name for it is `sb-household`; the value is the
 * household id and nothing else.
 */
const HOUSEHOLD_COOKIE = "sb-household";

/**
 * A browser context that is signed out. The shared storageState belongs to
 * the setup user, so every second identity in these specs needs its own
 * context.
 */
export async function newUserContext(
  browser: Browser,
): Promise<{ context: BrowserContext; page: Page }> {
  // browser.newContext() inherits the project's storageState - the setup
  // user's session - so the state has to be cleared explicitly.
  const context = await browser.newContext({
    baseURL: BASE_URL,
    storageState: { cookies: [], origins: [] },
  });
  return { context, page: await context.newPage() };
}

/** Signs a new user up and waits for the page the app sends them to. */
export async function signUp(
  page: Page,
  user: { name: string; email: string },
  landsOn: RegExp,
): Promise<void> {
  await page.goto("/sign-up");
  await page.getByLabel("Name", { exact: true }).fill(user.name);
  await page.getByLabel("Email", { exact: true }).fill(user.email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await submitForm(page, "Sign up", SIGN_UP_ENDPOINT);
  await page.waitForURL(landsOn, { timeout: 60_000 });
}

/**
 * The households the signed-in user belongs to.
 *
 * page.request carries the context's cookies, so the call is authenticated
 * even before the page has navigated to the app.
 */
export async function listHouseholds(page: Page): Promise<Household[]> {
  const response = await page.request.get(apiUrl("/api/households"));
  if (!response.ok()) {
    throw new Error(`GET households failed with status ${response.status()}`);
  }
  return (await response.json()) as Household[];
}

/** The members of the signed-in user's active household. */
export async function listMembers(page: Page): Promise<Member[]> {
  const response = await page.request.get(apiUrl("/api/households/members"));
  if (!response.ok()) {
    throw new Error(`GET households/members failed with status ${response.status()}`);
  }
  return (await response.json()) as Member[];
}

/**
 * The signed-in user's id, and the household they are looking at.
 *
 * The user id is the one the session carries: the browser's session cookie
 * holds the session, and the session's access token is a JWT whose `sub` is
 * the id GoTrue issued. The household is the active one — the cookie the
 * application writes, which names a household id and nothing else.
 */
export async function scopeFor(page: Page): Promise<Scope> {
  const cookies = await page.context().cookies();

  const householdId = cookies.find((cookie) => cookie.name === HOUSEHOLD_COOKIE)?.value;
  if (!householdId) {
    throw new Error("The browser has no active household, so a scoped read has no scope.");
  }

  const userId = userIdFromSession(cookies);
  if (!userId) {
    throw new Error("The browser has no session, so a scoped read has no caller.");
  }

  return { userId, householdId };
}

/**
 * The user id the browser's session cookie carries.
 *
 * `@supabase/ssr` writes the session as base64url behind a `base64-` prefix,
 * and the session's access token is a JWT whose `sub` is the id GoTrue issued.
 */
function userIdFromSession(cookies: Cookie[]): string | null {
  const value = cookies.find((cookie) => cookie.name === SESSION_COOKIE)?.value;
  if (!value) return null;

  const session = JSON.parse(
    Buffer.from(value.replace(/^base64-/, ""), "base64url").toString("utf8"),
  ) as { access_token?: string };

  if (!session.access_token) return null;

  const payload = JSON.parse(
    Buffer.from(session.access_token.split(".")[1], "base64url").toString("utf8"),
  ) as { sub?: string };

  return typeof payload.sub === "string" ? payload.sub : null;
}

/**
 * Waits until the settings page can be driven.
 *
 * The page loads the session and the household's members first, and only
 * then renders the member list and the admin-only cards (the invite form,
 * the join link button). A member row is therefore the point where the app
 * has taken the page over.
 */
export async function waitForSettingsReady(page: Page): Promise<void> {
  const membersCard = page
    .locator('[data-slot="card"]')
    .filter({ has: page.locator('[data-slot="card-title"]', { hasText: "Members" }) });
  await expect(membersCard.locator("li").first()).toBeVisible({ timeout: 60_000 });
}

/** Creates a join link through the app's own endpoint and returns its URL. */
export async function generateJoinLink(page: Page): Promise<string> {
  const response = await page.request.post(apiUrl("/api/households/join-links"));
  if (!response.ok()) {
    throw new Error(`POST households/join-links failed with status ${response.status()}`);
  }
  const body = (await response.json()) as { url: string };
  return body.url;
}

/**
 * The path and query of a join link URL. The app builds the link from
 * NEXT_PUBLIC_APP_URL, which is not necessarily the URL Playwright is
 * driving, so the specs navigate by path instead of by absolute URL.
 */
export function joinPath(url: string): string {
  const parsed = new URL(url);
  return `${parsed.pathname}${parsed.search}`;
}

export function joinToken(url: string): string {
  return new URL(url).searchParams.get("token") ?? "";
}

/**
 * The invite flow answers only after the mail call: better-auth sends the
 * invitation email before the endpoint returns, so a slow or unreachable
 * Resend delays the app's response and with it the toast.
 */
export const INVITE_TIMEOUT = 30_000;

/**
 * Sends an invitation from the household settings page and returns the
 * invitation row it produced.
 */
export async function inviteFromSettings(
  page: Page,
  email: string,
): Promise<Invitation> {
  await page.goto("/household/settings");
  await waitForSettingsReady(page);
  await page.getByPlaceholder("name@example.com").fill(email);
  await submitForm(page, "Send invite", "/api/households/invite");

  // The invitation is written before the mail is sent, so the database does
  // not wait for Resend.
  const invitation = await waitForInvitation(page, email);
  await expect(page.getByText(`Invitation sent to ${email}`)).toBeVisible({
    timeout: INVITE_TIMEOUT,
  });
  return invitation;
}

/**
 * The invitation for an address, once the application has written it.
 *
 * The read goes through the application's own endpoint: it lists the live
 * invitations of the active household, and it does that with the claims and
 * the scope the application sets. The spec is about what the application
 * did, and reading its way to the answer is what keeps it honest.
 */
async function waitForInvitation(page: Page, email: string): Promise<Invitation> {
  let found: Invitation[] = [];
  await expect
    .poll(
      async () => {
        const response = await page.request.get(apiUrl("/api/households/invitations"));
        if (!response.ok()) {
          throw new Error(
            `GET households/invitations failed with status ${response.status()}`,
          );
        }
        const invitations = (await response.json()) as Invitation[];
        found = invitations.filter((invitation) => invitation.email === email);
        return found.length;
      },
      { timeout: INVITE_TIMEOUT, message: `No invitation was created for ${email}` },
    )
    .toBeGreaterThan(0);
  return found[0];
}

let pool: Pool | undefined;

function getPool(): Pool {
  pool ??= new Pool({ connectionString: process.env.DATABASE_URL });
  return pool;
}

/**
 * Runs a query against the application's own tables, in the scope the
 * application uses.
 *
 * The claims and the scope are set inside one transaction, transaction-local,
 * the way `src/db/scope.ts` sets them and the way the integration suite does
 * it. A read that finds no row then means the row is not there — not that
 * the read was blind, which is what a read without them means.
 *
 * This is for the two things the application does not expose: the expired
 * join link a spec inserts, and the token that has to be gone afterwards.
 * Everything else goes through the application's API.
 */
export async function queryRows<T>(
  sql: string,
  values: unknown[],
  scope: Scope,
): Promise<T[]> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: scope.userId, role: "authenticated" }),
    ]);
    await client.query("select set_config('app.current_household', $1, true)", [
      scope.householdId,
    ]);
    const result = await client.query(sql, values);
    await client.query("COMMIT");
    return result.rows as T[];
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Closes the pool.
 *
 * The pool holds a Postgres socket, so without this the worker keeps one
 * open for the whole run. The pool is dropped instead of ended in place, so
 * a spec that runs after this one opens a fresh pool rather than an ended
 * one.
 *
 * The specs that use the pool register the teardown themselves. A
 * `test.afterAll` in this module would bind to the first spec file that
 * imports it and to no other: Node caches the module for the whole worker,
 * and the hook lands on whichever file happened to be loaded first.
 */
export async function closePool(): Promise<void> {
  const open = pool;
  pool = undefined;
  await open?.end();
}
