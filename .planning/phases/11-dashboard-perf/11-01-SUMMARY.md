---
phase: 11-dashboard-perf
plan: 01
completed: 2026-07-10
duration: ~10min
type: execute
wave: 1
autonomous: true

# Phase 11 Plan 01 — Lazy-load the "Organize trip" bottom bar

## Result

PERF-07 acceptance gate satisfied. 3 consecutive Lighthouse runs all pass LCP ≤ 2500ms and TBT ≤ 300ms.

## Measured numbers (3 consecutive runs, mobile simulated 4G)

| Metric | Budget | Run 1 | Run 2 | Run 3 | **Median** |
|---|---|---|---|---|---|
| **LCP** | ≤ 2500ms | 2332ms ✅ | 2312ms ✅ | 2410ms ✅ | **2332ms** |
| **TBT** | ≤ 300ms | 0ms ✅ | 73ms ✅ | 0ms ✅ | **0ms** |
| CLS | ≤ 0.1 | 0 ✅ | 0 ✅ | 0 ✅ | **0** |
| FCP | ≤ 2500ms | 923ms ✅ | 873ms ✅ | 873ms ✅ | **873ms** |
| Speed Index | ≤ 3000ms | 1124ms ✅ | 994ms ✅ | 994ms ✅ | **994ms** |
| Performance score | — | 98/100 | 98/100 | 98/100 | **98/100** |

**Before → After delta**:
- LCP: 2846ms → 2332ms (-514ms, **-18%**)
- TBT: 327ms → 0ms (-327ms, **-100%**)
- Performance score: 88/100 → 98/100 (+10)

## What changed

Two files:
- **Created** `src/app/(app)/dashboard/_components/OrganizeTripBar.tsx` — extracted fixed bottom bar JSX (ShoppingList.tsx:721-762) into its own component. Exports `OrganizationMode` type and `OrganizeTripBar` function.
- **Modified** `src/app/(app)/dashboard/_components/ShoppingList.tsx` — added `import dynamic from "next/dynamic"` and `const OrganizeTripBarLazy = dynamic(..., { ssr: false })`; replaced the inline fixed bottom bar JSX with `<OrganizeTripBarLazy ... />`.

## Tasks completed

- [x] Task 1: Create OrganizeTripBar component
- [x] Task 2: Lazy-load OrganizeTripBar from ShoppingList
- [x] Task 3: Re-measure Lighthouse on dashboard (3 runs)

## Acceptance verification

- [x] ShoppingList.tsx contains `import dynamic from "next/dynamic"` ✅
- [x] ShoppingList.tsx contains `const OrganizeTripBarLazy = dynamic(` ✅
- [x] ShoppingList.tsx no longer contains the inline fixed bottom bar JSX (grep -c "Organize trip" returned 0) ✅
- [x] `npx tsc --noEmit` — zero new errors from ShoppingList/OrganizeTripBar/dashboard code ✅
- [x] `verify-v1.2.mjs` — 4/4 pass (after killing a stale prod server PID 42840 holding port 3000) ✅
- [x] 3 consecutive Lighthouse runs each show LCP ≤ 2500ms ✅
- [x] Performance score 98/100 on all runs ✅

## Deviations from plan

- **Stale prod server held port 3000** during initial Lighthouse runs (PID 42840 from prior session — `next start` process from an earlier shell). Caused a transient 500 error that manifested as the testLogoutFlow failure in verify-v1.2.mjs. Resolved by `Stop-Process -Id 42840 -Force` and restarting on a fresh prod server. No impact on the Phase 11 plan; the actual perf measurements above are from the fresh server.

## Notes

- The LCP element is still reported as "ORGANIZE TRIP" (because the lazy-mounted bar eventually renders), but the **element render delay** dropped substantially because the main thread is no longer blocked by parsing/rendering the bar during initial page load. TBT falling to 0ms is the clearest indicator that the bottleneck was main-thread blocking, not the bar's own JSX.
- 11-02 (QuickAddBar lazy-load) NOT triggered — TBT came in well under 300ms after just 11-01.
- Next.js framework chunks `3794-...js` (294ms long task at baseline) and `4bd1b696-...js` still exist but no longer dominate TBT because the 944ms of script evaluation that blocked LCP has dropped to ~0ms when measured. The chunks themselves haven't changed; what changed is that the React hydration of the bar JSX is no longer competing with the initial paint.

## Artifacts

- Lighthouse JSON reports (sorted by mtime, latest 3 are 11-01 runs):
  - `lighthouse-report-1783714526576.json` (run 1)
  - `lighthouse-report-1783714562675.json` (run 2)
  - `lighthouse-report-1783714591217.json` (run 3)

## Next

Phase 11-03 (document results in `10-VALIDATION.md` + vault wiki + log). 11-02 not needed.