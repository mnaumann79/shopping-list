import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { appOrigin, PASSWORD } from "../support/helpers";

/**
 * Helpers for the AUTH-01…04 specs.
 *
 * The helpers that more than one suite needs live in `e2e/support/helpers.ts`;
 * the ones that only make sense for the auth specs stay here.
 */

/**
 * Registers a user and gives them a household, over the Better Auth API.
 *
 * The specs arrange their state this way and then drive the UI, so the thing
 * under test is the flow and not its setup.
 */
export async function registerUser(
  request: APIRequestContext,
  options: { email: string; password?: string; householdName?: string },
): Promise<void> {
  const password = options.password ?? PASSWORD;
  const origin = appOrigin();

  const signup = await request.post("/api/auth/sign-up/email", {
    data: { name: "Test User", email: options.email, password },
    headers: { Origin: origin },
  });
  const signupBody = await signup.text();
  expect(signup.ok(), `Could not register ${options.email}: ${signupBody}`).toBeTruthy();

  if (!options.householdName) return;

  const created = await request.post("/api/auth/organization/create", {
    data: { name: options.householdName, slug: options.email.split("@")[0] },
    headers: { Origin: origin },
  });
  const createdBody = await created.text();
  expect(created.ok(), `Could not create the household: ${createdBody}`).toBeTruthy();
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
 * needs to sign out registers its own user and copies that session into the
 * browser.
 */
export async function startOwnSession(
  page: Page,
  request: APIRequestContext,
  options: { email: string; householdName?: string },
): Promise<void> {
  await registerUser(request, options);
  const state = await request.storageState();
  await page.context().addCookies(state.cookies);
}
