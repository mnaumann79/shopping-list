---
phase: 5
slug: compact-item-row
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-19
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npm test -- --run` |
| **Full suite command** | `npm test -- --run` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test -- --run`
- **After every plan wave:** Run `npm test -- --run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 5-01-01 | 01 | 0 | VIS-01 | unit | `npm test -- --run ItemRow` | ❌ W0 | ⬜ pending |
| 5-01-02 | 01 | 1 | VIS-01 | unit | `npm test -- --run ItemRow` | ✅ | ⬜ pending |
| 5-01-03 | 01 | 1 | VIS-02 | unit | `npm test -- --run ItemRow` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/components/__tests__/ItemRow.test.tsx` — rewrite stubs for compact row model (VIS-01, VIS-02)

*Existing test file must be rewritten to match Dialog-based edit model.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| 44px touch targets on 390px mobile viewport | VIS-01 | Requires browser DevTools viewport simulation | Open in Chrome DevTools, set viewport to 390px, inspect checkbox and edit icon hit areas |
| Light and dark mode rendering | VIS-02 | Visual check | Toggle dark mode, verify row colors and contrast |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
