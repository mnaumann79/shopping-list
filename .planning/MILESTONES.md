# Milestones

## v1.2 Performance & Polish (Shipped: 2026-03-31; fully verified 2026-07-10)

**Phases completed:** 3 phases, 8 plans, 0 tasks

**Key accomplishments:**

- **Phase 9 (Performance Audit)** — measured LCP, TBT, bundle size, render performance, and data-fetching patterns; established the baseline that drove Phase 10's optimizations.
- **Phase 10 (Performance Optimizations)** — React.memo + useCallback + useMemo eliminated 3-27× redundant `ItemRow` re-renders; parallel SELECT+UPDATE in `clear-completed` removed one DB round-trip; lazy-loaded DropdownMenu and sonner dropped sign-in TBT from 1,930ms → 170ms (**-91%**); Lucide tree-shaking verified (17 individual icons, no monolithic chunk).
- **Phase 11 (Dashboard Performance, retroactive 2026-07-10)** — closed the PERF-07 verification debt that v1.2 originally shipped without. The first auth-aware Lighthouse run surfaced an 800ms dashboard LCP regression that 10-03 had noted but couldn't measure. Lazy-loaded the fixed "Organize trip" bottom bar via `next/dynamic({ ssr: false })`. **Measured (3-run median): LCP 2846ms → 2332ms (-514ms), TBT 327ms → 0ms (-327ms), performance score 88 → 98.**

**Discovered along the way:**

- 10-03 SUMMARY's note "Dashboard LCP couldn't be measured headlessly (requires auth session)" hid a real ~800ms LCP regression for 4 months. The first auth-aware Lighthouse run on 2026-07-10 surfaced it.
- Lighthouse v13 `extraHeaders` does not carry HTTPOnly cookies through to the navigation; CDP `Network.setCookie` is required for auth-gated audits.
- The two heaviest long tasks (Next.js 16 framework root main chunks `3794-...js` and `4bd1b696-...js`) are not application code. The dashboard perf debt was in app code (the "Organize trip" bar JSX blocking initial paint), not framework.

**Verification artifacts:**

- `.planning/phases/11-dashboard-perf/` — context, research, plans, summaries (10 files)
- `scripts/verify-v1.2.mjs` — 4/4 functional tests pass (logout flows + iPhone 13 viewport: add / check / organize)
- `scripts/verify-perf-07.mjs` — Lighthouse driver, all 3 runs within PERF-07 budget

---

## v1.0 MVP (Shipped: 2026-03-18)

**Phases completed:** 3 phases, 21 plans

**Key accomplishments:**

- (none recorded)

---

## v1.1 Design Polish (Shipped: 2026-03-23)

**Phases completed:** 8 phases (4, 4.1, 5, 6, 7, 8), 8 plans

**Key accomplishments:**

- Dark mode with three-state toggle (System/Light/Dark)
- Global app header with settings navigation and theme toggle
- Compact single-line item rows with name/quantity/store/notes preview
- Store default persistence (last-used store pre-selected)
- Visual design system (semantic tokens only, pill chip store tags, documented design system)
- Three theme preview palettes (Warm & Inviting, Clean & Fresh, Bold & Playful) with dark mode variants
- ShoppingList.tsx refactored: CompletedSection extracted, merged duplicate useEffects
- Clickable notes in item rows to view full note in modal

**Stats:** 249 files modified, ~22K LOC added, 6-day timeline (2026-03-17 → 2026-03-23)

**UAT Results (all passed):**

- Phase 05: 8/8 tests passed
- Phase 06: 5/5 tests passed
- Phase 07: 4/4 tests passed
- Phase 08: 5/5 tests passed

**Archived:**

- `.planning/milestones/v1.1-ROADMAP.md`
- `.planning/milestones/v1.1-REQUIREMENTS.md`

---
