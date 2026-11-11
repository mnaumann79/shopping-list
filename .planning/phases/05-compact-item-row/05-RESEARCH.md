# Phase 5: Compact Item Row - Research

**Researched:** 2026-03-19
**Domain:** React component redesign — flex layout, Shadcn/base-ui Dialog, Tailwind CSS, touch target compliance
**Confidence:** HIGH

## Summary

Phase 5 is a focused redesign of one component: `ItemRow.tsx`. The current implementation renders items with a two-section card (a toggle button and a separate edit button row below it), and expands to an inline form on edit. The new design collapses everything into a single-line flex row with columnar fields, moving the edit form into a Dialog modal.

All dependencies are already installed. No new packages, no new Shadcn components needed. The Dialog component (`dialog.tsx`) uses `@base-ui/react/dialog` — not Radix — so the open/close API uses `open`/`onOpenChange` props on the `Dialog` root. The Button component uses `@base-ui/react/button` and does not implement `asChild`, so pencil-trigger wiring uses a wrapper pattern.

The primary implementation risk is the interaction model split: the row body must toggle checked state, while the trailing icon zone must open the modal, and neither action should trigger the other. This requires careful event propagation handling (`e.stopPropagation()` on the pencil button click).

**Primary recommendation:** Rewrite `ItemRow.tsx` in one atomic task. The component shrinks significantly — the inline expansion and its state management is removed, replaced by a Dialog. Keep the same props interface so ShoppingList.tsx requires no changes.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Columnar layout — each field (name, quantity, store, notes) has a fixed-width column so all rows align visually like a table
- Name column truncates with ellipsis if too long
- Other columns (quantity, store, notes) also truncate independently if needed
- Notes column only appears when a note exists — no reserved blank space for empty notes
- All on a single line; no wrapping
- Trailing pencil icon on the right edge of every row — always visible
- Tapping the row body (anywhere except the icon) toggles checked/unchecked
- Tapping the pencil icon opens the edit form
- Both touch targets must meet 44px minimum on a 390px mobile viewport
- Edit form opens as a modal (using existing `dialog.tsx` — no new component needed)
- Form content is identical to the current inline expanded form
- Checked items: all text gets strikethrough + shifts to `text-muted-foreground`
- Same row height as unchecked — no height change on check
- No structural difference between checked/unchecked rows

### Claude's Discretion
- Exact column width proportions (flex or fixed px) — choose what works at 390px
- Whether to use a Shadcn Sheet variant or style the existing Dialog to appear bottom-anchored
- Notes preview truncation character length

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| VIS-01 | Shopping list items display as compact single-line rows showing name, quantity, store tag, and notes preview | Columnar flex layout with `truncate` per column; Dialog replaces inline expansion; all content always visible |
| VIS-02 | Item row height is consistent between checked and unchecked states | `min-h-[44px]` on the row container; no conditional height or padding change on check; only CSS class swap for text styling |
</phase_requirements>

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@base-ui/react/dialog` | ^1.3.0 (installed) | Dialog modal for edit form | Already used in `dialog.tsx`; this project's UI primitive layer |
| `@base-ui/react/button` | ^1.3.0 (installed) | Button primitives | Already used in `button.tsx` |
| `lucide-react` | ^0.577.0 (installed) | Pencil and Trash2 icons | Already imported in ItemRow |
| Tailwind CSS v4 | ^4 (installed) | Utility classes for layout | Project standard |
| `class-variance-authority` | ^0.7.1 (installed) | Button variant system | Already wired into button.tsx |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `sonner` | ^2.0.7 (installed) | `toast("Item removed")` | On delete in modal |
| `src/components/ui/dialog.tsx` | local | Pre-built Dialog wrapper | All modal container needs |
| `src/components/ui/button.tsx` | local | Ghost + icon-sm for pencil | Trailing icon button |
| `src/components/ui/input.tsx` | local | Name + quantity fields in modal | Already used in edit form |

No new installations needed. All components verified present.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `Dialog` (centered) | `Sheet` (bottom drawer) | Sheet not installed; Dialog already present; centered modal is the locked decision |
| CSS `truncate` | JS string slicing | CSS truncation is cleaner and requires no character-count logic |
| Separate row-body `<button>` + icon `<button>` | Single `<div>` with click zones | Two buttons is semantically correct and avoids nested interactive element issues |

**Installation:** No installation needed — all dependencies are present.

---

## Architecture Patterns

### Recommended Component Structure

The rewritten `ItemRow.tsx` needs two logical sections internally:

```
ItemRow (function component)
├── Row (outer div, border + bg)
│   ├── Row body button (flex row, min-h-[44px], onClick → toggleChecked)
│   │   ├── Checkbox hit zone (shrink-0, 44px)
│   │   ├── Name column (flex-1 min-w-0, truncate)
│   │   ├── Quantity column (shrink-0, hidden when empty)
│   │   ├── Store tag column (shrink-0, hidden when no stores)
│   │   ├── Notes preview column (shrink-0, hidden when no note)
│   │   └── Pencil button (shrink-0, stopPropagation, opens Dialog)
└── Dialog (controlled by isEditing state)
    └── DialogContent
        ├── DialogHeader > DialogTitle "Edit item"
        ├── Edit form fields (identical to current inline form)
        └── DialogFooter (Delete left, Discard + Save right)
