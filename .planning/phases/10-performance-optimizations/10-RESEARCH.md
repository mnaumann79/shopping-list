# Phase 10: Performance Optimizations - Research

**Researched:** 2026-03-24
**Domain:** React render optimization, Next.js/Drizzle ORM data layer
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Render Optimization Approach
- **React.memo on ItemRow** — wrap with custom prop comparator checking `item.id`, `item.name`, `item.quantity`, `item.note`, `item.categoryId`, `item.isChecked`, `item.storeIds`
- **useCallback for all 4 ShoppingList mutation callbacks** — `handleUpdate`, `handleToggleChecked`, `handleDelete`, `handleCategoryCreated` must be stable references for React.memo to work
- **useMemo for all 9 derived values in ShoppingList** — `filteredItems`, `activeItems`, `completedItems`, `alphabeticalItems`, `groupedActiveItems`, `selectedStoreName`, `storesWithItems`, `visibleStores`, `effectiveDefaultStoreId`
- **No full ItemRow refactor** — do NOT eliminate the 10-state useEffect sync pattern; React.memo + useCallback is sufficient and lower risk

#### Data Fetching
- **No TanStack Query** — keep local useState; the added complexity is not justified for this app's scale
- **Fix clear-completed** — replace SELECT-then-UPDATE with a single `UPDATE ... WHERE isActive=true AND isChecked=true RETURNING *`; contained change in one API route

#### Bundle Optimization
- **Verify Lucide tree-shaking only** — run ANALYZE build and confirm icons are correctly tree-shaken
- **Do NOT replace Sonner or react-hook-form** — ~16 KB total savings don't justify regression risk
- **Render performance is the priority** — 15% bundle reduction target from REQUIREMENTS.md is secondary; deprioritize if not reachable without replacing libraries

#### Verification
- **Lighthouse score** — run before Phase 10 execution and after, compare LCP/FCP/CLS/INP
- **Manual iPhone smoke test** for regression check (add item, toggle, edit, clear completed, filter by store)
- **React DevTools Profiler** — re-run after render optimizations to confirm ItemRow render counts drop from 3-27 down to 1-2

### Claude's Discretion
- Exact useMemo dependency arrays for each derived value
- Whether to combine ShoppingList's 3 localStorage useEffect hooks into one (medium priority cleanup noted in audit)
- Order of implementation within Phase 10 plans

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| PERF-04 | Bundle optimizations — code splitting, tree shaking, dependency reduction | Lucide tree-shaking verification via ANALYZE build; Sonner/react-hook-form NOT replaced per locked decision |
| PERF-05 | Render optimizations — React.memo, useMemo, useCallback where appropriate | Full cascade analysis in audit; exact change sites identified in source; existing Vitest tests will validate no regression |
| PERF-06 | Data fetching optimizations — deduplication, caching headers, request deduplication | clear-completed SELECT-then-UPDATE fix; NOTE: storeIds constraint requires SELECT to remain (see Critical Finding) |
| PERF-07 | Core Web Vitals improvement — measure and demonstrate LCP/FCP/CLS/INP improvement | Lighthouse mobile simulation before/after comparison; loading.tsx already shipped |
| PERF-08 | No regressions — all existing UAT tests pass | Vitest suite exists with ItemRow, ShoppingList, and clear-completed route tests; must all pass |
</phase_requirements>

---

## Summary

Phase 10 implements three targeted optimizations identified in Phase 9 audits. The work is confined to three files: `ItemRow.tsx`, `ShoppingList.tsx`, and `src/app/api/items/clear-completed/route.ts`. No new dependencies, no architectural changes.

The render optimization is the highest-value change: ItemRow currently re-renders 3-27 times per typical session because (a) it has no `React.memo` wrapper, and (b) the 4 mutation callbacks it receives from ShoppingList are recreated on every ShoppingList render. These two problems compound — even wrapping in `React.memo` alone would still cause re-renders because the callback props change reference on every parent render. Both fixes must land together.

