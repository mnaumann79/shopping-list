# Data Fetching Audit (PERF-03)

**Date:** 2026-03-24
**Analysis:** Source code review of dashboard/page.tsx, API routes, and lib/categories

## Server-Side Data Fetching

### fetchItems()
- **Location:** `src/app/(app)/dashboard/page.tsx` lines 11-39
- **Query:** Drizzle ORM `select` from `items` table with `leftJoin` on `itemStores`
- **Filters:** `organizationId = orgId` AND `isActive = true`
- **Ordering:** `createdAt DESC` (newest first)
- **Grouping:** Manual grouping loop to collect all `storeIds` per item into a `Map`
- **Response shape:** Array of items with `storeIds: string[]` embedded
- **Note:** Query does NOT filter by `isChecked` — fetches all active items regardless of checked state

### fetchStores()
- **Location:** `src/app/(app)/dashboard/page.tsx` lines 41-53
- **Query:** Drizzle ORM `select` from `stores` table
- **Filters:** `organizationId = orgId` AND `isActive = true`
- **Ordering:** `name ASC` (alphabetical)
- **Response shape:** Array of store objects with ISO date strings

### fetchCategories()
- **Location:** `src/lib/categories.ts` lines 45-64
- **Query:** Drizzle ORM `select` from `categories` table
- **Filters:** `organizationId = orgId` AND `isActive = true`
- **Sorting:** Default categories first (ordered by `DEFAULT_CATEGORIES` array index), then custom categories alphabetically
- **Side effect:** `ensureDefaultCategories()` is called before `fetchCategories()` — inserts default categories if none exist (lines 18-43)
- **Response shape:** Sorted array of category objects

### Parallel Fetching
- **Pattern:** Yes — `Promise.all([fetchCategories(), fetchItems(), fetchStores()])` at line 63
- **TTFB Impact:** Positive — all three queries execute in parallel rather than sequentially, reducing total server wait time
- **No waterfall:** The `ensureDefaultCategories()` call (line 62) runs before `Promise.all()`, but since it only inserts if needed, it rarely adds latency

## Data Flow Architecture

```
[Browser Request]
       |
       v
[Next.js Server]
       |
       v
[DashboardPage (Server Component)]
       |
       |-- Promise.all([
       |     fetchCategories(orgId),  -- DB: categories table
       |     fetchItems(orgId),        -- DB: items + itemStores JOIN
       |     fetchStores(orgId)        -- DB: stores table
       |   ])
       |
       v
[ShoppingList receives initialItems, categories, stores as props]
       |
       v
[Client State: local useState + useEffect]
       |
       v
[Mutations via fetch() to /api/items, /api/items/[id], etc.]
```

### Strengths
- **Parallel fetching:** `Promise.all` avoids sequential waterfall
- **No over-fetching:** `fetchItems` filters `isActive=true`, no deleted items returned
- **Server-side rendering:** Initial data arrives with page HTML, no client-side loading state needed
- **Date serialization:** Dates converted to ISO strings before passing to client — avoids serialization issues

### Weaknesses
- **Grouping inefficiency:** `fetchItems` manually groups rows with a `for` loop + `Map`. Drizzle could use `.groupBy()` or a raw SQL query for the same result with less JS processing
- **No pagination:** All active items loaded at once — large lists will have high response size
- **No caching headers:** API routes return no `Cache-Control` headers — each request hits the DB
- **Category sort in JS:** Sorting defaults by array index is done client-side in `fetchCategories` — could be done in SQL with a CASE expression

## Client-Side State

**Pattern:** Local `useState` only — no Zustand, no TanStack Query, no React Query

```typescript
// ShoppingList.tsx — verified from RESEARCH.md
const [items, setItems] = useState(initialItems);
const [categoryList, setCategoryList] = useState(categories);
const [selectedStoreId, setSelectedStoreId] = useState(ALL_STORES_FILTER);
const [organizationMode, setOrganizationMode] = useState<OrganizationMode>(DEFAULT_ORGANIZATION_MODE);
const [lastClearedItems, setLastClearedItems] = useState<Item[]>([]);
const [preferencesLoaded, setPreferencesLoaded] = useState(false);
```

**Implications:**
- All state lives in `ShoppingList` — single component owns all state
- No cross-component caching — if `ItemRow` needs item data, it either gets it via props or via its own `useState` synced with `useEffect`
- **Every state update to `ShoppingList` causes all `ItemRow` children to re-render** unless wrapped in `React.memo`
- `ItemRow` has a `useEffect` (lines 148-154 in RESEARCH.md) that syncs local `useState` to props — runs on every prop change even if item data is the same reference
- No client-side caching of API responses — mutations always refetch from server or update local state only

## Mutation Patterns

### Create Item
- **Endpoint:** `POST /api/items`
- **Flow:** User submits form → `fetch('/api/items', { method: 'POST', body: JSON.stringify(...) })` → server inserts to DB → returns created item → client `setItems(prev => [newItem, ...prev])`
- **Optimistic updates:** No — waits for server response before updating state
- **Store ID handling:** Creates `itemStores` rows after item insert (two separate DB writes)

