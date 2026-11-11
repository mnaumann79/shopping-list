# Phase 5: Compact Item Row - Context

**Gathered:** 2026-03-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Redesign the ItemRow component so each item displays as a compact, scannable single-line row showing name, quantity, store tag, and notes preview — without any tap required. Editing is triggered by a trailing icon. The edit form moves to a modal. Consistent row height between checked and unchecked states. Requirements VIS-01 and VIS-02.

</domain>

<decisions>
## Implementation Decisions

### Row content layout
- Columnar layout — each field (name, quantity, store, notes) has a fixed-width column so all rows align visually like a table
- Name column truncates with ellipsis if too long
- Other columns (quantity, store, notes) also truncate independently if needed
- Notes column only appears when a note exists — no reserved blank space for empty notes
- All on a single line; no wrapping

### Edit trigger
- Trailing pencil icon on the right edge of every row — always visible
- Tapping the row body (anywhere except the icon) toggles checked/unchecked
- Tapping the pencil icon opens the edit form
- Both touch targets must meet 44px minimum on a 390px mobile viewport

### Edit form placement
- Edit form opens as a modal (using existing `dialog.tsx` — no new component needed)
- Form content is identical to the current inline expanded form

### Checked state appearance
- Checked items: all text gets strikethrough + shifts to `text-muted-foreground`
- Same row height as unchecked — no height change on check
- No structural difference between checked/unchecked rows

### Claude's Discretion
- Exact column width proportions (flex or fixed px) — choose what works at 390px
- Whether to use a Shadcn Sheet variant or style the existing Dialog to appear bottom-anchored
- Notes preview truncation character length

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` — VIS-01 (compact single-line rows), VIS-02 (consistent row height checked/unchecked)

### Existing implementation
- `src/app/(app)/dashboard/_components/ItemRow.tsx` — current row implementation to be redesigned
- `src/app/(app)/dashboard/_components/ShoppingList.tsx` — parent; renders ItemRow instances, passes stores/categories

No external ADRs — requirements fully captured in decisions above.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/components/ui/dialog.tsx` — Shadcn Dialog; use for the edit modal (no Sheet component installed)
- `src/components/ui/button.tsx` — ghost + icon-sm variant for the trailing pencil icon
- `src/components/ui/input.tsx` — already used in the edit form
- Lucide `Pencil` icon — already imported in ItemRow

### Established Patterns
- 44px touch target: `min-h-[44px]` on interactive elements (established in Phase 4.1)
- Semantic color tokens: `text-foreground`, `text-muted-foreground`, `bg-background`, `border-border` — no hardcoded colors
- Optimistic update pattern: existing `handleUpdate` / `handleToggleChecked` in ShoppingList — no change needed

### Integration Points
- `ItemRow.tsx` is self-contained; ShoppingList renders it and passes handlers — no ShoppingList changes expected
- Edit save path: `onUpdate(id, updates)` callback stays the same; modal just replaces the inline expansion

</code_context>

<specifics>
## Specific Ideas

- Row mockup confirmed during discussion:
  ```
  [ ] Pasta    x2  Costco  whole wheat  [✎]
  [ ] Olive oil x1  Trader Joe's         [✎]
  [✓] ̶B̶a̶n̶a̶n̶a̶s̶      no store             [✎]  ← muted + strikethrough
  ```
- "Neat when you have many items" — columnar alignment is the key visual goal; each field in its own fixed-width slot

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 05-compact-item-row*
*Context gathered: 2026-03-19*
