import { expect as baseExpect, test, type Page } from "@playwright/test";
import fs from "fs";
import path from "path";

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

/**
 * The addresses this run created.
 *
 * The instance the suite runs against has to be as it was afterwards, and
 * the counting and the deleting are done with a connection this suite does
 * not have — the application's own role cannot read the users table. So the
 * run writes down every address it registered, and that record is what the
 * cleanup is done from.
 *
 * The file is in the test output directory, which Playwright empties before
 * a run, so it holds one run's addresses and not the sum of them.
 */
const CREATED_ADDRESSES = path.join(__dirname, "../../test-results/created-addresses.txt");

// An address can only be registered once, so every user gets its own.
export function uniqueEmail(prefix: string): string {
  const email = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  recordAddress(email);
  return email;
}

/** Writes an address the run registered into the run's record. */
export function recordAddress(email: string): void {
  fs.mkdirSync(path.dirname(CREATED_ADDRESSES), { recursive: true });
  fs.appendFileSync(CREATED_ADDRESSES, `${email}\n`);
}

/**
 * Fills a field, once the page has taken the form over.
 *
 * A field that is filled before React hydrates loses its value: the page
 * mounts, and the controlled input takes the value back from the server's
 * markup. The sign-up form then says "Name is required" and the sign-up
 * never goes out — and WebKit hydrates fast enough that the specs' first
 * fill landed inside that window every time: 40 of the 48 failures in the
 * four-worker run were this, in WebKit and on the phone profile.
 *
 * React marks the elements it has taken over, so the wait is for that mark.
 * The pages without a form of their own — the household settings page —
 * wait for a member row instead, which the application renders on the
 * client.
 */
export async function fillField(page: Page, label: string, value: string): Promise<void> {
  await page.waitForFunction(
    () => {
      const form = document.querySelector("form");
      return Boolean(form && Object.keys(form).some((key) => key.startsWith("__reactProps$")));
    },
    undefined,
    { timeout: 30_000 },
  );

  await page.getByLabel(label, { exact: true }).fill(value);
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
