# Roadmap: Household Shopping List App

## Milestones

- ✅ **v1.0 MVP** — Phases 1-3 (shipped 2026-03-18)
- ✅ **v1.1 Design Polish** — Phases 4-8 (shipped 2026-03-23)
- ✅ **v1.2 Performance & Polish** — Phases 9-11 (shipped 2026-07-10)

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1-3) — SHIPPED 2026-03-18</summary>

- [x] Phase 1: Foundation (8/8 plans) — completed 2026-03-12
- [x] Phase 2: Core List (8/8 plans) — completed 2026-03-13
- [x] Phase 3: Shopping Trip (5/5 plans) — completed 2026-03-17

</details>

<details>
<summary>✅ v1.1 Design Polish (Phases 4-8) — SHIPPED 2026-03-23</summary>

- [x] Phase 4: Dark Mode Foundation (2/2 plans) — completed 2026-03-18
- [x] Phase 4.1: Global App Header (2/2 plans) — completed 2026-03-18
- [x] Phase 5: Compact Item Row (1/1 plan) — completed 2026-03-19
- [x] Phase 6: Store Default Persistence (1/1 plan) — completed 2026-03-20
- [x] Phase 7: Visual Design System (1/1 plan) — completed 2026-03-21
- [x] Phase 8: Theme Preview (1/1 plan) — completed 2026-03-23

**Archived:** `.planning/milestones/v1.1-ROADMAP.md`

</details>

<details>
<summary>✅ v1.2 Performance & Polish (Phases 9-11) — SHIPPED 2026-07-10</summary>

- [x] Phase 9: Performance Audit (3/3 plans) — completed 2026-03-24
- [x] Phase 10: Performance Optimizations (3/3 plans) — completed 2026-03-25
- [x] Phase 11: Dashboard Performance (2/2 plans) — completed 2026-07-10

**Archived:** `.planning/milestones/v1.2-ROADMAP.md`

</details>

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Foundation | v1.0 | 8/8 | Complete | 2026-03-12 |
| 2. Core List | v1.0 | 8/8 | Complete | 2026-03-13 |
| 3. Shopping Trip | v1.0 | 5/5 | Complete | 2026-03-17 |
| 4. Dark Mode Foundation | v1.1 | 2/2 | Complete | 2026-03-18 |
| 4.1. Global App Header | v1.1 | 2/2 | Complete | 2026-03-18 |
| 5. Compact Item Row | v1.1 | 1/1 | Complete | 2026-03-19 |
| 6. Store Default Persistence | v1.1 | 1/1 | Complete | 2026-03-20 |
| 7. Visual Design System | v1.1 | 1/1 | Complete | 2026-03-21 |
| 8. Theme Preview | v1.1 | 1/1 | Complete | 2026-03-23 |
| 9. Performance Audit | v1.2 | 3/3 | Complete | 2026-03-24 |
| 10. Performance Optimizations | v1.2 | 3/3 | Complete | 2026-03-25 |
| 11. Dashboard Performance | v1.2 | 2/2 | Complete | 2026-07-10 |

---

### Phase 9: Performance Audit

**Goal:** Measure and identify performance bottlenecks

**Requirements:** PERF-01, PERF-02, PERF-03

**Success criteria:**
1. Bundle analyzer report generated — largest dependencies identified
2. React DevTools Profiler trace captured — re-render hotspots identified
3. Data fetching pattern analysis complete — redundancy and inefficiency documented

**Plans:**
3/3 plans executed
- [x] 09-01-PLAN.md — Bundle size audit (PERF-01)
- [x] 09-02-PERF-02-PLAN.md — React render audit (PERF-02)
- [x] 09-03-PERF-03-PLAN.md — Data fetching audit (PERF-03)

---

### Phase 10: Performance Optimizations

**Goal:** Implement targeted optimizations based on Phase 9 audit findings

**Requirements:** PERF-04, PERF-05, PERF-06, PERF-07, PERF-08

**Success criteria:**
1. Bundle size reduced (target: 15% smaller or meet Lighthouse performance target)
2. React re-renders reduced in ShoppingList and ItemRow
3. Data fetching deduplicated and cached appropriately
4. Core Web Vitals: LCP < 2.5s, FID < 100ms, CLS < 0.1
5. All existing UAT tests pass (no regressions)

**Plans:** 3/3 plans executed
- [x] 10-01-PLAN.md — Render optimizations: React.memo + useCallback + useMemo (PERF-05)
- [x] 10-02-PLAN.md — Data fetching: clear-completed parallel queries (PERF-06)
- [x] 10-03-PLAN.md — Verification: bundle, regression, Core Web Vitals (PERF-04, PERF-07, PERF-08)

---

### Phase 11: Dashboard Performance

**Goal:** Bring LCP and TBT on the auth-gated dashboard within PERF-07 budgets (LCP < 2.5s, TBT < 300ms). v1.2 closed out with these still technically unmet because 10-03 could not measure the auth-gated dashboard LCP.

**Requirements:** PERF-07

**Success criteria:**
1. Lighthouse on /dashboard measures LCP ≤ 2500ms (median of 3 consecutive mobile runs)
2. TBT ≤ 300ms
3. No regressions in ShoppingList / ItemRow / AppHeader functionality

**Plans:** 2/2 plans executed (11-02 was conditional and not triggered)
- [x] 11-01-PLAN.md — Lazy-load the fixed "Organize trip" bottom bar via `next/dynamic({ ssr: false })`. **Measured (3-run median): LCP 2332ms (-514ms from 2846ms baseline), TBT 0ms (-327ms from 327ms baseline), performance score 88 → 98.**
- [x] 11-03-PLAN.md — Document: flip `10-VALIDATION.md` to `status: complete` with measured PERF-07 numbers; surface Phase 11 in the vault wiki.

**Discoveries (recorded in `.planning/phases/11-dashboard-perf/11-RESEARCH.md`):**
- 10-03's "Dashboard LCP couldn't be measured headlessly (requires auth session)" hid a real ~800ms LCP regression for 4 months. First auth-aware Lighthouse run with HTTPOnly cookies via CDP `Network.setCookie` finally surfaced it.
- Lighthouse v13 `extraHeaders` does not carry HTTPOnly cookies through to navigation; cookies must be set on the Chrome instance via CDP before Lighthouse runs.
- The two heaviest long tasks (chunks `3794-...js` and `4bd1b696-...js`) are Next.js 16 framework root main chunks, not application code. After the bar lazy-load, the LCP element moved out of initial paint and framework chunk execution no longer dominates TBT (which dropped to 0ms).

---

*Last updated: 2026-07-10 — Phase 11 closed (v1.2 fully verified and shipped)*