### Update Item
- **Endpoint:** `PATCH /api/items/[id]`
- **Flow:** User edits item → `fetch('/api/items/[id]', { method: 'PATCH', body: JSON.stringify(...) })` → server updates `items` table → optionally deletes and re-inserts `itemStores` → returns updated item → client `setItems(prev => prev.map(i => i.id === id ? updatedItem : i))`
- **Optimistic updates:** No
- **Store IDs:** When `storeIds` is provided, the endpoint deletes all existing `itemStores` rows for that item then re-inserts (lines 127-133) — not an upsert

### Delete Item (Soft Delete)
- **Endpoint:** `DELETE /api/items/[id]`
- **Flow:** User deletes → `fetch('/api/items/[id]', { method: 'DELETE' })` → server sets `isActive = false` → returns `{ success: true }` → client `setItems(prev => prev.filter(i => i.id !== id))`
- **Optimistic updates:** No
- **Pattern:** Soft delete (sets `isActive=false`) rather than hard delete — data preserved

### Clear Completed
- **Endpoint:** `POST /api/items/clear-completed`
- **Flow:** User clears completed → server queries all `isActive=true AND isChecked=true` items → server batch updates `isActive=false` → returns cleared items
- **Inefficiency:** The endpoint re-queries all completed items BEFORE deleting them — a SELECT followed by UPDATE when a direct `UPDATE ... WHERE isActive=true AND isChecked=true` would suffice
- **Client update:** `setItems(prev => prev.filter(i => !clearedItems.some(c => c.id === i.id)))`

## API Routes Analyzed

| Route | Method | Purpose | Caching |
|-------|--------|---------|---------|
| `/api/items` | GET | List all active items (same as server fetchItems) | None — no Cache-Control |
| `/api/items` | POST | Create new item | None |
| `/api/items/[id]` | PATCH | Update item fields and store associations | None |
| `/api/items/[id]` | DELETE | Soft-delete item (isActive=false) | None |
| `/api/items/clear-completed` | POST | Soft-delete all checked items | None |
| `/api/categories` | (read-only by ShoppingList) | Category management | None |
| `/api/stores` | (read-only by ShoppingList) | Store management | None |

**Caching note:** None of the API routes set `Cache-Control`, `ETag`, or `Last-Modified` headers. Next.js default caching applies (may cache GET responses in some scenarios).

## Redundancy and Inefficiency Findings

### 1. fetchItems groups in JS — could be SQL
**Severity:** Low
**Finding:** Items are fetched with a `leftJoin` producing N rows per item (one per store), then grouped manually in a `for` loop with a `Map`. This requires transferring all rows from DB and processing in JS.
**Recommendation:** Use Drizzle's `.groupBy()` or a raw SQL query with `array_agg` to aggregate store IDs in the database.

### 2. No request deduplication for mutations
**Severity:** Medium
**Finding:** If a user double-clicks "add item" rapidly, two POST requests fire independently. No deduplication at fetch level.
**Recommendation:** Consider debouncing the submit button or using a deduplication library (TanStack Query would handle this automatically).

### 3. clear-completed queries before updating
**Severity:** Low
**Finding:** `POST /api/items/clear-completed` does a SELECT to gather items before updating. A single `UPDATE ... RETURNING` would be more efficient.
**Recommendation:** Replace SELECT-then-UPDATE with direct `UPDATE ... WHERE isActive=true AND isChecked=true RETURNING *`.

### 4. No client-side caching
**Severity:** Medium
**Finding:** No caching library (TanStack Query, React Query, SWR) is installed. Every mutation updates local state only. If the page is refreshed, all data is re-fetched from server. No stale-while-revalidate pattern.
**Recommendation:** For Phase 10, evaluate adding TanStack Query for automatic cache management and deduplication.

### 5. ItemRow useEffect runs on every parent re-render
**Severity:** Medium
**Finding:** ItemRow syncs local state via `useEffect(() => { setName(item.name); ... }, [item])`. When ShoppingList re-renders (e.g., filter change), all ItemRow instances run this effect even if the item object reference is unchanged.
**Recommendation:** Use `React.memo` for ItemRow or use `useMemo` for stable item references.

### 6. Store ID validation queries on every create/update
**Severity:** Low
**Finding:** Both `POST /api/items` and `PATCH /api/items/[id]` run a full `SELECT` to validate store IDs exist before inserting itemStores. This adds latency to every mutation.
**Recommendation:** Consider validating store IDs in a single shared query at the start of the transaction.

## Recommendations for Phase 10

### Top 3 Data Fetching Optimizations

1. **Add React.memo to ItemRow** — The most impactful render optimization. ItemRow currently re-renders and runs useEffect on every ShoppingList state change. Wrapping in `React.memo` with proper `areEqual` would prevent unnecessary re-renders. This addresses PERF-02 (render audit) directly.

2. **Evaluate TanStack Query for request deduplication and caching** — Installing TanStack Query would provide automatic request deduplication, stale-while-revalidate caching, and optimistic update helpers. The learning curve is low and it would eliminate the "no caching" finding.

3. **Optimize clear-completed with direct UPDATE RETURNING** — Replace the SELECT-then-UPDATE pattern with a single `UPDATE ... WHERE isActive=true AND isChecked=true RETURNING *` to eliminate the redundant query and reduce DB round-trips.