```

### Pattern 1: Split Row Body vs. Icon Click Zones

**What:** The entire row is a `<button>` for toggling checked state. The pencil icon is a second `<button>` inside, which calls `e.stopPropagation()` to prevent the row button from also firing.

**When to use:** When one interactive element is nested inside another with different actions.

**Example:**
```tsx
// Row body button — toggles checked
<button
  type="button"
  className="flex w-full items-center gap-2 min-h-[44px] px-4"
  aria-label={item.name}
  onClick={() => onToggleChecked(item.id, !item.isChecked)}
>
  {/* columns */}
  <button
    type="button"
    aria-label={`Edit ${item.name}`}
    className="shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center"
    onClick={(e) => {
      e.stopPropagation();
      setIsEditing(true);
    }}
  >
    <Pencil className="size-4" />
  </button>
</button>
```

Note: Nested `<button>` inside `<button>` is invalid HTML. The correct pattern wraps the outer in a `<div>` (or uses a different role) and makes both the row body area and the pencil independently focusable. See Anti-Patterns below.

### Pattern 2: Controlled Dialog via Local State

**What:** Dialog open/close is controlled by a single `isEditing` boolean state in ItemRow. Opening resets all form fields to current item values (same as the existing `handleExpand` reset logic).

**When to use:** Any Dialog that is only ever opened from one place in the same component.

**Example:**
```tsx
const [isEditing, setIsEditing] = useState(false);

function handleEditOpen() {
  // Reset form state to current item
  setName(item.name);
  setQuantity(item.quantity ?? "");
  setNote(item.note ?? "");
  setCategoryId(item.categoryId ?? "");
  setSelectedStoreIds(item.storeIds ?? []);
  setShowNewCategoryInput(false);
  setNewCategoryName("");
  setIsEditing(true);
}

<Dialog open={isEditing} onOpenChange={setIsEditing}>
  <DialogContent>
    {/* form */}
  </DialogContent>
</Dialog>
```

**@base-ui/react Dialog API note:** The Dialog root accepts `open` and `onOpenChange` props. `DialogContent` renders as `DialogPrimitive.Popup`. Closing via backdrop or Escape key triggers `onOpenChange(false)` automatically — no manual wiring needed.

### Pattern 3: Columnar Flex Row with Conditional Columns

**What:** A single `flex items-center` row where optional columns (`quantity`, `store`, `notes`) are conditionally rendered (not just hidden) when their data is absent.

**When to use:** When empty columns must not reserve space (notes column decision in CONTEXT.md).

**Example:**
```tsx
<div className="flex flex-1 items-center gap-2 min-w-0">
  <span className="flex-1 min-w-0 truncate text-sm font-medium">
    {item.name}
  </span>
  {item.quantity && (
    <span className="shrink-0 w-10 truncate text-xs text-muted-foreground">
      x{item.quantity}
    </span>
  )}
  {firstStore && (
    <span className="shrink-0 max-w-[80px] truncate rounded bg-muted px-2 py-1 text-xs text-muted-foreground">
      {firstStore.name}
      {extraStoreCount > 0 && ` +${extraStoreCount}`}
    </span>
  )}
  {item.note && (
    <span className="shrink-0 max-w-[72px] truncate text-xs text-muted-foreground">
      {item.note}
    </span>
  )}
</div>
```

### Pattern 4: Checked State via Conditional Class on Text Container

**What:** A single wrapper `div` around all text columns gets `line-through text-muted-foreground` added when `item.isChecked` is true. Row height and structure are unchanged.

**Example:**
```tsx
<div className={cn(
  "flex flex-1 items-center gap-2 min-w-0",
  item.isChecked && "line-through text-muted-foreground"
)}>
  {/* all text columns */}
