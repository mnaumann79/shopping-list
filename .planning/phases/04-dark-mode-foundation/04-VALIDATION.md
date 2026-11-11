---
phase: 4
slug: dark-mode-foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-18
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest / jest (Next.js) |
| **Config file** | vitest.config.ts or jest.config.js |
| **Quick run command** | `npm test -- --run` |
| **Full suite command** | `npm test -- --run` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test -- --run`
- **After every plan wave:** Run `npm test -- --run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 4-01-01 | 01 | 1 | DARK-01 | manual | visual inspection in browser | ✅ | ⬜ pending |
| 4-01-02 | 01 | 1 | DARK-02 | manual | localStorage check in DevTools | ✅ | ⬜ pending |
| 4-01-03 | 01 | 1 | DARK-03 | manual | page reload + theme check | ✅ | ⬜ pending |
| 4-01-04 | 01 | 1 | DARK-04 | manual | visual check all pages in dark mode | ✅ | ⬜ pending |
| 4-01-05 | 01 | 1 | VIS-03 | manual | Shadcn dropdown + toaster in dark mode | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- Existing infrastructure covers all phase requirements — no new test files required for Wave 0.
- Dark mode behavior is primarily visual/browser-based; manual verification covers all success criteria.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Theme toggle cycles System→Light→Dark | DARK-01 | Visual UI state | Click toggle in header, observe icon and page colors change through 3 states |
| Theme persists after tab close/reopen | DARK-02 | Browser localStorage | Set dark mode, close tab, reopen — confirm dark mode still active |
| No flash of wrong theme on load | DARK-03 | Browser rendering timing | Reload page in dark mode — no white flash before theme applies |
| All pages render correctly in dark mode | DARK-04 | Visual coverage | Navigate dashboard, auth, settings in dark mode — no gray/white surfaces |
| Shadcn components respect theme | VIS-03 | Component visual state | Open dropdown and trigger toast in dark mode — both should use dark colors |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
