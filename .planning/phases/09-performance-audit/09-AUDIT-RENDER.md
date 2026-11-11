# React Render Audit (PERF-02)

**Date:** 2026-03-24
**Profiler:** React DevTools Profiler browser extension

## ShoppingList Render Analysis

### State Management Pattern

ShoppingList manages 6 independent pieces of state via separate useState calls:

| State | Initial Value | Purpose |
|-------|---------------|---------|
| `items` | `initialItems` | All shopping list items |
| `categoryList` | `categories` | Available categories |
| `selectedStoreId` | `"all"` | Active store filter |
| `organizationMode` | `"category"` | Grouping mode (category/alphabetical/store) |
| `lastClearedItems` | `[]` | Snapshot for undo functionality |
| `preferencesLoaded` | `false` | localStorage hydration flag |

Any state change triggers a ShoppingList re-render. The component computes derived data (filteredItems, activeItems, completedItems, alphabeticalItems, groupedActiveItems) inline during each render, meaning no memoization of expensive computations.

### useEffect Hooks

Three separate useEffect hooks handle localStorage persistence:

1. **Lines 264-272:** Hydrates `selectedStoreId` and `organizationMode` from localStorage on mount (depends on `stores`)
2. **Lines 274-281:** Persists `selectedStoreId` and `organizationMode` to localStorage when they change (depends on `preferencesLoaded`, `selectedStoreId`, `organizationMode`)
3. **Lines 283-293:** Auto-resets `selectedStoreId` to "all" when the selected store has no active unchecked items (depends on `items`, `selectedStoreId`)

The second effect (persistence) fires on every `selectedStoreId` or `organizationMode` change, and because it depends on `preferencesLoaded`, it only activates after initial localStorage hydration.

### Observed Render Behavior

From the flamechart profiler session:

- **ShoppingList rendered 18 times** during a typical interaction session
- Re-renders triggered by: store filter changes, organization mode changes, item mutations (add/update/toggle/delete/clear), and the cascading effect of those mutations
- Each item mutation (`handleAdd`, `handleUpdate`, `handleToggleChecked`, `handleDelete`) calls `setItems`, which triggers ShoppingList re-render
- After ShoppingList re-renders, all 6 derived computations (`filteredItems`, `activeItems`, `completedItems`, `alphabeticalItems`, `groupedActiveItems`, `selectedStoreName`, `storesWithItems`, `visibleStores`, `effectiveDefaultStoreId`) are recomputed from scratch

## ItemRow Render Analysis

### Local State Pattern

ItemRow maintains 9 pieces of local state:

| State | Initial Value | Synced via useEffect |
|-------|---------------|---------------------|
| `isEditing` | `false` | No |
| `isViewingNote` | `false` | No |
| `name` | `item.name` | Yes (line 66) |
| `quantity` | `item.quantity ?? ""` | Yes (line 67) |
| `note` | `item.note ?? ""` | Yes (line 68) |
| `categoryId` | `item.categoryId ?? ""` | Yes (line 69) |
| `selectedStoreIds` | `item.storeIds ?? []` | Yes (line 70) |
| `showNewCategoryInput` | `false` | No |
| `newCategoryName` | `""` | No |
| `creatingCategory` | `false` | No |

The useEffect at lines 65-71 syncs all form-field state with the `item` prop on every prop change:

```typescript
useEffect(() => {
  setName(item.name);
  setQuantity(item.quantity ?? "");
  setNote(item.note ?? "");
  setCategoryId(item.categoryId ?? "");
  setSelectedStoreIds(item.storeIds ?? []);
}, [item]);
```

This runs even when the `item` prop is reference-equal (same item, no actual changes), because the effect has `[item]` as its dependency and React cannot distinguish "same item" from "new item reference" without custom comparison.

### Missing Optimizations

1. **No React.memo**: ItemRow is not wrapped in `React.memo`, so it re-renders whenever its parent (ShoppingList) re-renders, regardless of whether the `item` prop actually changed.

2. **Unstable callback references**: ShoppingList passes `handleUpdate`, `handleToggleChecked`, `handleDelete`, and `handleCategoryCreated` as plain functions to each ItemRow. These are recreated on every ShoppingList render, causing ItemRow to receive "new" function references even when the functions are behaviorally identical.