</div>
```

The store tag `bg-muted` chip class is structural, not a text color, so it survives the inherited `text-muted-foreground` gracefully.

### Anti-Patterns to Avoid

- **Nested `<button>` inside `<button>`:** Invalid HTML. Use a `<div role="button" tabIndex={0}>` for the outer row body, or restructure as a `<div>` containing two sibling buttons (row-body zone + pencil zone). The cleaner approach: outer wrapper is a plain `<div>`, row body area is a `<button>` (flex-1), pencil is a separate `<button>` (shrink-0). Both are siblings, no nesting.
- **Reserving blank column space for empty fields:** The notes column must be `{item.note && (...)}` — not `{item.note ? ... : <span className="w-[72px]" />}`. Empty space breaks the visual alignment goal.
- **Hardcoded color classes:** Never use `text-gray-400` or similar. Always `text-muted-foreground`, `text-foreground`, `bg-muted`, etc.
- **Toggling `expanded` state instead of `isEditing`:** The old inline expansion pattern (`expanded`) must be fully removed. The only edit trigger is the Dialog.
- **`onOpenChange` not hooked up:** If `onOpenChange` is omitted from the Dialog root, the backdrop click and Escape key will not close the modal. Always pass `onOpenChange={setIsEditing}`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Modal overlay with backdrop | Custom positioned div + backdrop div | `Dialog` from `dialog.tsx` | Focus trap, Escape key, backdrop click, accessibility all handled |
| Text overflow/truncation | JS substring + ellipsis string | CSS `truncate` (`overflow-hidden text-ellipsis whitespace-nowrap`) | Browser handles resize, no JS needed |
| Store chip with overflow count | Complex logic from scratch | Derive `firstStore` and `extraStoreCount` from `item.storeIds` array inline | Simple two-line derivation |
| Touch target expansion | Custom overlay div | `min-h-[44px] min-w-[44px]` with `flex items-center justify-center` padding | CSS-only, no JS |

**Key insight:** The existing `handleSave`, `handleCancel`, `handleCreateCategory`, and all form field state in the current ItemRow are reusable verbatim — only the trigger mechanism (pencil → Dialog instead of inline expansion) changes.

---

## Common Pitfalls

### Pitfall 1: Nested Button HTML Invalidity
**What goes wrong:** Placing `<button>` (pencil) inside `<button>` (row body) produces invalid HTML and inconsistent browser behavior — some browsers collapse the inner button, some fire both click handlers.
**Why it happens:** The row body naturally wants to be a button for semantics, and the pencil naturally wants to be a button too.
**How to avoid:** Use a `<div>` as the row container. Place the row-body `<button>` (flex-1) and pencil `<button>` (shrink-0) as siblings inside it.
**Warning signs:** Click events firing unexpectedly; browser dev tools showing button nesting violations.

### Pitfall 2: Dialog Not Resetting Form on Open
**What goes wrong:** Opening the modal a second time shows stale values from the previous edit session if form state was modified but not saved.
**Why it happens:** `isEditing` going from `false` to `true` does not reset React state by itself.
**How to avoid:** Reset all form fields inside `handleEditOpen()` before setting `isEditing(true)` — mirror the existing `handleExpand` reset block.
**Warning signs:** Edit modal shows wrong values after cancelling an edit and reopening.

### Pitfall 3: Store Tag `py-1` Causing Row Height Shift
**What goes wrong:** The `py-1` (4px vertical padding) on the store tag chip adds height to the chip. If the chip is taller than the `min-h-[44px]` row, it causes height inconsistency.
**Why it happens:** `min-h` sets a floor, but tall children can exceed it.
**How to avoid:** The row wrapper uses `items-center` — the chip will be vertically centered within the row height. As long as the chip with `py-1 text-xs` is well under 44px tall (it is: 12px line-height + 8px padding = ~20px), this is safe. Do not add vertical padding beyond what the UI-SPEC specifies.
**Warning signs:** Row heights differ visually between items with and without store tags.

### Pitfall 4: `line-through` Inheriting Into Store Tag Chip
**What goes wrong:** Applying `line-through` to the parent flex container causes the store chip text to also show strikethrough, which looks odd against the chip background.
**Why it happens:** CSS `text-decoration` is inherited by default.
**How to avoid:** This is actually the intended behavior per the UI-SPEC ("all text gets strikethrough"). Accept it. If it looks wrong during implementation, the fix is `no-underline` on the chip span — but only change this if the user/designer explicitly objects.
**Warning signs:** Checked item store chips look visually cluttered with strikethrough.

### Pitfall 5: Existing Tests Breaking on Role/Name Changes
**What goes wrong:** The existing `ItemRow.test.tsx` queries by `role="button" name=/^Milk$/i` for the row body, and `name=/edit/i` for the edit trigger. The new compact row restructures these elements.
**Why it happens:** Tests use ARIA queries that couple to specific element structure.
**How to avoid:** Update tests alongside the implementation. The row body button will still have `aria-label={item.name}`. The pencil button will have `aria-label={`Edit ${item.name}`}`. Tests querying for "edit" by name will still work if the aria-label is set correctly. The "Cancel" and "Save" buttons move into the Dialog — tests opening the modal first will still find them.
**Warning signs:** Test suite fails with "element not found" after implementation.

---

## Code Examples

Verified patterns from the existing codebase:

### Dialog Open/Close (from `dialog.tsx`)
```tsx
// Source: src/components/ui/dialog.tsx
// @base-ui/react Dialog uses open + onOpenChange props
<Dialog open={isEditing} onOpenChange={setIsEditing}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Edit item</DialogTitle>
    </DialogHeader>
    {/* form fields */}
    <DialogFooter>
      {/* footer content */}
    </DialogFooter>
  </DialogContent>
