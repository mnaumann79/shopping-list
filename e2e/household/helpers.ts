import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { config as loadEnv } from "dotenv";
import path from "path";
import { Pool } from "pg";
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

export type Household = { id: string; name: string };

export type Member = {
  id: string;
  userId: string;
  role: string;
  user: { id: string; name: string; email: string };
};

export type Invitation = {
  id: string;
  email: string;
  role: string;
  status: string;
  organization_id: string;
};

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
  await submitForm(page, "Sign up", "/api/auth/sign-up/email");
  await page.waitForURL(landsOn, { timeout: 60_000 });
}

/**
 * The households the signed-in user belongs to.
 *
 * page.request carries the context's cookies, so the call is authenticated
 * even before the page has navigated to the app.
 */
export async function listHouseholds(page: Page): Promise<Household[]> {
  const response = await page.request.get(apiUrl("/api/auth/organization/list"));
  if (!response.ok()) {
    throw new Error(`GET organization/list failed with status ${response.status()}`);
  }
  return (await response.json()) as Household[];
}

/** The members of the signed-in user's active household. */
export async function listMembers(page: Page): Promise<Member[]> {
  const response = await page.request.get(apiUrl("/api/auth/organization/list-members"));
  if (!response.ok()) {
    throw new Error(`GET organization/list-members failed with status ${response.status()}`);
  }
  const body = (await response.json()) as { members: Member[] };
  return body.members;
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
 * BETTER_AUTH_URL, which is not necessarily the URL Playwright is driving,
 * so the specs navigate by path instead of by absolute URL.
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
  const invitation = await waitForInvitation(email);
  await expect(page.getByText(`Invitation sent to ${email}`)).toBeVisible({
    timeout: INVITE_TIMEOUT,
  });
  return invitation;
}

/** The invitation row for an address, once it has been written. */
async function waitForInvitation(email: string): Promise<Invitation> {
  let rows: Invitation[] = [];
  await expect
    .poll(
      async () => {
        rows = await queryRows<Invitation>(
          "select id, email, role, status, organization_id from invitation where email = $1 order by created_at desc limit 1",
          [email],
        );
        return rows.length;
      },
      { timeout: INVITE_TIMEOUT, message: `No invitation was created for ${email}` },
    )
    .toBeGreaterThan(0);
  return rows[0];
}

let pool: Pool | undefined;

function getPool(): Pool {
  pool ??= new Pool({ connectionString: process.env.DATABASE_URL });
  return pool;
}

/** Runs a query against the test database. */
export async function queryRows<T>(sql: string, values: unknown[] = []): Promise<T[]> {
  const result = await getPool().query(sql, values);
  return result.rows as T[];
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