The data fetching fix (clear-completed) is simpler but has a critical constraint: the `storeIds` field returned to the client comes from the `itemStores` table via a JOIN, not from the `items` table. A pure `UPDATE ... RETURNING *` on `items` would not include `storeIds`. The fix therefore must either (a) keep a SELECT for `storeIds` but eliminate its use as a pre-update guard, or (b) use an approach that is functionally equivalent and compatible with the existing Vitest mock structure. See Critical Finding below.

**Primary recommendation:** Implement render optimizations (React.memo + useCallback + useMemo) first, then the clear-completed fix, then bundle verification. All three changes are self-contained and can be verified independently.

---

## Standard Stack

### Core (already installed — no new dependencies)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| react | 19.x | React.memo, useMemo, useCallback | Built-in; no install needed |
| vitest | ^4.1.0 | Unit test runner | Already configured in vitest.config.ts |
| @testing-library/react | ^16.3.2 | Component render tests | Already in place; ItemRow + ShoppingList tests exist |
| drizzle-orm | installed | ORM for UPDATE query | Already used throughout |
| @next/bundle-analyzer | ^16.2.1 | Bundle analysis | Already installed as dev dependency |

### Build Verification Command

```bash
ANALYZE=true npm run build -- --webpack
```

Open `.next/analyze/client.html` to inspect Lucide chunk size.

---

## Architecture Patterns

### React.memo with Custom Comparator

**What:** Wrap `ItemRow` export in `React.memo` with an `areEqual` function that compares only the `item` fields that affect rendering.

**Why custom comparator:** The `item` object reference changes on every ShoppingList render (because `setItems` creates a new array). Shallow object comparison would still fail. The comparator must compare individual fields.

**Fields to compare:** `id`, `name`, `quantity`, `note`, `categoryId`, `isChecked`, `storeIds` (array — needs element-by-element comparison or JSON.stringify).

**Pattern:**
```typescript
// ItemRow.tsx — wrap the existing export
export const ItemRow = React.memo(function ItemRow({ item, ... }: ItemRowProps) {
  // ... existing component body unchanged
}, (prev, next) => {
  return (
    prev.item.id === next.item.id &&
    prev.item.name === next.item.name &&
    prev.item.quantity === next.item.quantity &&
    prev.item.note === next.item.note &&
    prev.item.categoryId === next.item.categoryId &&
    prev.item.isChecked === next.item.isChecked &&
    prev.item.storeIds.length === next.item.storeIds.length &&
    prev.item.storeIds.every((id, i) => id === next.item.storeIds[i])
  );
});
```

**Important:** The comparator returns `true` to SKIP re-render (opposite of shouldComponentUpdate). Returning `true` means "props are equal, no update needed."

### useCallback for Mutation Handlers

**What:** Wrap the 4 mutation functions in `useCallback` with stable dependency arrays.

**Why:** Without `useCallback`, these functions are new references on every ShoppingList render, defeating React.memo on ItemRow.

**Dependency rules:**
- `handleUpdate` — depends on `items` (needs snapshot for rollback)
- `handleToggleChecked` — depends on `items` (needs snapshot for rollback)
- `handleDelete` — no dependency on items (uses functional updater `setItems(current => ...)`)
- `handleCategoryCreated` — no dependency on items (uses functional updater `setCategoryList(current => ...)`)