</Dialog>
```

### DialogFooter Layout with Delete Left, Actions Right
```tsx
// DialogFooter default: flex flex-col-reverse gap-2 sm:flex-row sm:justify-end
// To put delete on the left: use justify-between override or absolute positioning
<DialogFooter className="flex-row items-center justify-between">
  <Button variant="ghost" size="icon-sm" className="text-destructive" onClick={handleDelete}>
    <Trash2 className="size-4" />
    <span className="sr-only">Delete</span>
  </Button>
  <div className="flex gap-2">
    <Button variant="outline" size="sm" onClick={handleDiscard}>
      Discard changes
    </Button>
    <Button variant="default" size="sm" onClick={handleSave}>
      Save changes
    </Button>
  </div>
</DialogFooter>
```

Note: The default `DialogFooter` uses `flex-col-reverse sm:flex-row sm:justify-end`. For the Delete-left / Actions-right layout, override with `className="flex-row items-center justify-between"`.

### 44px Touch Target for Pencil Icon (from UI-SPEC)
```tsx
// Source: 05-UI-SPEC.md — icon-sm (28px) wrapped in 44px tap zone
<button
  type="button"
  aria-label={`Edit ${item.name}`}
  className="flex shrink-0 items-center justify-center min-h-[44px] min-w-[44px]"
  onClick={(e) => {
    e.stopPropagation();
    handleEditOpen();
  }}
>
  <Pencil className="size-4" />
</button>
```

### Checked State Styling Pattern (from existing ItemRow.tsx)
```tsx
// Source: src/app/(app)/dashboard/_components/ItemRow.tsx line 189
// Pattern confirmed — extend to the column wrapper div
<div className={`flex flex-1 items-center gap-2 min-w-0 ${
  item.isChecked ? "line-through text-muted-foreground" : ""
}`}>
  {/* columns */}
</div>
```

### Store Tag Chip (from existing ItemRow.tsx and UI-SPEC)
```tsx
// Source: UI-SPEC + ItemRow.tsx line 199
// Single store: show name. Multiple: show first + "+N" count.
const itemStores = (item.storeIds ?? [])
  .map((id) => stores.find((s) => s.id === id))
  .filter((s): s is Store => Boolean(s));
const firstStore = itemStores[0];
const extraCount = itemStores.length - 1;

{firstStore && (
  <span className="shrink-0 max-w-[80px] truncate rounded bg-muted px-2 py-1 text-xs text-muted-foreground">
    {firstStore.name}{extraCount > 0 ? ` +${extraCount}` : ""}
  </span>
)}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Inline expansion (toggle `expanded`) | Dialog modal | Phase 5 | Edit form no longer causes layout shift in the list |
| Edit + toggle in same button | Split row-body button + pencil button | Phase 5 | Tap anywhere to check; pencil to edit; no accidental edits |
| Store chips in second row below name | Single-line store tag column | Phase 5 | Consistent row height; visually scannable |

**Deprecated/outdated:**
- `expanded` state: removed entirely; replaced by `isEditing` for Dialog control
- Separate edit affordance row (`<div className="border-t px-4 py-2">` + Edit button): removed; pencil icon in row replaces it
- Inline form expansion below row: removed; Dialog modal replaces it

---

## Open Questions

