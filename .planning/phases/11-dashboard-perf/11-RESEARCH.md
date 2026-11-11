# Phase 11: Dashboard Performance - Research

**Researched:** 2026-07-10
**Domain:** Next.js App Router, React 19, Web Vitals, better-auth cookie handling
**Confidence:** HIGH (Lighthouse data + vendor docs)

<findings>
## Findings

### LCP element is "ORGANIZE TRIP" label, not items

Lighthouse's `lcp-breakdown-insight` audit identified the LCP element on `/dashboard`:
- nodeLabel: `ORGANIZE TRIP`
- snippet: `<p class="text-muted-foreground text-xs font-medium tracking-[0.2em] uppercase">`
- The `tracking-[0.2em]` letter-spacing widens the boundingRect, making this small uppercase label the LCP

LCP breakdown:
- Time to first byte: 20ms (excellent)
- Element render delay: 790ms

The label paints before React hydration completes and before the actual item rows are measured as larger. Removing it from initial HTML should shift LCP to either an item row (server-rendered, fast) or QuickAddBar.

### TBT hot spots

Total main thread work during page load:
- 944ms scriptEvaluation
- 289ms other
- 209ms styleLayout
- 141ms scriptParseCompile

Long tasks (>50ms):
- chunk `3794-0147154ca0a4b9c9.js`: 294ms — Next.js framework root main chunk
- chunk `2666-7cab2b21b7d24359.js`: 93ms
- chunk `app/(app)/dashboard/page-...js`: 74ms
- chunk `4bd1b696-c2f6e0877b6c10aa.js`: 66ms — Next.js framework root main chunk

The two framework chunks (3794 + 4bd1b696) account for ~360ms of the 944ms scriptEvaluation. These are loaded on every Next.js page — they're not specific to the dashboard. Optimizing them is a Next.js-internals question, not an app-code question.

### Why 10-03's sign-in optimization didn't reach the dashboard

10-03 lazy-loaded `DropdownMenu` (AppHeader) and `sonner` toast library, dropping sign-in TBT from 1930ms → 170ms. These are interactive-only elements that don't need to be in the initial bundle.

The dashboard's `ShoppingList.tsx` is still loaded synchronously, including the entire fixed "Organize trip" bottom bar JSX. Even though it's small text, the JS execution to render it competes with the React hydration of the actual item list.

### Auth injection for Lighthouse (gotcha)

- Lighthouse's `extraHeaders` config does NOT carry HTTPOnly cookies through to the navigation. The cookies get stripped or invalidated somewhere in the lighthouse flow.
- Cookies must be set via CDP `Network.setCookie` on the Chrome instance BEFORE Lighthouse runs.
- Playwright's request API captures Set-Cookie correctly across multiple responses (sign-up → org-create → set-active all return new cookies). Node fetch does NOT — only the initial response's Set-Cookie is captured.
- Working pattern: Playwright for auth setup → capture cookies via `context.cookies()` → transfer via CDP `Network.setCookie` to Chrome → Lighthouse uses the same Chrome port.

### Better-auth trustedOrigins gap

`src/lib/auth.ts` reads `BETTER_AUTH_URL` for `baseURL` but does NOT add it to `trustedOrigins`. The trustedOrigins list only includes the production URL and Vercel env vars. For localhost dev, the env-derived baseURL is NOT in trustedOrigins, so `POST /api/auth/sign-up/email` from a browser returns 403 `Invalid origin`.

**Workaround**: run the prod server with `BETTER_AUTH_URL=http://localhost:3000` AND `Origin: http://localhost:3000` on all API calls. Better-auth accepts the matching origin even when it's not in the static trustedOrigins list (validation appears to allow origin == baseURL hostname).

This is a real gap in `auth.ts` (should auto-include `BETTER_AUTH_URL` in trustedOrigins) but is NOT fixed in this phase — it's the kind of change that needs separate discussion.

### Build / measurement commands

- **Build** (webpack, not Turbopack): `npx next build --webpack`. Next.js 16 defaults to Turbopack; `@next/bundle-analyzer` is webpack-only.
- **Lighthouse**: `BASE_URL=http://localhost:3000 node scripts/verify-perf-07.mjs`
- **Variance absorption**: Lighthouse scores vary run-to-run (10-20%). Use 3 consecutive runs and take the median.

</findings>

<techniques>
## Applicable Patterns

### `next/dynamic({ ssr: false })` for non-LCP interactive elements

Used at `ItemRow.tsx:9-12` for `ItemDialogs`:
```typescript
const ItemDialogs = dynamic(
  () => import("./ItemDialogs").then((m) => ({ default: m.ItemDialogs })),
  { ssr: false }
);
```

Same pattern applies to `OrganizeTripBar`. Default `loading: () => null` is fine for this case — the bar isn't LCP-critical.

### Mobile Lighthouse config (works for auth-gated pages)

```js
{
  formFactor: 'mobile',
  screenEmulation: { mobile: true, width: 390, height: 844, deviceScaleFactor: 3 },
  throttlingMethod: 'simulate',
  throttling: { rttMs: 150, throughputKbps: 1638.4, cpuSlowdownMultiplier: 4 }
}
```

Matches the user-agent and viewport of the iPhone 13 device used in PERF-08's manual smoke test.

### CDP cookie injection pattern

```js
import CDP from 'chrome-remote-interface';
const client = await CDP({ port: chrome.port });
const { Network } = client;
await Network.enable();
for (const c of playwrightCookies) {
  await Network.setCookie({ name, value, domain, path, expires, httpOnly, secure, sameSite });
}
await client.close();
```

The `sameSite` value from Playwright cookies needs normalization: Playwright returns `'Lax'|'Strict'|'None'` (capitalized), CDP expects the same casing.

</techniques>

<references>
## References

- Web Vitals — LCP definition and measurement: https://web.dev/lcp/
- Next.js lazy loading: https://nextjs.org/docs/app/building-your-application/optimizing/lazy-loading
- Lighthouse CI auth pattern: https://github.com/GoogleChrome/lighthouse-ci/blob/main/docs/auth.md
- Better-auth trustedOrigins: https://www.better-auth.com/docs/concepts/api#trusted-origins
- Chrome DevTools Protocol Network.setCookie: https://chromedevtools.github.io/devtools-protocol/tot/Network/#method-setCookie

</references>