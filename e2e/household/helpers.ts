import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { config as loadEnv } from "dotenv";
import path from "path";
import { Pool } from "pg";

// The Playwright config loads .env.test too; loading it here keeps this
// module self-contained, and dotenv never overrides a variable that is
// already set, so CI's explicit environment still wins.
loadEnv({ path: path.resolve(__dirname, "../../.env.test") });

export const PASSWORD = process.env.TEST_PASSWORD ?? "TestPassword123!";

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

// An address can only be registered once, so every spec signs up its own
// users with a unique address.
export function uniqueEmail(prefix: string) {
  return `${prefix}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}@example.com`;
}

/**
 * A browser context that is signed out. The shared storageState belongs to
 * the setup user, so every second identity in these specs needs its own
 * context.
 */
export async function newUserContext(
  browser: Browser,
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ baseURL: BASE_URL });
  return { context, page: await context.newPage() };
}

/**
 * Clicks a button and waits for the request its handler sends. A click
 * before React hydrates is swallowed, so the click is repeated when nothing
 * went out.
 */
export async function clickAndWaitForRequest(
  page: Page,
  buttonName: string,
  endpoint: string,
): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const sent = page
      .waitForRequest((request) => request.url().includes(endpoint), { timeout: 10_000 })
      .then(() => true, () => false);
    await page.getByRole("button", { name: buttonName }).click();
    if (await sent) return true;
  }
  return false;
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
  await clickAndWaitForRequest(page, "Sign up", "/api/auth/sign-up/email");
  await page.waitForURL(landsOn, { timeout: 60_000 });
}

/** The households the signed-in user belongs to. */
export async function listHouseholds(page: Page): Promise<Household[]> {
  const body = await page.evaluate(async (url) => {
    const response = await fetch(url);
    return await response.json();
  }, apiUrl("/api/auth/organization/list"));
  return body as Household[];
}

/** The members of the signed-in user's active household. */
export async function listMembers(page: Page): Promise<Member[]> {
  const body = await page.evaluate(async (url) => {
    const response = await fetch(url);
    return await response.json();
  }, apiUrl("/api/auth/organization/list-members"));
  return (body as { members: Member[] }).members;
}

/** Creates a join link through the app's own endpoint and returns its URL. */
export async function generateJoinLink(page: Page): Promise<string> {
  const body = await page.evaluate(async (url) => {
    const response = await fetch(url, { method: "POST" });
    return await response.json();
  }, apiUrl("/api/households/join-links"));
  return (body as { url: string }).url;
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
 * Sends an invitation from the household settings page and returns the
 * invitation row it produced.
 */
export async function inviteFromSettings(
  page: Page,
  email: string,
): Promise<Invitation> {
  await page.goto("/household/settings");
  await page.getByPlaceholder("name@example.com").fill(email);
  await clickAndWaitForRequest(page, "Send invite", "/api/households/invite");
  await expect(page.getByText(`Invitation sent to ${email}`)).toBeVisible();

  const rows = await queryRows<Invitation>(
    "select id, email, role, status, organization_id from invitation where email = $1 order by created_at desc limit 1",
    [email],
  );
  if (rows.length === 0) {
    throw new Error(`No invitation was created for ${email}`);
  }
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
