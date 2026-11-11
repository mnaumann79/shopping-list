/**
 * v1.2 Manual Verifications — automated driver
 *
 * Self-contained: signs up a fresh user via better-auth's API, creates a
 * household, then runs the v1.2 manual verifications:
 *   1. AppHeader logout flow (3 cases)
 *   2. iPhone 13 viewport smoke test (add / check / organize)
 *
 * Runs against http://localhost:3000 (override with BASE_URL env var).
 *
 * Uses Playwright's request API so Set-Cookie headers from every response
 * are captured automatically — Node fetch loses the activeOrganizationId
 * update that better-auth returns on POST /api/auth/organization/create.
 */
import { chromium, devices } from 'playwright';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';
const PASSWORD = 'VerifyV12Pass!';
const results = [];

function record(name, outcome) {
  results.push({ name, ...outcome });
  const tag = outcome.passed ? 'PASS' : 'FAIL';
  console.log(`[${tag}] ${name}${outcome.detail ? ` — ${outcome.detail}` : ''}`);
}

async function buildStorageState() {
  const browser = await chromium.launch({ headless: true });
  const setupContext = await browser.newContext();
  const request = setupContext.request;

  const email = `verify-v12-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`.toLowerCase();
  const slug = `v12-${Date.now().toString(36)}`.toLowerCase();

  const signup = await request.post(`${BASE_URL}/api/auth/sign-up/email`, {
    headers: { Origin: BASE_URL, 'Content-Type': 'application/json' },
    data: { email, password: PASSWORD, name: 'Verify V1.2' },
  });
  if (!signup.ok()) throw new Error(`signup failed: ${signup.status()} ${await signup.text()}`);

  const orgCreate = await request.post(`${BASE_URL}/api/auth/organization/create`, {
    headers: { Origin: BASE_URL, 'Content-Type': 'application/json' },
    data: { name: `V1.2 Verify ${slug}`, slug },
  });
  if (!orgCreate.ok()) throw new Error(`org create failed: ${orgCreate.status()} ${await orgCreate.text()}`);
  const orgBody = await orgCreate.json();
  const organizationId = orgBody?.id ?? orgBody?.organization?.id;
  if (!organizationId) {
    throw new Error(`org create response missing id: ${JSON.stringify(orgBody)}`);
  }

  // better-auth doesn't auto-set activeOrganizationId via the create endpoint;
  // the UI flow does it through authClient.organization.setActive() — mirror that.
  const setActive = await request.post(`${BASE_URL}/api/auth/organization/set-active`, {
    headers: { Origin: BASE_URL, 'Content-Type': 'application/json' },
    data: { organizationId },
  });
  if (!setActive.ok()) {
    throw new Error(`set-active failed: ${setActive.status()} ${await setActive.text()}`);
  }

  // Sanity check: session should now report activeOrganizationId.
  const getSession = await request.get(`${BASE_URL}/api/auth/get-session`);
  const sessionBody = await getSession.json();
  if (!sessionBody?.session?.activeOrganizationId) {
    throw new Error(`session has no activeOrganizationId after set-active: ${JSON.stringify(sessionBody)}`);
  }

  const storageState = await setupContext.storageState();
  await setupContext.close();
  await browser.close();

  return storageState;
}

async function testLogoutFlow(context) {
  const page = await context.newPage();
  try {
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'domcontentloaded' });
    if (!/\/dashboard$/.test(page.url())) {
      return { passed: false, detail: `precondition: expected /dashboard, got ${page.url()}` };
    }
    await page.getByRole('button', { name: 'Account menu' }).click();
    const logoutItem = page.getByRole('menuitem', { name: /log out/i });
    await logoutItem.waitFor({ state: 'visible', timeout: 5_000 });
    await logoutItem.click();
    await page.waitForURL(/\/sign-in(\?|$)/, { timeout: 10_000 });
    return { passed: /\/sign-in(\?|$)/.test(page.url()), detail: `landed on ${page.url()}` };
  } finally {
    await page.close();
  }
}

async function testPostLogoutGuard(context) {
  const page = await context.newPage();
  try {
    // Land on /dashboard first (should succeed — we have a fresh context with cookies).
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'domcontentloaded' });
    if (!/\/dashboard$/.test(page.url())) {
      return { passed: false, detail: `precondition: expected /dashboard, got ${page.url()}` };
    }

    // Log out (clears cookies + invalidates session server-side).
    await page.getByRole('button', { name: 'Account menu' }).click();
    await page.getByRole('menuitem', { name: /log out/i }).click();
    await page.waitForURL(/\/sign-in(\?|$)/, { timeout: 10_000 });

    // Now try /dashboard — middleware should bounce to /sign-in.
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {});
    const url = page.url();
    return { passed: /\/sign-in(\?|$)/.test(url), detail: url };
  } finally {
    await page.close();
  }
}

