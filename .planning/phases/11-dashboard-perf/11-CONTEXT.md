# Phase 11: Dashboard Performance - Context

**Gathered:** 2026-07-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Apply targeted optimizations to the auth-gated dashboard (`/dashboard`) so PERF-07 acceptance is met. v1.2 set the LCP < 2.5s and CLS < 0.1 budgets but couldn't measure against them on the auth-gated dashboard — Lighthouse from the v1.2 era only ran on the sign-in page (which had no auth gate). The first auth-aware Lighthouse run (2026-07-10) measured LCP 2846ms and TBT 327ms — both over budget.

Phase 11 fixes the LCP specifically (LCP element is a wide, server-rendered label in the fixed "Organize trip" bottom bar). TBT fix is conditional on whether 11-01 alone is sufficient.

**Already shipped (v1.2):**
- React.memo + useCallback + useMemo on ShoppingList/ItemRow (10-01) — render perf, didn't address LCP
- Lazy-loaded DropdownMenu and sonner (10-03) — sign-in TBT went 1930ms → 170ms; dashboard TBT was never measured

**Out of scope** (documented as known-limit): Next.js framework root chunks `3794-...js` and `4bd1b696-...js` account for ~360ms of TBT. They're Next.js 16 framework code; optimizing them is a Next.js-internals question.

</domain>

<decisions>
## Implementation Decisions

### Lazy-load the Organize Trip bar (11-01)
- **Why it's the LCP**: server-rendered HTML; the "ORGANIZE TRIP" label has `tracking-[0.2em]` letter-spacing that widens the boundingRect; it paints before React-hydrated item rows get measured as larger
- **How**: extract the fixed bottom bar JSX (`ShoppingList.tsx:721-762`) into a new `_components/OrganizeTripBar.tsx`; import via `next/dynamic({ ssr: false })` with default `loading: () => null` (matches the `ItemDialogs` pattern in `ItemRow.tsx:9-12`)
- **Risk**: LCP shifts to a slower element. Mitigation: 3 consecutive Lighthouse runs absorb variance before declaring success
- **Fallback**: revert the dynamic import (single-file revert)

### QuickAddBar deps (11-02, conditional)
- **Triggered only if** 11-01 brings LCP under budget but TBT stays > 300ms over 3 consecutive runs
- **How**: wrap submit handler with `void import('sonner').then(...)` if not already; `next/dynamic({ ssr: false })` any non-essential subcomponents
- **Why conditional**: 10-03 already addressed the main TBT sources for sign-in; dashboard-specific sources need profiling, not speculation

### Architecture decisions
- **Keep the local `OrganizationMode` type in ShoppingList** rather than type-import from OrganizeTripBar. Duplicating a one-line type is cheaper than the type-only import dance, and structural typing makes them equivalent.
- **Pass `showStoreOption: boolean` instead of `selectedStoreId`** to the new component — keeps OrganizeTripBar unaware of the `ALL_STORES_FILTER` constant.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Lighthouse Profiling Data
- `lighthouse-report-1783713137148.json` — first measurement of `/dashboard` with valid auth. LCP element, render delay, TBT breakdown.

### Requirements
- `.planning/REQUIREMENTS.md` — PERF-07 (LCP < 2.5s, CLS < 0.1), PERF-08 (no regressions on iPhone)

### Existing Phase 10 Patterns (lazy-loading reference)
- `.planning/phases/10-performance-optimizations/10-03-SUMMARY.md` — DropdownMenu + sonner lazy-loading pattern
- `src/app/(app)/dashboard/_components/ItemRow.tsx` lines 9-12 — `ItemDialogs` dynamic import

### Auth-injection gotcha
- `scripts/verify-perf-07.mjs` — Lighthouse `extraHeaders` does NOT carry HTTPOnly cookies. CDP `Network.setCookie` is required, and Playwright's request API is the only reliable way to capture the post-set-active session.

### Files to Modify
- `src/app/(app)/dashboard/_components/ShoppingList.tsx` — add dynamic import for OrganizeTripBar; replace inline JSX at lines 721-762

### Files to Create
- `src/app/(app)/dashboard/_components/OrganizeTripBar.tsx` — extracted fixed bottom bar

</canonical_refs>

<existing_code_insights>
## Existing Code Insights

- `ShoppingList.tsx:721-762` is the fixed "Organize trip" bar — uses `organizationMode`, `setOrganizationMode`, `selectedStoreId`, and the `ALL_STORES_FILTER` constant
- The bar is tightly coupled to ShoppingList state (button clicks update state); extracted component takes `mode`, `setMode`, `showStoreOption` props
- `OrganizationMode` type is defined locally in `ShoppingList.tsx:40`; duplicated structurally-equivalent definition will live in `OrganizeTripBar.tsx`
- `useState<OrganizationMode>(DEFAULT_ORGANIZATION_MODE)` on line 260 — depends on the local type, must remain consistent after extraction
- `e2e/dashboard-shopping-trip.spec.ts` already exercises the "switch between category, alphabetical, and store organization" flow — that's the regression-check for 11-01

</existing_code_insights>

<specifics>
## Specific Ideas

- Use `next/dynamic` not `React.lazy` — matches the codebase convention (ItemRow.tsx pattern)
- `loading: () => null` (default) is fine — the bar pops in after JS loads; no skeleton needed since the bar isn't LCP-critical
- Pass `showStoreOption: boolean` instead of `selectedStoreId` to keep OrganizeTripBar unaware of `ALL_STORES_FILTER` constant
- `grep -c "Organize trip" src/app/(app)/dashboard/_components/ShoppingList.tsx` should return 0 after the change (verify the JSX was removed)

</specifics>

<deferred>
## Deferred Ideas

- Framework chunk optimization (Next.js 16 root main chunks 3794 and 4bd1b696) — out of scope; would require Next.js internals work or a different runtime
- Real-device iPhone Lighthouse (PERF-08 manual step) — user runs that themselves; this phase verifies simulated mobile

</deferred>

---

*Phase: 11-dashboard-perf*
*Context gathered: 2026-07-10*