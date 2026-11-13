import { expect, type Browser, type Page } from "@playwright/test";
import { appOrigin, PASSWORD, submitForm } from "../support/helpers";

/**
 * Helpers for the AUTH-01…04 specs.
 *
 * The helpers that more than one suite needs live in `e2e/support/helpers.ts`;
 * the ones that only make sense for the auth specs stay here.
 */

/** The path the specs navigate by. */
export const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

/**
 * The GoTrue endpoint the browser client signs up against.
 *
 * The browser client talks to the auth server directly, so the request the
 * specs wait for does not go through the application.
 */
export const SIGN_UP_ENDPOINT = "/auth/v1/signup";

/** The GoTrue endpoint the browser client signs in against. */
export const SIGN_IN_ENDPOINT = "/auth/v1/token";

/**
 * The cookie the Supabase session lives in.
 *
 * `@supabase/ssr` names it after the project unless one is given, and the
 * application gives it one, so the name is the same in the browser and on the
 * server.
 */
export const SESSION_COOKIE = "sb-household-auth-token";

/**
 * A browser context that is signed out.
 *
 * `browser.newContext()` inherits the project's storageState — the setup
 * user's session — so the state has to be cleared explicitly.
 */
export async function newSignedOutContext(browser: Browser) {
  const context = await browser.newContext({
    baseURL: BASE_URL,
    storageState: { cookies: [], origins: [] },
  });

  return { context, page: await context.newPage() };
}

/**
 * Registers a user and gives them a household.
 *
 * The signup is driven through the real form, in a context of its own: the
 * session lives in a cookie the browser writes, and a context the spec throws
 * away leaves the spec's own browser signed out — which is what the sign-in
 * and sign-up specs need.
 *
 * The household is created through the application's own endpoint, so the
 * membership row is created the way the product creates it.
 */
export async function registerUser(
  browser: Browser,
  options: { email: string; householdName?: string },
): Promise<void> {
  const { context, page } = await newSignedOutContext(browser);

  try {
    await signUp(page, options.email);

    if (!options.householdName) return;

    const created = await page.request.post(`${BASE_URL.replace(/\/$/, "")}/api/households`, {
      data: { name: options.householdName },
      headers: { Origin: appOrigin() },
    });
    const createdBody = await created.text();
    expect(
      created.ok(),
      `Could not create the household: ${createdBody}`,
    ).toBeTruthy();
  } finally {
    await context.close();
  }
}

/** Signs a user up through the form and waits for the page the app sends them to. */
export async function signUp(page: Page, email: string): Promise<void> {
  await page.goto("/sign-up");
  await page.getByLabel("Name").fill("Test User");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);

  await submitForm(page, "Sign up", SIGN_UP_ENDPOINT);

  // Email confirmation is off, so the user is signed in and lands on
  // onboarding, which asks for a household.
  await page.waitForURL(/\/onboarding$/, { timeout: 60_000 });
}

// Collects the requests a page sends to one endpoint, so a spec can assert
// that a form did not submit at all.
export function trackRequests(page: Page, endpoint: string): string[] {
  const seen: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes(endpoint)) seen.push(request.url());
  });
  return seen;
}

/**
 * Opens the account menu and waits for its "Log out" item.
 *
 * The menu is a Base UI dropdown: it opens on pointerdown, and a click that
 * lands before React has hydrated the header is swallowed, so the menu never
 * opens. Click again when that happens.
 */
export async function openAccountMenu(page: Page): Promise<void> {
  const trigger = page.getByRole("button", { name: "Account menu" });
  const item = page.getByRole("menuitem", { name: /log out/i });

  await expect(async () => {
    if ((await trigger.getAttribute("aria-expanded")) !== "true") {
      await trigger.click();
    }
    await expect(item).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 15_000 });
}

/**
 * Gives the browser a session of its own, apart from the shared one.
 *
 * The shared storage state holds one session for every browser project.
 * Signing out revokes the session on the server, so a spec that signs out of
 * the shared session would take it away from every other spec. A spec that
 * needs to sign out signs its own user up in its own browser, which starts
 * signed out because the spec clears the shared state.
 */
export async function startOwnSession(
  page: Page,
  options: { email: string; householdName?: string },
): Promise<void> {
  await signUp(page, options.email);

  if (!options.householdName) return;

  const created = await page.request.post(`${BASE_URL.replace(/\/$/, "")}/api/households`, {
    data: { name: options.householdName },
    headers: { Origin: appOrigin() },
  });
  const createdBody = await created.text();
  expect(
    created.ok(),
    `Could not create the household: ${createdBody}`,
  ).toBeTruthy();
}
