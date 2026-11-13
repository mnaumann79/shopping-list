import { expect as baseExpect, test, type Page } from "@playwright/test";

/**
 * Helpers that more than one suite needs.
 *
 * They live in `e2e/support/` so there is one copy of each: the auth specs
 * and the household specs used to keep their own, and two copies drift.
 */

// The specs run against a dev server that compiles a page the first time it
// is asked for it, which regularly takes longer than the default 5s.
export const expect = baseExpect.configure({ timeout: 15_000 });

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

// A click before React hydrates is swallowed, so wait for the request the
// handler sends and click again when nothing went out.
export async function submitForm(page: Page, buttonName: string, endpoint: string): Promise<void> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const sent = page
      .waitForRequest((request) => request.url().includes(endpoint), { timeout: 15_000 })
      .then(() => true, () => false);
    await page.getByRole("button", { name: buttonName }).click();
    if (await sent) return;
  }
  throw new Error(`The "${buttonName}" form sent no request to ${endpoint}`);
}