async function testSessionCleared(context) {
  const page = await context.newPage();
  try {
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'domcontentloaded' });
    if (!/\/dashboard$/.test(page.url())) {
      return { passed: false, detail: `not authenticated: ${page.url()}` };
    }
    const before = (await context.cookies()).filter((c) => /session|token|auth/i.test(c.name)).length;
    if (before === 0) {
      return { passed: false, detail: 'no session cookies detected before logout' };
    }
    await page.getByRole('button', { name: 'Account menu' }).click();
    await page.getByRole('menuitem', { name: /log out/i }).click();
    await page.waitForURL(/\/sign-in(\?|$)/, { timeout: 10_000 });
    const after = (await context.cookies()).filter((c) => /session|token|auth/i.test(c.name)).length;
    return {
      passed: after === 0,
      detail: `session cookies before=${before} after=${after}`,
    };
  } finally {
    await page.close();
  }
}

async function testShoppingTripIphone(context) {
  const page = await context.newPage();
  const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`.toLowerCase();
  try {
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'domcontentloaded' });
    if (!/\/dashboard$/.test(page.url())) {
      return { passed: false, detail: `precondition: expected /dashboard, got ${page.url()}` };
    }

    const slug = `v12-iphone-${uniqueSuffix}`;
    const createOrg = await page.evaluate(async ({ baseUrl, slug }) => {
      const r = await fetch(`${baseUrl}/api/auth/organization/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: `iPhone ${slug}`, slug }),
      });
      return { ok: r.ok, status: r.status };
    }, { baseUrl: BASE_URL, slug });
    if (!createOrg.ok) {
      return { passed: false, detail: `create household failed: ${createOrg.status}` };
    }

    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'domcontentloaded' });
    if (!/\/dashboard$/.test(page.url())) {
      return { passed: false, detail: `after org create: ${page.url()}` };
    }

    const categories = await page.evaluate(async (baseUrl) => {
      const r = await fetch(`${baseUrl}/api/categories`);
      return r.json();
    }, BASE_URL);
    const dairy = categories.find((c) => /dairy/i.test(c.name));
    const pantry = categories.find((c) => /pantry/i.test(c.name));

    await page.evaluate(async ({ baseUrl, dairyId, pantryId }) => {
      await fetch(`${baseUrl}/api/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'iPhone Milk', categoryId: dairyId, quantity: '1 gal' }),
      });
      await fetch(`${baseUrl}/api/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'iPhone Bread', categoryId: pantryId, quantity: '1 loaf' }),
      });
    }, { baseUrl: BASE_URL, dairyId: dairy?.id, pantryId: pantry?.id });

    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'domcontentloaded' });

    // Wait for the list to render before interacting.
    await page.getByRole('button', { name: 'iPhone Milk', exact: true }).waitFor({ state: 'visible', timeout: 10_000 });

    const milkRow = page.getByRole('button', { name: 'iPhone Milk', exact: true });
    await milkRow.click();

    // Confirm the Completed heading shows the new count. The "Completed (N)"
    // element is an <h2>, not a button — the existing test in
    // dashboard-shopping-trip.spec.ts uses getByRole('button') which doesn't
    // match and silently breaks. Use getByRole('heading') instead.
    try {
      await page.getByRole('heading', { name: /Completed \(1\)/i }).waitFor({ state: 'visible', timeout: 5_000 });
    } catch {
      await page.screenshot({ path: `verify-v1.2-iphone-failure-${Date.now()}.png`, fullPage: true });
      const checked = await page.locator('button[aria-label="iPhone Milk"]').getAttribute('data-checked');
      return { passed: false, detail: `Completed (1) heading never appeared; data-checked on milk row = ${checked}` };
    }

    await page.getByRole('button', { name: /alphabetical/i }).scrollIntoViewIfNeeded();
    await page.getByRole('button', { name: /alphabetical/i }).click();
    await page.getByRole('button', { name: 'iPhone Bread', exact: true }).waitFor({ state: 'visible', timeout: 10_000 });

    return { passed: true, detail: 'add + check + organize all worked on iPhone 13 viewport (390×844)' };
  } finally {
    await page.close();
  }
}

(async () => {
  console.log(`Verifying against ${BASE_URL}\n`);

  const storageState = await buildStorageState();
  const cookieNames = (storageState.cookies ?? []).map((c) => c.name).join(', ');
  console.log(`Signed up fresh user; cookies: ${cookieNames}\n`);

  const browser = await chromium.launch({ headless: true });

  try {
    for (const [name, fn] of [
      ['AppHeader logout redirects to /sign-in', testLogoutFlow],
      ['Post-logout, /dashboard bounces to /sign-in', testPostLogoutGuard],
      ['AppHeader logout clears session cookies', testSessionCleared],
    ]) {
      const ctx = await browser.newContext({ storageState });
      try {
        record(name, await fn(ctx));
      } finally {
        await ctx.close();
      }
    }

    const iphoneCtx = await browser.newContext({
      ...devices['iPhone 13'],
      storageState,
    });
    try {
      record('iPhone 13 viewport: add / check / organize', await testShoppingTripIphone(iphoneCtx));
    } finally {
      await iphoneCtx.close();
    }
  } finally {
    await browser.close();
  }

  const failed = results.filter((r) => !r.passed).length;
  console.log(`\n${results.length - failed}/${results.length} passed.`);
  if (failed > 0) process.exit(1);
})();
