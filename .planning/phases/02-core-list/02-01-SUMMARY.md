---
phase: 02-core-list
plan: "01"
subsystem: testing
tags: [vitest, tdd, drizzle, postgresql, react-testing-library]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: Schema definitions for categories, stores, items, itemStores and auth pattern used by mocks
provides:
  - Wave 0 TDD scaffold: 6 API/lib test stubs (RED) for ITEM-01/02/03, CAT-01/02, STOR-01/02/03
  - Wave 0 TDD scaffold: 2 component test stubs (RED) for QuickAddBar and ItemRow
  - DB migration adding unique constraint on categories(organization_id, name)
affects:
  - 02-02 through 02-08 (all implementation plans consume these test stubs as GREEN targets)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "vi.mock factory uses vi.fn() inline (not outer variables) — vitest hoists vi.mock before const declarations"
    - "API test files import non-existent route handlers — fail at import for TDD RED state"
    - "Component test files import non-existent _components/ — fail at import for TDD RED state"

key-files:
  created:
    - src/db/migrations/0001_add_categories_unique.sql
    - src/app/api/items/route.test.ts
    - src/app/api/items/[id]/route.test.ts
    - src/app/api/categories/route.test.ts
    - src/app/api/stores/route.test.ts
    - src/app/api/stores/[id]/route.test.ts
    - src/lib/categories.test.ts
    - src/app/(app)/dashboard/__tests__/QuickAddBar.test.tsx
    - src/app/(app)/dashboard/__tests__/ItemRow.test.tsx
  modified:
    - src/db/schema/items.ts

key-decisions:
  - "Migration file placed at src/db/migrations/ (drizzle.config.ts out: ./src/db/migrations) not drizzle/migrations/ as plan stated — config is authoritative"
  - "TS2307 errors on test files importing non-existent modules are expected RED state — vitest handles resolution independently of tsc"

patterns-established:
  - "Test stub pattern: mock @/db and @/lib/auth with vi.fn() inline, import non-existent route to force RED"
  - "ItemRow props interface: item, stores, categories, itemStoreIds, onUpdate, onDelete"
  - "QuickAddBar props interface: onAdd callback"

requirements-completed: [ITEM-01, ITEM-02, ITEM-03, CAT-01, CAT-02, CAT-03, STOR-01, STOR-02, STOR-03]

# Metrics
duration: 12min
completed: 2026-03-12
---

# Phase 2 Plan 01: Wave 0 TDD Scaffolds Summary

**8 failing test stubs + unique constraint migration establish TDD RED baseline for all core-list CRUD operations (items, categories, stores)**

## Performance

- **Duration:** 12 min
- **Started:** 2026-03-12T20:34:08Z
- **Completed:** 2026-03-12T20:46:00Z
- **Tasks:** 3
- **Files modified:** 10 (1 schema update + 1 migration + 8 test files)

## Accomplishments

- DB migration adds UNIQUE constraint on `categories(organization_id, name)` preventing duplicate default category race condition
- Drizzle schema updated to declare `unique().on(organizationId, name)` — TypeScript-aware
- 6 API/lib test stubs created in RED state: items POST, items/[id] PATCH+DELETE, categories POST, stores POST, stores/[id] PATCH+DELETE, lib/categories ensureDefaultCategories
- 2 component test stubs created in RED state: QuickAddBar and ItemRow covering all ITEM/CAT-03 behaviors

## Task Commits

1. **Task 1: DB migration — unique constraint on categories** - `f09611c` (feat)
2. **Task 2: Wave 0 API route test stubs** - `e13afb5` (test)
3. **Task 3: Wave 0 component test stubs** - `a3b20bd` (test)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `src/db/migrations/0001_add_categories_unique.sql` - ALTER TABLE adds UNIQUE(organization_id, name) to categories
- `src/db/schema/items.ts` - Added `unique` import + table constraint declaration
- `src/app/api/items/route.test.ts` - ITEM-01: POST create item (401, 400, 201)
- `src/app/api/items/[id]/route.test.ts` - ITEM-02: PATCH update + ITEM-03: DELETE soft-delete
- `src/app/api/categories/route.test.ts` - CAT-02: POST create category (401, 400, 201, 409 duplicate)
- `src/app/api/stores/route.test.ts` - STOR-01: POST create store (401, 400, 201)
- `src/app/api/stores/[id]/route.test.ts` - STOR-02: PATCH rename + STOR-03: DELETE hard-delete
- `src/lib/categories.test.ts` - CAT-01: ensureDefaultCategories inserts 10, is idempotent, returns list
- `src/app/(app)/dashboard/__tests__/QuickAddBar.test.tsx` - ITEM-01 component: submit, Enter, empty guard, clear
- `src/app/(app)/dashboard/__tests__/ItemRow.test.tsx` - ITEM-02/03 + CAT-03: collapsed/expanded/undo/category

## Decisions Made

- Migration placed at `src/db/migrations/` (matches `drizzle.config.ts out` field) rather than `drizzle/migrations/` as written in the plan — config is authoritative
- TypeScript TS2307 errors on test files importing non-existent modules are accepted as expected RED state — vitest resolves imports independently and fails at import as intended

## Deviations from Plan

None — plan executed exactly as written (migration path corrected per config, not a deviation from intent).

## Issues Encountered

- Plan specified migration path as `drizzle/migrations/0001_add_categories_unique.sql` but `drizzle.config.ts` uses `out: "./src/db/migrations"`. Used the config path. The plan's path was a documentation inconsistency, not a functional issue.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All 8 test files exist and fail in RED state — confirmed by `npx vitest run` exiting non-zero
- Implementation plans (02-02 through 02-08) can now proceed to turn tests GREEN
- Migration `0001_add_categories_unique.sql` must be applied to the database before Phase 2 implementation deploys

---
*Phase: 02-core-list*
*Completed: 2026-03-12*
