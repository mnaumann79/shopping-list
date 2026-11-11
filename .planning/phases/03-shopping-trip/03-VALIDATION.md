---
phase: 03
slug: shopping-trip
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-03-13
---

# Phase 03 - Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest + Playwright |
| **Config file** | `vitest.config.ts`, `playwright.config.ts` |
| **Quick run command** | `npx vitest run src/app/api/items/[id]/route.test.ts src/app/(app)/dashboard/__tests__/ItemRow.test.tsx --reporter=verbose` |
| **Full suite command** | `npx vitest run --reporter=verbose && npx playwright test` |
| **Estimated runtime** | ~90 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run src/app/api/items/[id]/route.test.ts src/app/(app)/dashboard/__tests__/ItemRow.test.tsx --reporter=verbose`
- **After every plan wave:** Run `npx vitest run --reporter=verbose && npx playwright test`
- **Before `$gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 90 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 03-01-01 | 01 | 1 | ITEM-04 | api | `npx vitest run src/app/api/items/[id]/route.test.ts --reporter=verbose` | ✅ | ⬜ pending |
| 03-01-02 | 01 | 1 | ITEM-05 | api | `npx vitest run src/app/api/items/[id]/route.test.ts --reporter=verbose` | ✅ | ⬜ pending |
| 03-01-03 | 01 | 1 | ITEM-06 | api | `npx vitest run src/app/api/items/clear-completed/route.test.ts --reporter=verbose` | ❌ W0 | ⬜ pending |
| 03-02-01 | 02 | 2 | ORG-01 | component | `npx vitest run src/app/(app)/dashboard/__tests__/ShoppingList.test.tsx --reporter=verbose` | ❌ W0 | ⬜ pending |
| 03-02-02 | 02 | 2 | ORG-02 | component | `npx vitest run src/app/(app)/dashboard/__tests__/ShoppingList.test.tsx --reporter=verbose` | ❌ W0 | ⬜ pending |
| 03-02-03 | 02 | 2 | ORG-03 | component | `npx vitest run src/app/(app)/dashboard/__tests__/ShoppingList.test.tsx --reporter=verbose` | ❌ W0 | ⬜ pending |
| 03-02-04 | 02 | 2 | ORG-04 | component | `npx vitest run src/app/(app)/dashboard/__tests__/ShoppingList.test.tsx --reporter=verbose` | ❌ W0 | ⬜ pending |
| 03-03-01 | 03 | 3 | ITEM-04 | component | `npx vitest run src/app/(app)/dashboard/__tests__/ItemRow.test.tsx --reporter=verbose` | ✅ | ⬜ pending |
| 03-04-01 | 04 | 4 | ORG-02 | component | `npx vitest run src/app/(app)/dashboard/__tests__/ShoppingList.test.tsx --reporter=verbose` | ❌ W0 | ⬜ pending |
| 03-04-02 | 04 | 4 | ITEM-06 | component | `npx vitest run src/app/(app)/dashboard/__tests__/ShoppingList.test.tsx --reporter=verbose` | ❌ W0 | ⬜ pending |
| 03-05-01 | 05 | 5 | ITEM-04 | e2e | `npx playwright test e2e/dashboard-shopping-trip.spec.ts` | ❌ W0 | ⬜ pending |
| 03-05-02 | 05 | 5 | ITEM-06 | e2e | `npx playwright test e2e/dashboard-shopping-trip.spec.ts --grep \"clear completed|undo\"` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/app/api/items/clear-completed/route.test.ts` - bulk clear route tests for ITEM-06
- [ ] `src/app/(app)/dashboard/__tests__/ShoppingList.test.tsx` - derived list behavior coverage for filter, organization, and completed section
- [ ] `e2e/dashboard-shopping-trip.spec.ts` - end-to-end trip behavior coverage

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Sticky bottom trip action bar does not conflict with quick add on common mobile breakpoints | ITEM-06 | Layout overlap and touch ergonomics are hard to trust from unit tests alone | Run `npm run dev`, open the dashboard in mobile device emulation, and verify both controls remain reachable without obscuring list content |
| Horizontal store chips remain usable with several stores | ORG-02 | Overflow ergonomics and scroll feel need human review | Add 4-6 stores, switch filters on mobile width, and confirm chips scroll cleanly while `All stores` remains discoverable |
| Check/uncheck affordance remains clear after the row-tap interaction change | ITEM-04, ITEM-05 | Discoverability and accidental-tap rate require real interaction review | On desktop and mobile, verify users can both toggle completion and still find the edit path without confusion |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 90s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
