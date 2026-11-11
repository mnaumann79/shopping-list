---
phase: 7
slug: 4-2
status: draft
nyquist_compliant: false
wave_0_complete: true
created: 2026-03-20
---

# Phase 7 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | grep-based audit (no test framework needed) |
| **Config file** | N/A |
| **Quick run command** | `grep -rE "bg-|text-|border-" src --include="*.tsx" | grep -v "bg-foreground\|bg-background\|bg-accent\|bg-muted\|bg-card\|bg-popover\|bg-secondary\|bg-primary\|bg-destructive\|text-foreground\|text-muted-foreground\|text-accent-foreground\|text-secondary-foreground\|text-primary-foreground\|text-destructive\|text-card-foreground\|text-popover-foreground\|text-secondary\|text-muted\|border-border\|border-input\|border-ring"` |
| **Full suite command** | Same grep + visual inspection of dialog, ItemRow, globals.css |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run grep audit to confirm no hardcoded colors
- **Before `/gsd:verify-work`:** Visual inspection of implemented changes
- **Max feedback latency:** ~60 seconds (grep is instant, visual check is fast)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 07-01-01 | 01 | 1 | VIS-03 | grep audit | See infra command | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Existing infrastructure covers all phase requirements (grep audit + visual inspection)

*If none: "Existing infrastructure covers all phase requirements."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Store abbreviation renders as pill chip | VIS-03 | Visual check required | Load app, add item with store, verify chip appearance |
| Dialog backdrop correct in light/dark | VIS-03 | Must see both themes | Toggle theme, open dialog, inspect backdrop |
| Hover states feel smooth | Phase 4.2 | UX judgment | Hover over buttons, verify transition |

*If none: "All phase behaviors have automated verification."*

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: grep audit is instant, no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter (requires sign-off after execution)

**Approval:** pending