1. **DialogFooter layout override**
   - What we know: Default DialogFooter is `flex-col-reverse sm:flex-row sm:justify-end`, which stacks buttons vertically on mobile.
   - What's unclear: Whether overriding to `flex-row justify-between` for the Delete-left / Actions-right layout will conflict with the existing `DialogFooter` component internals or the `showCloseButton` optional prop.
   - Recommendation: Override with `className="flex-row items-center justify-between"` directly. The `showCloseButton` prop defaults to `false` in DialogFooter, so no conflict.

2. **Checkbox as native `<input>` vs. visual-only div**
   - What we know: UI-SPEC specifies native `<input type="checkbox">` with `aria-label={item.name}`.
   - What's unclear: The current ItemRow does not use a native checkbox at all — it uses the row button's `onClick` to toggle. Adding a real checkbox introduces a second interactive element inside the row body.
   - Recommendation: Keep the native checkbox approach from the UI-SPEC for accessibility. Place the `<input type="checkbox">` in its own `<label>` element inside the row body, and stop click propagation from the checkbox to avoid double-toggling. Alternatively, wire the checkbox `onChange` to call `onToggleChecked` and suppress the row button's onClick when the checkbox is the event target.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest ^4.1.0 + @testing-library/react ^16.3.2 |
| Config file | `vitest.config.ts` (root) |
| Quick run command | `npx vitest run src/app/(app)/dashboard/__tests__/ItemRow.test.tsx` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| VIS-01 | Row renders name, quantity, store tag, notes preview as single-line columns | unit | `npx vitest run src/app/(app)/dashboard/__tests__/ItemRow.test.tsx` | ✅ (needs updating) |
| VIS-01 | Optional columns (quantity, store, notes) hidden when data absent | unit | `npx vitest run src/app/(app)/dashboard/__tests__/ItemRow.test.tsx` | ✅ (needs new test) |
| VIS-01 | Pencil icon opens edit Dialog | unit | `npx vitest run src/app/(app)/dashboard/__tests__/ItemRow.test.tsx` | ✅ (needs updating) |
| VIS-02 | Row has `min-h-[44px]` and does not change height when checked | unit | `npx vitest run src/app/(app)/dashboard/__tests__/ItemRow.test.tsx` | ✅ (needs updating) |
| VIS-02 | Checked row applies `line-through text-muted-foreground` to text | unit | `npx vitest run src/app/(app)/dashboard/__tests__/ItemRow.test.tsx` | ✅ (exists: line 113) |

### Sampling Rate
- **Per task commit:** `npx vitest run src/app/(app)/dashboard/__tests__/ItemRow.test.tsx`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

The existing `ItemRow.test.tsx` tests are written for the **old implementation** (inline expansion, separate Edit button that toggles `expanded`). All tests that reference the old interaction model must be rewritten. Specifically:

- Tests querying `getByRole("button", { name: /edit/i })` expect inline expansion — must be rewritten to open the Dialog
- Tests querying `getByRole("button", { name: "Cancel" })` and `getByRole("button", { name: "Save" })` expect inline form buttons — must be rewritten to interact with Dialog footer buttons
- Tests asserting `queryByLabelText("Name")` not in document after cancel — same, must target Dialog closed state
- New tests needed: quantity column hidden when `item.quantity` is null; notes column hidden when `item.note` is null; store column shows "+N" when multiple stores

These test updates are Wave 0 work (alongside or immediately after the component rewrite).

---

## Sources

### Primary (HIGH confidence)
- Direct file reads: `src/app/(app)/dashboard/_components/ItemRow.tsx` — current implementation, full state and handlers
- Direct file reads: `src/components/ui/dialog.tsx` — Dialog API, component names, `@base-ui/react/dialog` usage
- Direct file reads: `src/components/ui/button.tsx` — Button variant/size API, `icon-sm` = 28px
- Direct file reads: `.planning/phases/05-compact-item-row/05-UI-SPEC.md` — spacing, color tokens, column widths, accessibility requirements
- Direct file reads: `.planning/phases/05-compact-item-row/05-CONTEXT.md` — all locked implementation decisions
- Direct file reads: `src/app/(app)/dashboard/__tests__/ItemRow.test.tsx` — existing test patterns and what will break

### Secondary (MEDIUM confidence)
- `package.json` — verified all dependencies installed at stated versions

### Tertiary (LOW confidence)
- None

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries verified present via direct file reads and package.json
- Architecture: HIGH — based on existing code patterns and locked decisions in CONTEXT.md
- Pitfalls: HIGH — derived from direct code inspection (invalid nested buttons, existing test query patterns, Dialog API)
- Test updates: HIGH — existing test file read directly; breakage points identified by comparing test queries against new interaction model

**Research date:** 2026-03-19
**Valid until:** 2026-04-19 (stable dependencies; component scope fully bounded)
