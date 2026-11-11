# Phase 6: Store Default Persistence - Research

**Researched:** 2026-03-20
**Domain:** localStorage preference persistence + form default initialization in Next.js
**Confidence:** HIGH

## Summary

Phase 6 implements DEF-01: the add-item form (QuickAddBar) should pre-select the last-used store so users adding multiple items during a shopping trip do not need to re-select the store on every item. This is a small, well-scoped feature with clear decisions captured in CONTEXT.md.

The implementation requires:
1. Adding a `storeIds` field to QuickAddBar alongside `name` and `quantity`
2. Passing the effective default store from ShoppingList (which owns filter state and localStorage access)
3. Updating the last-used store optimistically on every add/edit

**Primary recommendation:** Follow the existing `LAST_CATEGORY_KEY` localStorage pattern exactly. The cascading logic (filter store first, then last-used, then blank) is fully specified in CONTEXT.md.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- QuickAddBar gets a visible store field alongside name and quantity inputs
- Priority 1: If store filter bar is set to a specific store, use that store
- Priority 2: If filter bar is "All stores", fall back to last-used store from most recently added/edited item
- Last-used store is the `storeIds` from whichever item was most recently created or edited (not filter bar selection)
- If last-used store deleted, fall back to blank (no error, no toast)
- Store in localStorage using same pattern as `LAST_CATEGORY_KEY`
- Update persisted last-used store optimistically (before API response)

### Claude's Discretion

- Exact UI design of store field in QuickAddBar (dropdown? pill? text display with tap-to-change?)
- Whether to show a "last used: COSTCO" label or just pre-select without label
- Whether the store field appears as a third input row or a secondary tap

### Deferred Ideas (OUT OF SCOPE)

None - discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DEF-01 | Add item form defaults the store field to the last selected store | Cascading logic, localStorage key, optimistic update pattern all documented below |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js App Router | 16.1.6 | Framework | Already in use |
| React | 19.2.3 | UI library | Already in use |
| Vitest | 4.1.0 | Unit testing | Already configured |
| @testing-library/react | 16.3.2 | Component testing | Already in use |

### No New Dependencies Required

This phase requires no new libraries. All functionality is achievable with:
- Native `localStorage` API (already used for `LAST_CATEGORY_KEY`, `TRIP_STORE_FILTER_KEY`)
- Existing component patterns
- Existing UI components (Input, Button)

## Architecture Patterns

### Recommended Project Structure

```
QuickAddBar.tsx          # Add store field here, receives defaultStoreId as prop
ShoppingList.tsx         # Owns store filter state and localStorage; passes effective default down
```

### Pattern 1: localStorage Persistence with SSR Guard

**What:** Safely read/write localStorage only after mount, using `typeof window !== "undefined"` guard.

**When to use:** Any client-only preference that needs to persist across sessions.

**Example (from ShoppingList.tsx):**
```typescript
function readStoreFilter() {
  if (typeof window === "undefined") {
    return ALL_STORES_FILTER;
  }
  return window.localStorage.getItem(TRIP_STORE_FILTER_KEY) ?? ALL_STORES_FILTER;
}
```

**Reuse for this phase:** `LAST_STORE_KEY = "shopping-last-store"` following the established `SCREAMING_SNAKE_CASE` naming convention.

### Pattern 2: Optimistic Local Storage Update

**What:** Persist user intent locally before the API confirms, so the next action benefits immediately.

**When to use:** When local state update and server sync could race.

**Example (from ShoppingList.tsx handleAdd):**
```typescript
// Optimistic: update localStorage immediately after successful API call
if (fallbackCategoryId && typeof window !== "undefined") {
  window.localStorage.setItem(LAST_CATEGORY_KEY, fallbackCategoryId);
}
```

**Key insight:** The CONTEXT.md specifies optimistic update "before API response" for the last-used store. This means `window.localStorage.setItem(LAST_STORE_KEY, storeId)` should be called immediately after creating the optimistic item, not waiting for the API response.

### Pattern 3: Cascading Default with Deletion Fallback

**What:** Resolve a default value by trying sources in priority order, silently falling back to blank if the preferred source is invalid.

**When to use:** Smart defaults that reference user-managed data (stores can be deleted).

**Logic for this phase (from CONTEXT.md):**
```
effectiveStore = selectedStoreId !== ALL_STORES_FILTER
                   ? selectedStoreId                           // Priority 1: filter bar
                   : (lastUsedStoreId if store still exists)   // Priority 2: last-used
                   ?? null                                     // Fallback: blank
```

### Anti-Patterns to Avoid

