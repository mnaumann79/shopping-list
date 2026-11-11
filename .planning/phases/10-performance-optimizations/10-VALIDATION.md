---
phase: 10
slug: performance-optimizations
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-24
completed: 2026-07-10
---

# Phase 10 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.x + @testing-library/react 16.x |
| **Config file** | `vitest.config.ts` (project root) |
| **Quick run command** | `npx vitest run src/app/\(app\)/dashboard/__tests__/` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run src/app/\(app\)/dashboard/__tests__/`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 10-01-01 | 01 | 1 | PERF-05 | unit | `npx vitest run src/app/\(app\)/dashboard/__tests__/ItemRow.test.tsx` | ✅ | ✅ green |
| 10-01-02 | 01 | 1 | PERF-05 | unit | `npx vitest run src/app/\(app\)/dashboard/__tests__/ShoppingList.test.tsx` | ✅ | ✅ green |
| 10-02-01 | 02 | 2 | PERF-06 | unit | `npx vitest run src/app/api/items/clear-completed/route.test.ts` | ✅ | ✅ green |
| 10-03-01 | 03 | 3 | PERF-04 | manual | `ANALYZE=true npm run build -- --webpack` then inspect `.next/analyze/client.html` | N/A | ✅ green (17 individual lucide icons bundled; no monolithic chunk — verified 2026-07-10) |
| 10-03-02 | 03 | 3 | PERF-07 | manual | Lighthouse mobile simulation before/after | N/A | ✅ green (LCP 2846ms → 2332ms; TBT 327ms → 0ms; score 88 → 98 — verified 2026-07-10 via Phase 11-01) |
| 10-full | all | all | PERF-08 | unit | `npx vitest run` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/app/api/items/clear-completed/route.test.ts` — mock structure must be updated to match parallel query implementation; assertions remain the same. This is a modification, not a new file.

*Note: All other test files exist. The clear-completed test needs mock updates only.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Lucide tree-shaking confirmed | PERF-04 | Bundle analysis requires build + visual inspection | Run `ANALYZE=true npm run build -- --webpack`, open `.next/analyze/client.html`, verify Lucide icons are not bundled as a single large chunk |
| LCP < 2.5s, CLS < 0.1, FID < 100ms, INP minimal | PERF-07 | Core Web Vitals require Lighthouse run | Run Lighthouse mobile simulation before and after Phase 10; compare LCP, FCP, CLS, INP |
| iPhone smoke test — no regressions | PERF-08 | E2E flow verification | Add item, toggle checked, edit, clear completed, filter by store — verify all work correctly |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 15s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** complete (verified 2026-07-10 after Phase 11-01 closed out PERF-07)
