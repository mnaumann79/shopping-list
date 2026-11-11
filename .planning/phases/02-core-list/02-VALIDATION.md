---
phase: 2
slug: core-list
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-12
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run --reporter=verbose` |
| **Full suite command** | `npx vitest run --reporter=verbose` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --reporter=verbose`
- **After every plan wave:** Run `npx vitest run --reporter=verbose`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 20 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 02-01-01 | 01 | 0 | DB migration | unit | `npx vitest run --reporter=verbose` | ❌ W0 | ⬜ pending |
| 02-01-02 | 01 | 1 | CAT-01 | unit | `npx vitest run --reporter=verbose` | ❌ W0 | ⬜ pending |
| 02-01-03 | 01 | 1 | CAT-02 | unit | `npx vitest run --reporter=verbose` | ❌ W0 | ⬜ pending |
| 02-01-04 | 01 | 1 | CAT-03 | unit | `npx vitest run --reporter=verbose` | ❌ W0 | ⬜ pending |
| 02-02-01 | 02 | 1 | STOR-01 | unit | `npx vitest run --reporter=verbose` | ❌ W0 | ⬜ pending |
| 02-02-02 | 02 | 1 | STOR-02 | unit | `npx vitest run --reporter=verbose` | ❌ W0 | ⬜ pending |
| 02-02-03 | 02 | 1 | STOR-03 | unit | `npx vitest run --reporter=verbose` | ❌ W0 | ⬜ pending |
| 02-03-01 | 03 | 2 | ITEM-01 | unit | `npx vitest run --reporter=verbose` | ❌ W0 | ⬜ pending |
| 02-03-02 | 03 | 2 | ITEM-02 | unit | `npx vitest run --reporter=verbose` | ❌ W0 | ⬜ pending |
| 02-03-03 | 03 | 2 | ITEM-03 | unit | `npx vitest run --reporter=verbose` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `__tests__/api/categories.test.ts` — stubs for CAT-01, CAT-02, CAT-03
- [ ] `__tests__/api/stores.test.ts` — stubs for STOR-01, STOR-02, STOR-03
- [ ] `__tests__/api/items.test.ts` — stubs for ITEM-01, ITEM-02, ITEM-03
- [ ] `__tests__/components/item-list.test.tsx` — component stubs for list UI

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Swipe-to-delete gesture on mobile | ITEM-03 | Touch/pointer event simulation unreliable in jsdom | Open on mobile/devtools touch mode, swipe item left to reveal delete, confirm item removed |
| Default category seeding on first load | CAT-01 | Requires real DB connection with org context | Create new household, navigate to list, verify 10 default categories appear |
| Multi-store tag selection UI | ITEM-01 | Visual multi-select interaction | Add item, open store selector, toggle multiple stores, verify tags display correctly |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 20s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
