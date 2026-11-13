/**
 * PERF-07: Lighthouse on the authenticated dashboard.
 *
 * Runs a Lighthouse audit against http://localhost:3000/dashboard with the
 * session cookies pre-set in the Chrome instance, so the middleware lets the
 * request through to the actual dashboard render.
 *
 * The setup is the product's own: a Supabase Auth sign-up, a household
 * created through the application's own route, and three items in it. That
 * is what Better Auth's sign-up, organization and set-active used to stand
 * for, and the replacement is not a likeness - it is the same journey, one
 * household at a time, with the active household carried by the
 * `sb-household` cookie.
 *
 * The measurement is unchanged: Lighthouse on the authenticated dashboard,
 * the same budgets, and the same numbers read out of the report.
 */
import lighthouse from 'lighthouse';
import { launch } from 'chrome-launcher';
import CDP from 'chrome-remote-interface';
import { writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { AUTH_COOKIE_NAME } from '../src/lib/supabase/config.ts';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';
const DASHBOARD_URL = `${BASE_URL}/dashboard`;

/**
 * The Supabase project the application authenticates against.
 *
 * The same two values the browser client uses, so the session this script
 * signs up with is the session the application will verify.
 */
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    'NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set. ' +
      'They name the Supabase project the application authenticates against.',
  );
}

const PERF_BUDGETS = {
  'largest-contentful-paint': 2500,    // ms, LCP < 2.5s
  'cumulative-layout-shift': 0.1,      // CLS < 0.1
  'first-contentful-paint': 2500,
  'total-blocking-time': 300,
  'speed-index': 3000,
};