**Note on `handleUpdate` and `handleToggleChecked`:** Both capture `items` for the `previous` rollback variable. If `items` is in the dependency array, the callback recreates on every item change — which partially defeats the purpose. The correct approach is to use the functional form of `setItems` for the rollback too, or accept that these callbacks recreate when `items` changes (which is acceptable — the key win is that they are stable when `items` hasn't changed).

**Pattern:**
```typescript
const handleDelete = useCallback((id: string) => {
  setItems((current) => current.filter((item) => item.id !== id));
  // fetch call uses id only, no items capture needed
  fetch(`/api/items/${id}`, { method: "DELETE" }).catch(() => {
    // rollback needs previous — see note above
  });
}, []); // empty deps if rollback uses functional updater

const handleCategoryCreated = useCallback((category: Category) => {
  setCategoryList((current) => {
    if (current.some((existing) => existing.id === category.id)) return current;
    return [...current, category];
  });
}, []); // no external deps — pure functional update
```

### useMemo for Derived Values

**What:** Wrap all 9 derived values in `useMemo` with minimal dependency arrays.

**Why:** These are recomputed on every render today. With memo, they recompute only when their inputs change.

**The 9 values and their dependencies:**

| Value | Depends On | Notes |
|-------|-----------|-------|
| `filteredItems` | `items`, `selectedStoreId` | Calls `applyStoreFilter` and filters `isActive` |
| `activeItems` | `filteredItems` | Calls `partitionItems` |
| `completedItems` | `filteredItems` | Calls `partitionItems` — compute both from one useMemo |
| `alphabeticalItems` | `activeItems` | Calls `sortAlphabetically` |
| `groupedActiveItems` | `activeItems`, `organizationMode`, `categoryList`, `stores` | Most expensive — calls `groupByCategory` or `groupByStore` |
| `selectedStoreName` | `selectedStoreId`, `stores` | Cheap but consistent to memo |
| `storesWithItems` | `items` | Builds a Set — used for visible store filter buttons |
| `visibleStores` | `stores`, `storesWithItems` | Filter of stores array |
| `effectiveDefaultStoreId` | `selectedStoreId`, `preferencesLoaded`, `stores` | Reads localStorage via `readLastStore()` — side effect, keep as-is or extract |

**Note on `effectiveDefaultStoreId`:** It calls `readLastStore()` (a localStorage read) inside render. Wrapping in `useMemo` is appropriate here. The dependency array should include `selectedStoreId` and `preferencesLoaded` (not `stores` length alone — need the store IDs to check `.some()`).

**Chaining useMemo:** `activeItems` and `completedItems` both derive from `filteredItems`. Compute `filteredItems` first, then both others. This avoids duplicating the filter work.

### clear-completed Route Fix

**CRITICAL FINDING — storeIds Cannot Come From UPDATE RETURNING Alone:**

The current route returns `storeIds` as part of each cleared item. This data lives in the `itemStores` table, not the `items` table. `UPDATE items ... RETURNING *` would NOT include `storeIds`.

The client uses the returned `clearedItems` with `storeIds` for the undo flow (restoring items with their original store assignments). Removing `storeIds` from the response would break undo.

**Correct interpretation of the locked decision:** The intent is to eliminate the inefficiency of querying items *before* updating them as a guard. The existing code does SELECT to get items, then loops to build `clearedItems`, then does UPDATE. The optimization is to combine these so the items data is fetched once.

**Practical approach that satisfies the decision:** Keep the SELECT but make it the ONLY query for items data. Currently the code does SELECT → build `clearedItems` → UPDATE. The UPDATE could use a subquery or simply use the IDs already gathered from SELECT. This is what the code already does (`inArray(items.id, clearedItems.map(...))`).

**The actual bug:** Looking at the existing code, it already does SELECT-then-UPDATE with `inArray`. The "inefficiency" is that two DB round-trips happen when one could suffice. However, because `storeIds` must be returned (and require the JOIN), a pure single-query approach requires a CTE or raw SQL. Given the locked decision says "no raw SQL needed" and "contained change in one API route," the practical fix is:

1. Keep the SELECT with JOIN (needed for `storeIds` in response)
2. Use `UPDATE ... WHERE organizationId = orgId AND isActive = true AND isChecked = true` directly (without needing the pre-fetched IDs from step 1)
3. Return the items gathered from SELECT

This separates the two queries so they could run in parallel via `Promise.all`, or simply removes the dependency of the UPDATE on the SELECT result.

**Revised approach (parallel queries):**
```typescript
// Run SELECT (for storeIds) and UPDATE (for efficiency) in parallel
const [rows] = await Promise.all([
  db.select({ item: items, storeId: itemStores.storeId })
    .from(items)
    .leftJoin(itemStores, eq(itemStores.itemId, items.id))
    .where(and(eq(items.organizationId, orgId), eq(items.isActive, true), eq(items.isChecked, true))),
  db.update(items)
    .set({ isActive: false, updatedAt: new Date() })
    .where(and(eq(items.organizationId, orgId), eq(items.isActive, true), eq(items.isChecked, true)))
]);
// group rows into clearedItems as before
```

**Test impact:** The existing `route.test.ts` mocks `db.select` and `db.update` as separate chained calls. This structure will need to be updated to match the new query structure. The test logic (what it asserts) remains the same.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Prop comparison for memo | Custom deep-equal utility | Custom `areEqual` function inline | Simple field comparison; no library needed |
| Stable callback identity | Manual memoization cache | `useCallback` | Built-in React hook, zero overhead |
| Derived value caching | Manual invalidation flags | `useMemo` | Built-in React hook, referentially stable |
| Request deduplication | Custom debounce/tracking | N/A — locked out of scope | No TanStack Query per decision |

---

## Common Pitfalls

### Pitfall 1: React.memo areEqual Returning Wrong Boolean
**What goes wrong:** `areEqual` returns `true` to SKIP re-render (props are equal). Many developers expect this to work like `shouldComponentUpdate` which returns `true` to ALLOW re-render — the opposite behavior.
**Why it happens:** The function signature looks like `areEqual(prevProps, nextProps)` which suggests a predicate "are these equal?" — returning true means "yes, equal, skip update."
**How to avoid:** Mentally read it as "should I skip this render?" or add a comment in the code.
**Warning signs:** ItemRow never updates visually after item changes.

### Pitfall 2: useCallback With Stale Closure for Rollback
**What goes wrong:** `handleUpdate` and `handleToggleChecked` capture `items` for their rollback variable (`const previous = items`). If `items` is not in the dependency array, the rollback reverts to a stale snapshot.
**Why it happens:** Optimizing for stable references (empty deps) conflicts with needing current `items` for rollback.
**How to avoid:** Either (a) include `items` in deps (callback recreates on item change — acceptable), or (b) use a ref (`useRef`) to track the latest items for rollback without triggering re-creation.
**Warning signs:** Undo after a failed mutation restores to a stale state (wrong items).

### Pitfall 3: useMemo Not Actually Memoizing
**What goes wrong:** A useMemo dependency array includes an object or array that is recreated on every render (e.g., an inline `[]` or `{}`), causing the memo to recompute on every render anyway.
**Why it happens:** `stores` and `categoryList` are stable (from useState), but if something like `{ ...options }` is passed as a dependency it would break.
**How to avoid:** Dependencies should be primitives or stable state references. No inline objects in dependency arrays.
**Warning signs:** React DevTools Profiler shows the same render count as before.

### Pitfall 4: Existing Tests Break After React.memo Wrapping
**What goes wrong:** `ItemRow.test.tsx` tests pass `onUpdate={vi.fn()}` directly, creating a new function reference each call. After React.memo + areEqual, the component correctly skips re-renders — but tests that expect a re-render triggered by prop changes may behave differently.
**Why it happens:** The test renders `<ItemRow>` in isolation; React.memo comparator fires when the test re-renders with new props.
**How to avoid:** Review each test case. Tests that call `rerender(...)` with changed item props should still trigger re-renders because `areEqual` compares item fields (which changed). Tests passing new function references only (same item) will correctly NOT trigger re-renders — this is the desired behavior.
**Warning signs:** `vitest` test failures in `ItemRow.test.tsx` after wrapping.

### Pitfall 5: clear-completed Test Must Be Updated
**What goes wrong:** The existing `route.test.ts` mocks `db.select` returning a chained `.from().leftJoin().where()` and `db.update` returning `.set().where().returning()`. After refactoring to parallel queries, the mock chain structure changes.
**Why it happens:** Vitest mocks the Drizzle builder pattern — any structural change to query calls requires mock updates.
**How to avoid:** Update the test mock to match the new query structure. The assertions (what the endpoint returns) remain unchanged.
**Warning signs:** `route.test.ts` fails with "Cannot read property 'from' of undefined" or similar chain errors.

---

## Code Examples

### React.memo Wrapper Pattern (verified from React docs)
```typescript
// Source: React official docs — memo API
import { memo } from "react";

export const ItemRow = memo(function ItemRow(props: ItemRowProps) {
  // ... component body unchanged
}, (prevProps, nextProps) => {
  // Return true = props are equal = SKIP re-render
  const prevItem = prevProps.item;
  const nextItem = nextProps.item;
  return (
    prevItem.id === nextItem.id &&
    prevItem.name === nextItem.name &&
    prevItem.quantity === nextItem.quantity &&
    prevItem.note === nextItem.note &&
    prevItem.categoryId === nextItem.categoryId &&
    prevItem.isChecked === nextItem.isChecked &&
    prevItem.storeIds.length === nextItem.storeIds.length &&
    prevItem.storeIds.every((id, i) => id === nextItem.storeIds[i])
  );
});
```

### useCallback for Zero-Dependency Handlers
```typescript
// handleCategoryCreated — no external dependencies, safe to memoize with []
const handleCategoryCreated = useCallback((category: Category) => {
  setCategoryList((current) => {
    if (current.some((existing) => existing.id === category.id)) return current;
    return [...current, category];
  });
}, []);

// handleDelete — rollback requires previous items
const handleDelete = useCallback(async (id: string) => {
  const previous = items; // captures current items at call time
  setItems((current) => current.filter((item) => item.id !== id));
  try {
    const res = await fetch(`/api/items/${id}`, { method: "DELETE" });
    if (!res.ok) throw new Error("Failed to delete item");
  } catch {
    setItems(previous);
    toast.error("Failed to delete item");
  }
}, [items]); // items in deps — recreates when items change
```

### useMemo Chained Derivations
```typescript
const filteredItems = useMemo(
  () => applyStoreFilter(items.filter((item) => item.isActive), selectedStoreId),
  [items, selectedStoreId]
);

const { activeItems, completedItems } = useMemo(
  () => partitionItems(filteredItems),
  [filteredItems]
);

const groupedActiveItems = useMemo(
  () => groupActiveItems(activeItems, organizationMode, categoryList, stores),
  [activeItems, organizationMode, categoryList, stores]
);
```

### Drizzle Parallel Query (for clear-completed)
```typescript
const [rows] = await Promise.all([
  db
    .select({ item: items, storeId: itemStores.storeId })
    .from(items)
    .leftJoin(itemStores, eq(itemStores.itemId, items.id))
    .where(and(
      eq(items.organizationId, orgId),
      eq(items.isActive, true),
      eq(items.isChecked, true)
    )),
  db
    .update(items)
    .set({ isActive: false, updatedAt: new Date() })
    .where(and(
      eq(items.organizationId, orgId),
      eq(items.isActive, true),
      eq(items.isChecked, true)
    )),
]);
// group rows into clearedItems as before — this part is unchanged
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Class components + shouldComponentUpdate | `React.memo` with comparator | React 16.6 (2018) | Functional components get same skip-render optimization |
| Inline function definitions in render | `useCallback` for stable refs | React 16.8 (2019) | Stable function identity across renders |
| Inline derived computations in render | `useMemo` for cached derivations | React 16.8 (2019) | Expensive computations only run when inputs change |

**Deprecated/outdated:**
- Class-based `PureComponent` / `shouldComponentUpdate`: Replaced by `React.memo` for function components. Do not use for new code in this codebase.

---

## Open Questions

1. **handleUpdate and handleToggleChecked rollback stability**
   - What we know: Both functions need `items` for the `previous` snapshot. Including `items` in `useCallback` deps means these callbacks recreate on every item change.
   - What's unclear: Whether this partial stability is "good enough" to prevent the cascade — if items changes on every mutation, these callbacks recreate, which may still trigger ItemRow re-renders.
   - Recommendation: Use a `useRef` to hold a current-items reference for rollback, keeping the callback deps empty. This is the correct pattern for this scenario. Claude's discretion per CONTEXT.md.

2. **clear-completed: SELECT-then-UPDATE vs Promise.all interpretation**
   - What we know: The locked decision says "replace SELECT-then-UPDATE with a single UPDATE ... RETURNING *." However, storeIds cannot be obtained from UPDATE RETURNING on the items table alone.
   - What's unclear: Whether the decision intends (a) a true single-query approach (which would require a CTE or losing storeIds from response), or (b) eliminating the sequential dependency by running SELECT and UPDATE in parallel.
   - Recommendation: Use parallel `Promise.all` approach. This eliminates the serial round-trip (the actual inefficiency) while preserving storeIds in the response for undo. This is the simplest correct solution per project philosophy.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.x + @testing-library/react 16.x |
| Config file | `vitest.config.ts` (project root) |
| Quick run command | `npx vitest run src/app/\(app\)/dashboard/__tests__/` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PERF-05 | ItemRow renders only when item data changes | unit | `npx vitest run src/app/\(app\)/dashboard/__tests__/ItemRow.test.tsx` | Yes |
| PERF-05 | ShoppingList renders ItemRows with stable callbacks | unit | `npx vitest run src/app/\(app\)/dashboard/__tests__/ShoppingList.test.tsx` | Yes |
| PERF-06 | clear-completed returns correct cleared items with storeIds | unit | `npx vitest run src/app/api/items/clear-completed/route.test.ts` | Yes |
| PERF-04 | Lucide tree-shaking confirmed | manual | `ANALYZE=true npm run build -- --webpack` then inspect `.next/analyze/client.html` | N/A — manual |
| PERF-07 | LCP < 2.5s, CLS < 0.1 | manual | Lighthouse mobile simulation before/after | N/A — manual |
| PERF-08 | No regressions — all tests pass | unit | `npx vitest run` | Yes |

### Sampling Rate
- **Per task commit:** `npx vitest run src/app/\(app\)/dashboard/__tests__/`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

One test file requires updates (not creation):

- [ ] `src/app/api/items/clear-completed/route.test.ts` — mock structure must be updated to match parallel query implementation; assertions remain the same. This is a modification, not a new file.

All other test infrastructure is in place.

---

## Sources

### Primary (HIGH confidence)
- Direct source code read: `src/app/(app)/dashboard/_components/ItemRow.tsx` — complete file, all 384 lines
- Direct source code read: `src/app/(app)/dashboard/_components/ShoppingList.tsx` — complete file, all 732 lines
- Direct source code read: `src/app/api/items/clear-completed/route.ts` — complete file, all 76 lines
- Direct source code read: `src/app/api/items/clear-completed/route.test.ts` — complete file, mock structure documented
- Audit docs: `09-AUDIT-RENDER.md`, `09-AUDIT-BUNDLE.md`, `09-AUDIT-DATA.md` — Phase 9 findings
- `10-CONTEXT.md` — locked decisions from user discussion

### Secondary (MEDIUM confidence)
- React docs (training knowledge, verified against code behavior): React.memo comparator semantics (true = skip), useCallback, useMemo dependency array rules

### Tertiary (LOW confidence)
- None — all claims in this document are backed by direct source code inspection or established React API behavior.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies; all existing
- Architecture patterns: HIGH — verified against actual source code line numbers
- Pitfalls: HIGH — identified from direct code inspection and existing test structure
- clear-completed constraint: HIGH — verified by reading actual route code and test mock structure

**Research date:** 2026-03-24
**Valid until:** 2026-04-24 (stable domain — React hooks API, Drizzle ORM patterns)
