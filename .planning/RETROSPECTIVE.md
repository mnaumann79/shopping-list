# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

---

## Milestone: v1.2 — Performance & Polish

**Shipped:** 2026-03-31 (Phases 9-10), fully verified 2026-07-10 (Phase 11 retroactively added)
**Phases:** 3 | **Plans:** 8 | **Sessions:** several — spanning 2026-03-24 → 2026-07-10

### What Was Built

- **Phase 9 (Performance Audit)** — Bundle analyzer configured (Top 5 deps identified), React DevTools Profiler captured render hotspots in ShoppingList and ItemRow (cascade mechanism), Data fetching audit identified 6 inefficiencies across `fetchItems`, clear-completed, and ItemRow useEffects.
- **Phase 10 (Performance Optimizations)** — `React.memo` on `ItemRow` with custom 7-field comparator; `useCallback` for 4 mutation handlers using the `itemsRef` rollback pattern; `useMemo` on 9 derived values; parallel `SELECT+UPDATE` in `clear-completed` route via `Promise.all`; lazy-loaded `DropdownMenu` (65KB deferred) and `sonner` toast lib (68KB deferred) via dynamic imports.
- **Phase 11 (Dashboard Performance, retroactive)** — Lazy-loaded the fixed "Organize trip" bottom bar via `next/dynamic({ ssr: false })`. Established the auth-gated Lighthouse verification infrastructure (Playwright for auth setup → CDP `Network.setCookie` for Chrome → Lighthouse programmatic API). **3-run median: LCP 2846ms → 2332ms (-514ms), TBT 327ms → 0ms (-327ms), performance score 88 → 98.**

### What Worked

- **Lazy-load pattern as the dominant technique.** 10-03's pattern (defer interactive-only UI with dynamic imports) carried directly into Phase 11 — the same `next/dynamic({ ssr: false })` approach that worked for DropdownMenu and sonner worked for the OrganizeTripBar. Pattern is general, not one-off.
- **Conditional plans executed cleanly.** 11-02 was deliberately written as conditional (only if TBT still > 300ms after 11-01). TBT dropped to 0ms after 11-01 alone; 11-02 was correctly skipped without wasted work.
- **Immediate edit → measure → decide cycles.** Each iteration of the verify scripts ran in minutes, surfacing findings (cookie injection gap, stale server holding port 3000) that would have taken days to track down with longer iterations.
- **Self-contained verification scripts.** Both `verify-v1.2.mjs` and `verify-perf-07.mjs` sign up their own fresh user via the better-auth API. No dependency on stale `user.json` files or `auth.setup.ts`.

### What Was Inefficient