- **Do NOT read localStorage during SSR:** QuickAddBar is `"use client"` but ShoppingList passes the effective default as a prop after mount. Never call `localStorage.getItem` at module level or in a server component.
- **Do NOT wait for API response to persist last-used store:** This would cause a one-item delay in the default appearing. Update optimistically.
- **Do NOT show an error toast when last-used store is deleted:** CONTEXT.md explicitly says "No error, no stale value, no error toast — just blank."

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Store preference persistence | Custom storage utility | `LAST_STORE_KEY` localStorage following existing `LAST_CATEGORY_KEY` pattern | Consistent with codebase conventions, SSR-safe, no new abstraction needed |
| Default store resolution | Complex selector hook | Simple inline logic in ShoppingList before passing to QuickAddBar | 2-line cascading logic does not warrant a hook |
| Store deletion handling | Toast notification or error state | Null/blank fallback | CONTEXT.md specifies silent fallback |

## Common Pitfalls

### Pitfall 1: SSR localStorage Access
**What goes wrong:** `window.localStorage` is undefined during server-side rendering, causing a crash.
**Why it happens:** QuickAddBar is marked `"use client"` but Next.js still evaluates it during SSR in some contexts.
**How to avoid:** ShoppingList already uses `preferencesLoaded` state gate. The effective default should be computed in ShoppingList after mount, not in QuickAddBar directly.
**Warning signs:** `localStorage is not defined` in error logs.

### Pitfall 2: Stale localStorage Reference After Store Deletion
**What goes wrong:** User deletes a store that is still referenced as the last-used store, then the default shows a non-existent store.
**Why it happens:** No validation that the stored storeId still exists in the current `stores` array.
**How to avoid:** Validate: `stores.some(s => s.id === storedStoreId)` before using. If false, fall back to blank.
**Warning signs:** Items being created with invalid storeIds (visible as missing store tags in ItemRow).

### Pitfall 3: One-Item Delay in Default Update
**What goes wrong:** User adds an item with store A, then immediately adds another item expecting store A as default, but gets blank because the update only happened after API response.
**Why it happens:** Per CONTEXT.md, update must be optimistic (before API response), but implementer mistakenly puts it in the `.then()` or after fetch.
**How to avoid:** Set `window.localStorage.setItem(LAST_STORE_KEY, storeId)` immediately after creating the optimistic tempItem, before the fetch call.
**Warning signs:** First item after a store selection defaults correctly, second item does not.

### Pitfall 4: Incorrect Priority in Cascading Logic
**What goes wrong:** Priority 1 (filter store) and Priority 2 (last-used) get reversed, or "All stores" is not properly handled.
**Why it happens:** The cascading logic has a subtle condition: only use filter store if it is NOT "All stores".
**How to avoid:** Use explicit constant: `const ALL_STORES_FILTER = "all"`. The check must be `selectedStoreId !== ALL_STORES_FILTER`.
**Warning signs:** When filter is "All stores", items get blank store instead of last-used.

## Code Examples

### Adding storeIds to QuickAddBar Props

```typescript
// QuickAddBar.tsx - current signature
interface QuickAddBarProps {
  onAdd: (values: { name: string; quantity: string | null }) => void;
}

// New signature - adds optional defaultStoreId
interface QuickAddBarProps {
  onAdd: (values: { name: string; quantity: string | null; storeIds: string[] }) => void;
  defaultStoreId: string | null;  // null means blank (no pre-selection)
  stores: Store[];                // needed to build dropdown options
}
```

### Cascading Default Resolution (in ShoppingList)

```typescript
// Compute effective default store for QuickAddBar
function getEffectiveDefaultStore(selectedStoreId: string, lastUsedStoreId: string | null, stores: Store[]): string | null {
  // Priority 1: filter bar set to specific store
  if (selectedStoreId !== ALL_STORES_FILTER) {
    return selectedStoreId;
  }
  // Priority 2: last-used store (if it still exists)
  if (lastUsedStoreId && stores.some(s => s.id === lastUsedStoreId)) {
    return lastUsedStoreId;
  }
  // Fallback: blank
  return null;
}
```

### Persisting Last-Used Store on Add (Optimistic)

```typescript
// In handleAdd, after creating tempItem but before fetch:
const effectiveStoreId = /* resolved default */;
if (effectiveStoreId && typeof window !== "undefined") {
  window.localStorage.setItem(LAST_STORE_KEY, effectiveStoreId);
}
```

### Persisting Last-Used Store on Edit (When storeIds Changes)