3. **No prop shallow comparison**: Even if React.memo were added, the callbacks would still be new references on every ShoppingList render.

### Observed Render Behavior

From the flamechart profiler session, ItemRow components rendered with counts of: 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23, 25, 27 renders.

The odd-numbered render counts suggest:
- A typical interaction (click to toggle, click to edit, click to save) triggers multiple renders per item
- When one item changes, all ItemRows re-render due to ShoppingList re-render + new callback references
- The useEffect in each ItemRow runs after every parent re-render, even when the item data is unchanged

**Cascade example:** Clicking the checkbox on one ItemRow:
1. ItemRow calls `onToggleChecked(item.id, !item.isChecked)`
2. ShoppingList's `handleToggleChecked` calls `setItems(...)` with a new items array
3. ShoppingList re-renders
4. All ItemRows receive new callback references
5. All ItemRows re-render (even though only one item changed)
6. Each ItemRow's useEffect fires (item reference changed OR callback reference changed)
7. Unnecessary local state updates in all ItemRows

## Render Hotspots

| Component | Render Count (typical session) | Primary Trigger | Unnecessary? |
|-----------|-------------------------------|-----------------|--------------|
| ShoppingList | 18 | Any state change (items, store filter, org mode) | Yes — many derived computations could be memoized |
| ItemRow (single item, active session) | 3-27 (varies by position) | Parent re-render + new callback refs + useEffect sync | Yes — would be 1-2 with React.memo + stable callbacks |

## Key Optimization Opportunities

### High Priority

1. **Wrap ItemRow in React.memo (ItemRow.tsx line 44)**
   - Add `React.memo` to the ItemRow export
   - Add a custom comparison function that checks `item.id`, `item.name`, `item.quantity`, `item.note`, `item.categoryId`, `item.isChecked`, `item.storeIds` equality
   - Prevents re-render when parent re-renders but item data is unchanged
   - **Estimated reduction:** 50-70% fewer ItemRow renders

2. **Memoize ShoppingList derived computations (ShoppingList.tsx lines 295-302)**
   - `filteredItems`, `activeItems`, `completedItems`, `alphabeticalItems`, `groupedActiveItems` are recomputed on every render
   - Wrap in `useMemo` with proper dependency arrays
   - **Estimated reduction:** Faster ShoppingList renders, fewer downstream effects

3. **Stabilize ItemRow callback references using useCallback (ShoppingList.tsx lines 318-465)**
   - `handleUpdate`, `handleToggleChecked`, `handleDelete`, `handleCategoryCreated` are recreated on every render
   - Wrap each in `useCallback` with stable dependencies
   - Combine with React.memo on ItemRow for maximum effect
   - **Estimated reduction:** Eliminates callback-change-induced ItemRow re-renders

### Medium Priority

4. **Consolidate ShoppingList useEffect hooks**
   - Three separate useEffect hooks manage localStorage
   - Can be combined into one with clearer dependencies
   - Reduces effect execution count

5. **Add preferencesLoaded guard to reduce early renders**
   - Before `preferencesLoaded` is true, the component renders with default values then immediately re-renders with localStorage values
   - Could use a loading state or Suspense boundary to prevent double render

## Recommendations for Phase 10

Top 3 render optimizations to implement based on findings:

1. **React.memo + useCallback for ItemRow/ShoppingList interaction**
   - Wrap ItemRow in `React.memo` with custom prop comparison
   - Wrap mutation callbacks in `useCallback`
   - This addresses the most severe render cascade: one item change causing all items to re-render

2. **useMemo for ShoppingList derived computations**
   - Memoize `filteredItems`, `activeItems`, `completedItems`, `groupedActiveItems`, `alphabeticalItems`
   - Particularly important for `groupedActiveItems` which calls `groupByCategory` or `groupByStore` on every render

3. **Eliminate ItemRow local state duplication**
   - The useEffect sync pattern (lines 65-71 in ItemRow) runs on every prop change
   - Consider controlled component pattern: ItemRow accepts current values as props and calls back on change
   - This would eliminate the local state entirely, halving the render work in ItemRow