- **4-month gap between v1.2 ship and Phase 11 verification.** v1.2 shipped 2026-03-31 with Phase 9-10 only. The PERF-07 verification debt (Lighthouse couldn't measure auth-gated dashboard) was noted in 10-03 SUMMARY but never re-attempted. The first auth-aware Lighthouse run on 2026-07-10 immediately surfaced a real ~800ms LCP regression that had been live in production for months. A bi-monthly audit cadence would have caught this at month 2.
- **`auth.setup.ts` still broken.** Pre-existing file uses UI sign-up flow that fails because better-auth's `trustedOrigins` does not include `BETTER_AUTH_URL`. All `npx playwright test` runs die at the setup step. The functional verification works via `verify-v1.2.mjs` (Playwright `request` API bypasses UI), but `e2e/auth/logout.spec.ts` can't run end-to-end. Real bug, separate from v1.2.
- **`auth.ts` `trustedOrigins` gap.** `BETTER_AUTH_URL` is read for `baseURL` but never propagated to `trustedOrigins`. Dev workflow quirk — discovered when running Lighthouse on non-default port, worked around by aligning port + Origin + baseURL. Real bug, separate from v1.2.
- **JS npm packages installed `--no-save`.** `lighthouse`, `chrome-launcher`, `chrome-remote-interface` were installed without saving to `package.json`. Reproducibility note documented in the verify scripts' commit message but not yet actioned.

### Patterns Established

1. **`next/dynamic({ ssr: false })` for interactive-only UI.** Default `loading: () => null` removes the component from initial HTML entirely. Pattern proves out for both per-route heavy UI (DropdownMenu in AppHeader) and per-component lazy-mount (OrganizeTripBar in ShoppingList). Apply this to any component whose first paint isn't LCP-critical.
2. **Playwright `request` API > Node `fetch` for multi-step auth.** Playwright's `context.cookies()` captures `Set-Cookie` across multiple responses correctly. Node `fetch` loses cookies after the first non-initial response. Use Playwright's API for any auth setup that involves multiple endpoints.
3. **Lighthouse on auth-gated pages needs CDP, not headers.** Lighthouse v13 `extraHeaders` does not carry HTTPOnly cookies through to the navigation. Use CDP `Network.setCookie` on the Chrome instance before Lighthouse runs. Working pattern is now packaged in `scripts/verify-perf-07.mjs`.
4. **Conditional plans need an explicit triggering condition.** 11-02 was written with `triggered_by: "LCP ≤ 2500ms achieved in 11-01 but TBT remains > 300ms over 3 consecutive runs"` — the explicit condition meant no wasted work when TBT came in at 0ms. Use this pattern for "fallback" plans rather than always-execute conditional work.

### Key Lessons

1. **Verification contracts must cover auth-gated scenarios.** 10-03 claimed "Dashboard LCP couldn't be measured headlessly (requires auth session)" — that's a debt acknowledgment, not a finish. The implicit contract was "verify what you can reach"; the right contract is "verify what users will experience." Auth-gated pages are the latter. Phase 11 closed that gap.
2. **If the test environment can't measure something, the manual-verification backstop needs a documented owner and a deadline.** "Manual verification required" in 10-03 SUMMARY has no owner, no date, no checklist. By the time anyone re-attempted (4 months later), the debt was invisible. Add owner + date + "what's the trigger to re-attempt" to every manual-verification note.
3. **The first auth-aware Lighthouse run was a one-liner change in setup, not a Phase-9-style investigation.** Phase 11 was "extract a component, make it dynamic, ship it" — 3 tasks. The real lift was figuring out how to run Lighthouse against an auth-gated URL with HTTPOnly cookies. The infra unlock (`scripts/verify-perf-07.mjs`) is reusable. Future perf gates should assume auth-gated pages from the start.
4. **Stale dev servers on locked ports eat hours.** Twice during this session, a prior `next start` process (PID 18932, 42840) held port 3000 from an earlier session, causing subtle 500s that masqueraded as test failures. Verify `netstat -ano | grep :3000` before debugging test failures when builds have changed.
5. **`Playwright`'s test runner depends on `auth.setup.ts` which was brittle by the time Phase 11 shipped.** The `verify-v1.2.mjs` standalone script side-stepped this entirely. Prefer standalone scripts for verification work that needs precise control over auth setup.

### Cost Observations

- **Sessions:** 1 long session for the Phase 11 work (this one), plus earlier sessions for Phase 9-10 (2026-03-24 → 2026-03-31).
- **Model mix:** Sonnet for execution, Opus for plan-optimizer loop and milestone decisions. Sonnet handled the bulk.
- **Tooling note:** Lighthouse + Chrome CDP cookie injection added +140 npm packages for verification purposes. Not pinned in `package.json` (installed `--no-save`); reproducibility note documented in commit message. If verification scripts become regular CI, pin them.

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Sessions | Phases | Key Change |
|-----------|----------|--------|------------|
| v1.0 MVP | ~2 | 3 | Initial GSD workflow; 21 plans across 1 month |
| v1.1 Design Polish | ~3 | 8 | Visual design system added; theme previews; 1-week timeline |
| v1.2 Performance & Polish | 3+ | 3 (9-11) | Lazy-load pattern established; auth-gated Lighthouse unlocked (retroactive); 3.5-month timeline |

### Cumulative Quality

| Milestone | UAT/Tests | Notes |
|-----------|-----------|-------|
| v1.0 MVP | 8+ tests | Core CRUD + auth |
| v1.1 Design Polish | 22+ tests | Theme + design system |
| v1.2 Performance & Polish | Lighthouse + 4 e2e scripts | Auth-aware verification infra added (Phase 11) |

### Top Lessons (Verified Across Milestones)

1. **"No regressions" is the load-bearing test goal.** Every milestone's last plan is a verification phase, not new functionality. Treat verification as the deliverable, not a step toward it. (Re-verified in v1.2 Phase 10 UAT, then re-re-verified in v1.2 Phase 11.)
2. **Lazy-load is the v1.2 family pattern.** Sign-in (DropdownMenu, sonner), dashboard (OrganizeTripBar). Any interactive-only UI that's not part of the LCP. Carry this forward into v1.3.
3. **Document debt explicitly with trigger conditions.** v1.2's "manual verification required" survived without an owner for 4 months because the trigger to re-attempt wasn't documented. Phase 11 only happened because the user manually re-engaged verification. Future debt notes need owner + trigger.

### Outstanding Items for v1.3 Planning

- **`auth.ts` `trustedOrigins` gap.** Real bug. Fix at the start of v1.3 — it's blocking proper e2e auth setup.
- **`e2e/auth/setup.ts`** uses the broken UI flow. After fixing `auth.ts`, rewrite this to use the Playwright `request` API pattern that `verify-v1.2.mjs` already proves out.
- **Pin `lighthouse`, `chrome-launcher`, `chrome-remote-interface`** in `package.json` if Lighthouse-on-CI becomes a regular gate.
- **Consider a bi-monthly "auth-aware verification" audit cadence** to catch future dashboard perf regressions before they linger for 4 months.
