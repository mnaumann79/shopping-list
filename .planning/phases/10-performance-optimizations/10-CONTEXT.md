# Phase 10: Performance Optimizations - Context

**Gathered:** 2026-03-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Implement the performance fixes identified in Phase 9 audits (PERF-04, PERF-05, PERF-06, PERF-07, PERF-08). No new features — only targeted optimizations within the existing architecture. Focus is on React render performance first, data fetching second, bundle verification third.

**Already shipped (ad-hoc before this phase):**
- `loading.tsx` skeleton for dashboard — eliminates white screen on initial load
- `ensureDefaultCategories` moved into `Promise.all` — eliminates one serial DB round-trip

</domain>

<decisions>
## Implementation Decisions

### Render Optimization Approach
- **React.memo on ItemRow** — wrap with custom prop comparator checking `item.id`, `item.name`, `item.quantity`, `item.note`, `item.categoryId`, `item.isChecked`, `item.storeIds`
- **useCallback for all 4 ShoppingList mutation callbacks** — `handleUpdate`, `handleToggleChecked`, `handleDelete`, `handleCategoryCreated` must be stable references for React.memo to work
- **useMemo for all 9 derived values in ShoppingList** — `filteredItems`, `activeItems`, `completedItems`, `alphabeticalItems`, `groupedActiveItems`, `selectedStoreName`, `storesWithItems`, `visibleStores`, `effectiveDefaultStoreId`
- **No full ItemRow refactor** — do NOT eliminate the 10-state useEffect sync pattern; React.memo + useCallback is sufficient and lower risk

### Data Fetching
- **No TanStack Query** — keep local useState; the added complexity is not justified for this app's scale
- **Fix clear-completed** — replace SELECT-then-UPDATE with a single `UPDATE ... WHERE isActive=true AND isChecked=true RETURNING *`; contained change in one API route

### Bundle Optimization
- **Verify Lucide tree-shaking only** — run ANALYZE build and confirm icons are correctly tree-shaken
- **Do NOT replace Sonner or react-hook-form** — ~16 KB total savings don't justify regression risk
- **Render performance is the priority** — 15% bundle reduction target from REQUIREMENTS.md is secondary; deprioritize if not reachable without replacing libraries

### Verification
- **Lighthouse score** — run before Phase 10 execution and after, compare LCP/FCP/CLS/INP
- **Manual iPhone smoke test** for regression check (add item, toggle, edit, clear completed, filter by store)
- **React DevTools Profiler** — re-run after render optimizations to confirm ItemRow render counts drop from 3-27 down to 1-2

### Claude's Discretion
- Exact useMemo dependency arrays for each derived value
- Whether to combine ShoppingList's 3 localStorage useEffect hooks into one (medium priority cleanup noted in audit)
- Order of implementation within Phase 10 plans

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Audit Findings (primary input for this phase)
- `.planning/phases/09-performance-audit/09-AUDIT-RENDER.md` — Render hotspot analysis, ItemRow render counts, cascade mechanism, specific line numbers for all optimization targets
- `.planning/phases/09-performance-audit/09-AUDIT-BUNDLE.md` — Bundle size findings, Sonner/react-hook-form sizes, Lucide tree-shaking status
- `.planning/phases/09-performance-audit/09-AUDIT-DATA.md` — Data fetching inefficiencies, clear-completed SELECT-then-UPDATE finding, API route table

### Requirements
- `.planning/REQUIREMENTS.md` — PERF-04 (bundle), PERF-05 (render), PERF-06 (data fetching), PERF-07 (Core Web Vitals), PERF-08 (no regressions)

### Project Context
- `.planning/PROJECT.md` — Simplicity-first philosophy, constraint: client-side focus only

### Files to Modify
- `src/app/(app)/dashboard/_components/ItemRow.tsx` — Add React.memo + custom comparator
- `src/app/(app)/dashboard/_components/ShoppingList.tsx` — Add useCallback (mutations) + useMemo (derived values)
- `src/app/api/items/clear-completed/route.ts` — Replace SELECT-then-UPDATE with UPDATE...RETURNING

</canonical_refs>

<code_context>
## Existing Code Insights

### Render Optimization Targets (from audit)
- `ItemRow.tsx` line 44 — export point, wrap with React.memo here
- `ShoppingList.tsx` lines 65-71 — useEffect sync (10 state vars synced from props — do NOT refactor)
- `ShoppingList.tsx` lines 264-293 — 3 localStorage useEffect hooks
- `ShoppingList.tsx` lines 295-302 — 9 derived computation lines (all need useMemo)
- `ShoppingList.tsx` lines 318-465 — 4 mutation handlers (all need useCallback)

### Data Fetching Target (from audit)
- `src/app/api/items/clear-completed/route.ts` — SELECT-then-UPDATE pattern to replace

### Bundle Verification
- Run `ANALYZE=true npm run build -- --webpack` to check Lucide chunk
- Check `.next/analyze/client.html` for Lucide tree-shaking confirmation

### Established Patterns
- Post-mount preference restore via useEffect (Phase 4) — do not disturb
- Soft delete pattern (`isActive=false`) used throughout API routes — maintain in clear-completed fix

### Already Done
- `src/app/(app)/dashboard/loading.tsx` — created, skeleton shell for initial load
- `src/app/(app)/dashboard/page.tsx` — `ensureDefaultCategories` now inside `Promise.all`

</code_context>

<specifics>
## Specific Ideas

- React.memo + useCallback must be implemented together — memo alone won't help because callback props change every ShoppingList render
- For the clear-completed fix: Drizzle ORM supports `UPDATE ... WHERE ... RETURNING *` — no raw SQL needed
- Lighthouse should be run with mobile simulation (matches iPhone usage) and throttled CPU/network

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 10-performance-optimizations*
*Context gathered: 2026-03-24*
