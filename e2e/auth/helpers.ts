import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

/**
 * Helpers for the AUTH-01…04 specs.
 *
 * They live in this directory on purpose: `e2e/support/` is reserved for the
 * household half of task 0.7, so the two halves cannot collide.
 */

export const PASSWORD = "TestPassword123!";

// An address can only be registered once, so every user gets its own.
export function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}

// The origin the app runs on. Better Auth refuses API calls that carry a
// session cookie without an Origin header, and the request fixture always
// carries one.
export function appOrigin(): string {
  return new URL(test.info().project.use.baseURL ?? "http://localhost:3000").origin;
}

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

// A click before React hydrates is swallowed, so wait for the request the
// handler sends and click again when nothing went out.
export async function submitForm(page: Page, buttonName: string, endpoint: string): Promise<void> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const sent = page
      .waitForRequest((request) => request.url().includes(endpoint), { timeout: 5_000 })
      .then(() => true, () => false);
    await page.getByRole("button", { name: buttonName }).click();
    if (await sent) return;
  }
  throw new Error(`The "${buttonName}" form sent no request to ${endpoint}`);
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