(async () => {
  console.log(`Lighthouse on ${DASHBOARD_URL}\n`);

  // Step 1: Auth setup via Playwright. Playwright captures cookies from all
  // API responses correctly (including the one the household creation sets).
  // Node fetch loses that update because Set-Cookie headers from
  // non-initial responses aren't always carried forward.
  console.log('Setting up authenticated session via Playwright...');
  const setupBrowser = await chromium.launch({ headless: true });
  const setupContext = await setupBrowser.newContext();
  const request = setupContext.request;

  const email = `lighthouse-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`.toLowerCase();
  const slug = `lh-${Date.now().toString(36)}`.toLowerCase();

  // The sign-up goes to the auth server, the same way the browser's sign-up
  // form does it. The response is a session: the access token is what the
  // application reads, and the refresh token is what lets the browser renew
  // it.
  const signup = await request.post(`${SUPABASE_URL}/auth/v1/signup`, {
    headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    data: { email, password: 'LighthousePass!' },
  });
  if (!signup.ok()) {
    throw new Error(`signup failed: ${signup.status()} ${await signup.text()}`);
  }
  const session = await signup.json();
  if (!session?.access_token) {
    throw new Error(`signup returned no session: ${JSON.stringify(session)}`);
  }

  // The session cookie, in the shape @supabase/ssr writes it and the
  // application reads it (src/lib/supabase/server.ts): the prefix, then the
  // session base64url-encoded.
  await setupContext.addCookies([
    {
      name: AUTH_COOKIE_NAME,
      value:
        'base64-' +
        Buffer.from(
          JSON.stringify({
            access_token: session.access_token,
            token_type: session.token_type ?? 'bearer',
            expires_in: session.expires_in,
            expires_at: session.expires_at,
            refresh_token: session.refresh_token,
            user: session.user,
          }),
        ).toString('base64url'),
      url: BASE_URL,
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);

  // The household, through the application's own route: it creates the
  // household, makes the caller its owner, and leaves the household active
  // in the `sb-household` cookie - the one thing Better Auth's
  // `activeOrganizationId` used to do.
  const household = await request.post(`${BASE_URL}/api/households`, {
    headers: { Origin: BASE_URL, 'Content-Type': 'application/json' },
    data: { name: `LH ${slug}` },
  });
  if (!household.ok()) {
    throw new Error(
      `household create failed: ${household.status()} ${await household.text()}`,
    );
  }
  const { householdId } = await household.json();

  // Sanity check: the application must see the session and the household.
  const householdList = await request.get(`${BASE_URL}/api/households`);
  if (!householdList.ok()) {
    throw new Error(
      `household list failed: ${householdList.status()} ${await householdList.text()}`,
    );
  }
  const households = await householdList.json();
  if (!Array.isArray(households) || households.length === 0) {
    throw new Error(`the application sees no household: ${JSON.stringify(households)}`);
  }

  // Add 3 items so the dashboard has actual content to render (LCP needs a
  // non-empty list to be a meaningful measurement — otherwise the "your list
  // is empty" message becomes the LCP and we measure a synthetic edge case).
  for (const [name, qty, catHint] of [
    ['Milk LH', '1 gal', /dairy/i],
    ['Bread LH', '1 loaf', /pantry/i],
    ['Apples LH', '6', /produce/i],
  ]) {
    const cats = await request.get(`${BASE_URL}/api/categories`).then((r) => r.json());
    const cat = cats.find((c) => catHint.test(c.name));
    await request.post(`${BASE_URL}/api/items`, {
      headers: { Origin: BASE_URL, 'Content-Type': 'application/json' },
      data: { name, quantity: qty, categoryId: cat?.id },
    });
  }

  // Capture the final cookies from Playwright's context (these include the
  // active-household cookie the household creation set).
  const playwrightCookies = await setupContext.cookies();
  console.log(
    `Auth setup complete; household ${householdId}; cookies: ${playwrightCookies
      .map((c) => c.name)
      .join(', ')}`,
  );
  await setupContext.close();
  await setupBrowser.close();

  // Step 2: Launch a clean Chrome for Lighthouse.
  const chrome = await launch({
    chromeFlags: ['--headless=new', '--no-sandbox'],
    chromePath: undefined,
  });

  try {
    const cdpVersion = await fetch(`http://localhost:${chrome.port}/json/version`).then((r) => r.json());
    console.log(`Chrome CDP ready (browser: ${cdpVersion.Browser})\n`);

    // Inject the captured Playwright cookies into Chrome via CDP.
    const client = await CDP({ port: chrome.port });
    const { Network } = client;
    await Network.enable();
    for (const c of playwrightCookies) {
      await Network.setCookie({
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path,
        expires: c.expires > 0 ? c.expires : -1,
        httpOnly: c.httpOnly,
        secure: c.secure,
        sameSite: c.sameSite === 'None' ? 'None' : (c.sameSite === 'Strict' ? 'Strict' : 'Lax'),
      });
    }
    const stored = await Network.getCookies({ urls: [BASE_URL] });
    console.log(`Cookies injected into Chrome: ${stored.cookies.map((c) => c.name).join(', ')}\n`);
    await client.close();

    const result = await lighthouse(DASHBOARD_URL, {
      port: chrome.port,
      output: 'json',
      logLevel: 'error',
      onlyCategories: ['performance'],
      screenEmulation: {
        mobile: true,
        width: 390,
        height: 844,
        deviceScaleFactor: 3,
        disabled: false,
      },
      formFactor: 'mobile',
      throttlingMethod: 'simulate',
      throttling: {
        rttMs: 150,
        throughputKbps: 1638.4,
        requestLatencyMs: 0,
        downloadThroughputKbps: 0,
        uploadThroughputKbps: 0,
        cpuSlowdownMultiplier: 4,
      },
    });

    if (!result) throw new Error('lighthouse returned null');
    const { lhr } = result;

    // Save full report for offline analysis.
    const reportPath = `./lighthouse-report-${Date.now()}.json`;
    writeFileSync(reportPath, JSON.stringify(lhr, null, 2));
    console.log(`Full report saved to ${reportPath}\n`);

    const audits = lhr.audits ?? {};

    const metrics = {
      'largest-contentful-paint': audits['largest-contentful-paint']?.numericValue,
      'cumulative-layout-shift': audits['cumulative-layout-shift']?.numericValue,
      'first-contentful-paint': audits['first-contentful-paint']?.numericValue,
      'total-blocking-time': audits['total-blocking-time']?.numericValue,
      'speed-index': audits['speed-index']?.numericValue,
      'interactive': audits['interactive']?.numericValue,
    };

    console.log('Core Web Vitals (mobile, simulated 4G):');
    for (const [name, value] of Object.entries(metrics)) {
      if (typeof value !== 'number') {
        console.log(`  ${name}: (unavailable)`);
        continue;
      }
      const budget = PERF_BUDGETS[name];
      const ok = budget === undefined ? null : (name === 'cumulative-layout-shift' ? value <= budget : value <= budget);
      const marker = ok === null ? '·' : ok ? '✓' : '✗';
      console.log(`  ${marker} ${name}: ${Math.round(value * (name === 'cumulative-layout-shift' ? 1000 : 1))}${name === 'cumulative-layout-shift' ? ' (×1000)' : 'ms'} (budget: ${budget}${name === 'cumulative-layout-shift' ? '' : 'ms'})`);
    }

    const perf = lhr.categories?.performance?.score;
    console.log(`\nPerformance score: ${perf !== undefined ? Math.round(perf * 100) : '?'}/100`);

    // PERF-07 acceptance: LCP < 2.5s, CLS < 0.1
    const lcp = metrics['largest-contentful-paint'];
    const cls = metrics['cumulative-layout-shift'];

    const failures = [];
    if (typeof lcp === 'number' && lcp > PERF_BUDGETS['largest-contentful-paint']) failures.push(`LCP ${lcp.toFixed(0)}ms exceeds budget ${PERF_BUDGETS['largest-contentful-paint']}ms`);
    if (typeof cls === 'number' && cls > PERF_BUDGETS['cumulative-layout-shift']) failures.push(`CLS ${cls.toFixed(3)} exceeds budget ${PERF_BUDGETS['cumulative-layout-shift']}`);

    if (failures.length > 0) {
      console.log('\nVERIFICATION FAILED:');
      failures.forEach((f) => console.log(`  - ${f}`));
      process.exit(1);
    }
    console.log('\nPERF-07: PASSED (LCP and CLS within budget)');
  } finally {
    await chrome.kill();
  }
})();
