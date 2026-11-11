# Phase 6: Store Default Persistence - Context

**Gathered:** 2026-03-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Pre-populate the store field in the add-item form with the last-used store so users adding multiple items during a shopping trip do not need to re-select the store on every item. DEF-01 requirement.

</domain>

<decisions>
## Implementation Decisions

### Add-item store UI
- QuickAddBar gets a visible store field alongside name and quantity inputs
- Store field shows the effective default store (see "Default source" below)
- User can override the default by selecting a different store before submitting

### Default source (smart cascading logic)
- **Priority 1:** If "Store focus" filter bar is set to a specific store → use that store for new items
- **Priority 2:** If "Store focus" filter bar is set to "All stores" → fall back to the last-used store (from most recently added/edited item)
- Last-used store is the `storeIds` from whichever item was most recently created or edited (not the filter bar selection)

### Store deletion fallback
- If the last-used store has been deleted from the household → store field falls back to blank
- No error, no stale value, no error toast — just blank

### Persistence mechanism
- Store the last-used storeId in localStorage (same pattern as `LAST_CATEGORY_KEY` in ShoppingList.tsx)
- Update the persisted last-used store on every item add or item edit (when storeIds changes)

### Implementation notes (for planner)
- QuickAddBar currently has no store field — needs a third input added
- `handleAdd` in ShoppingList.tsx currently sends `{ name, quantity, categoryId }` — needs `storeIds` added
- Last-used store must be updated optimistically (before API response) so the next add benefits immediately

### Claude's Discretion
- Exact UI design of the store field in QuickAddBar (dropdown? pill? text display with tap-to-change?)
- Whether to show a "last used: COSTCO" label or just pre-select without label
- Whether the store field appears as a third input row or a secondary tap

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` — DEF-01 (store default persistence), success criteria: "falls back to blank if store deleted"

### Existing code
- `src/app/(app)/dashboard/_components/QuickAddBar.tsx` — current add-item form, needs store field added
- `src/app/(app)/dashboard/_components/ShoppingList.tsx` — `handleAdd`, localStorage pattern (LAST_CATEGORY_KEY), filter bar `selectedStoreId` state
- `src/app/(app)/dashboard/_components/ItemRow.tsx` — current store display (2-letter abbreviation per Phase 5)

No external ADRs — requirements fully captured in decisions above.

</canonical_refs>

<codebase_context>
## Existing Code Insights

### Reusable Assets
- `LAST_CATEGORY_KEY` localStorage pattern in ShoppingList.tsx — reuse for `LAST_STORE_KEY`
- `readStoreFilter()` function — shows how to safely read localStorage with SSR guard
- `stores` array passed to ShoppingList — available for building store selector dropdown

### Established Patterns
- localStorage keys: `SCREAMING_SNAKE_CASE` (Phase 4 established)
- Post-mount preference restore: `preferencesLoaded` gate pattern (Phase 4)
- Optimistic updates: `handleAdd` pattern — update UI immediately, then sync with server

### Integration Points
- `QuickAddBar.tsx`: needs new store field added alongside name/qty inputs
- `ShoppingList.tsx`: `handleAdd` needs `storeIds` param; needs to persist last-used store to localStorage
- Store filter bar (`selectedStoreId`) is already tracked — use it for Priority 1 default

</codebase_context>

<specifics>
## Specific Ideas

- "When a specific store is filtered, items should get that store automatically — that's the whole point of the filter"
- "When on 'All stores', fall back to whatever store was used last — probably what they're shopping for this week"
- Smart cascading: filter selection → last-used store → blank (if deleted)

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 06-store-default-persistence*
*Context gathered: 2026-03-20*