```typescript
// In handleUpdate, when storeIds is part of updates:
if (updates.storeIds && updates.storeIds.length > 0) {
  const newStoreId = updates.storeIds[0]; // use first store as "the" store
  if (typeof window !== "undefined") {
    window.localStorage.setItem(LAST_STORE_KEY, newStoreId);
  }
}
```

### QuickAddBar Store Field UI (Claude's Discretion - One Approach)

```tsx
// Option: dropdown select as third input in the flex row
<select
  aria-label="Store"
  value={selectedStoreId}
  onChange={(e) => setSelectedStoreId(e.target.value)}
  className="w-28 shrink-0 rounded-md border border-input bg-background px-2 py-2 text-sm"
>
  <option value="">No store</option>
  {stores.map(store => (
    <option key={store.id} value={store.id}>{store.name}</option>
  ))}
</select>
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Add item had no store field | Store dropdown added to QuickAddBar | Phase 6 | Items can be tagged at add time, not only via edit dialog |
| No last-used store tracking | localStorage tracks last-used storeId | Phase 6 | Faster multi-item add during a shopping trip |

**No deprecated patterns being replaced.** This phase adds new capability without removing existing patterns.

## Open Questions

1. **Store field UI type:** Dropdown (`<select>`) is simplest and most accessible. A pill-based picker could look nicer but adds complexity. Recommendation: start with `<select>` for simplicity, matches existing category dropdown pattern in ItemRow edit dialog.

2. **Should last-used store be updated on edit even if stores didn't change?** CONTEXT.md says "when storeIds changes" in the context of edit. However, editing an item and confirming the same store could still count as a "last used" refresh for that store. The conservative approach is: only update on explicit store change, which is already specified.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.0 + @testing-library/react 16.3.2 |
| Config file | vitest.config.ts (if exists) or inline in package.json |
| Quick run command | `npx vitest run src/app/(app)/dashboard/__tests__/QuickAddBar.test.tsx` |
| Full suite command | `npx vitest run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DEF-01a | QuickAddBar renders store dropdown | unit | `npx vitest run src/app/(app)/dashboard/__tests__/QuickAddBar.test.tsx` | YES |
| DEF-01b | QuickAddBar pre-selects defaultStoreId prop | unit | `npx vitest run src/app/(app)/dashboard/__tests__/QuickAddBar.test.tsx` | NO - needs update |
| DEF-01c | handleAdd uses filter store as Priority 1 default | integration | `npx vitest run src/app/(app)/dashboard/__tests__/ShoppingList.test.tsx` | NO - needs update |
| DEF-01d | handleAdd falls back to last-used store when filter is "All" | integration | `npx vitest run src/app/(app)/dashboard/__tests__/ShoppingList.test.tsx` | NO - needs update |
| DEF-01e | Last-used store persisted optimistically on add | unit | `npx vitest run src/app/(app)/dashboard/__tests__/ShoppingList.test.tsx` | NO - needs update |
| DEF-01f | Deleted store falls back to blank | unit | `npx vitest run src/app/(app)/dashboard/__tests__/ShoppingList.test.tsx` | NO - needs update |
| DEF-01g | handleUpdate persists last-used store when storeIds changes | unit | `npx vitest run src/app/(app)/dashboard/__tests__/ShoppingList.test.tsx` | NO - needs update |

### Wave 0 Gaps
- [ ] `src/app/(app)/dashboard/__tests__/QuickAddBar.test.tsx` — update to cover storeIds in onAdd call and defaultStoreId pre-selection
- [ ] `src/app/(app)/dashboard/__tests__/ShoppingList.test.tsx` — add tests for store default cascading, optimistic persistence, and deletion fallback

Existing test infrastructure covers the project well. No framework installation needed.

## Sources

### Primary (HIGH confidence)
- ShoppingList.tsx - localStorage pattern (LAST_CATEGORY_KEY, readStoreFilter, preferencesLoaded gate)
- QuickAddBar.tsx - current add-item form structure
- ItemRow.tsx - store display (2-letter abbreviation) and store selection UI pattern (checkbox list)
- Vitest existing config confirmed in package.json

### Secondary (MEDIUM confidence)
- CONTEXT.md - all decisions from discuss-phase (authoritative for this phase)

### Tertiary (LOW confidence)
- None required - all patterns verified in codebase

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - uses existing test framework, no new dependencies
- Architecture: HIGH - patterns directly from codebase (LAST_CATEGORY_KEY, preferencesLoaded)
- Pitfalls: HIGH - all identified from existing code review

**Research date:** 2026-03-20
**Valid until:** 2026-04-20 (localStorage patterns are stable in Next.js)
