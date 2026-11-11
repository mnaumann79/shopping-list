---
phase: 05-compact-item-row
plan: 01
subsystem: dashboard/item-row
tags: [ui, component, dialog, compact-row]
dependency_graph:
  requires: []
  provides: [compact-item-row, dialog-edit-modal]
  affects: [dashboard/ShoppingList]
tech_stack:
  added: []
  patterns: [Dialog controlled open/onOpenChange, sibling buttons for row body + pencil]
key_files:
  created: []
  modified:
    - src/app/(app)/dashboard/_components/ItemRow.tsx
    - src/app/(app)/dashboard/__tests__/ItemRow.test.tsx
decisions:
  - Sibling buttons (not nested) for row body + pencil to avoid invalid HTML
  - Dialog controlled by isEditing state — no DialogTrigger needed
  - itemStores/firstStore/extraCount replaces storeChips for single-store + count display
  - handleEditOpen resets all form state on open to prevent stale edits
metrics:
  duration_minutes: 4
  completed_date: "2026-03-19"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 2
---

# Phase 05 Plan 01: Compact Item Row Summary

Rewrote `ItemRow.tsx` from a two-section card with inline expansion to a compact single-line flex row with a Dialog modal for editing, using Dialog controlled by `isEditing` state.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Rewrite ItemRow as compact single-line row with Dialog edit modal | 9d0cfa8 | ItemRow.tsx |
| 2 | Rewrite ItemRow tests for compact row + Dialog interaction model | 67a9f1e | ItemRow.test.tsx |

## Acceptance Criteria Check

- ItemRow.tsx contains `const [isEditing, setIsEditing] = useState(false)` and does NOT contain `const [expanded` — PASS
- ItemRow.tsx contains `Dialog open={isEditing} onOpenChange={setIsEditing}` — PASS
- ItemRow.tsx contains `min-h-[44px]` on the row button element — PASS
- ItemRow.tsx contains `aria-label={`Edit ${item.name}`}` on the pencil button — PASS
- ItemRow.tsx contains `line-through text-muted-foreground` conditional class on the text wrapper — PASS
- ItemRow.tsx contains `truncate` class on name, quantity, store, and notes spans — PASS
- ItemRow.tsx contains `Save changes` and `Discard changes` button labels — PASS
- ItemRow.tsx contains `DialogTitle` with text `Edit item` — PASS
- ItemRow.tsx does NOT contain `handleExpand` function — PASS
- ItemRow.tsx does NOT contain `border-t px-4 py-2` (old edit button section) — PASS
- ItemRow.tsx does NOT contain any hardcoded color classes — PASS
- ItemRow.tsx contains import of Dialog components from `@/components/ui/dialog` — PASS
- ItemRow.tsx preserves `ItemRowProps` interface unchanged — PASS
- Pencil button and row body button are siblings inside a div, NOT nested buttons — PASS
- All 16 tests pass — PASS
- Full suite (110 tests) passes — PASS
- Next.js build succeeds with no type errors — PASS

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

All files exist and commits verified.
