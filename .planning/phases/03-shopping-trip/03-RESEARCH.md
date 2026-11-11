# Phase 3: Shopping Trip - Research

**Researched:** 2026-03-13
**Domain:** Dashboard trip-mode extensions for check-off, clear completed, store filtering, and alternate list organization
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Trip flow**
- Row tap toggles check/uncheck for shopping-trip use
- Checked items stay visible with dimmed + strike-through styling
- Checked items move into one separate completed section
- Completed section is collapsed by default
- Unchecking must restore an item to its previous active position
- Clear completed is a user-triggered bulk action with confirmation
- Bulk clear removes only checked items
- Bulk clear must surface an undo toast
- Clear-completed control belongs in a sticky mobile trip action bar

**Store focus**
- Remember the last selected store filter
- Always provide an explicit `All stores` option
- Store-filtered view includes items tagged to that store plus untagged items
- Multi-store items appear in every matching store view
- Store filter controls should be horizontal chips

**Organization**
- Default mode is category / aisle
- Organization switching uses a compact segmented control
- Alphabetical mode is one flat A-Z list
- Store mode renders store sections, not a flat list
- Checked items remain in the separate completed section regardless of organization mode

### Deferred / Out of Scope
- Item history and re-add flows remain v2 work even though the roadmap overview still mentions history
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| ITEM-04 | User can check off an item during a shopping trip | Extend existing item PATCH mutation to toggle `isChecked`; keep optimistic UI in dashboard state |
| ITEM-05 | User can uncheck a checked item | Same PATCH path; restore item to derived active ordering instead of storing a separate manual position |
| ITEM-06 | User can clear all checked items from the list at once | Add bulk-clear API route that soft-deletes or deactivates checked items for the active household, plus client undo strategy |
| ORG-01 | User can view items grouped by category / aisle | Preserve current grouped dashboard as default mode; derive groups from existing category ordering |
| ORG-02 | User can filter the list to a selected store | Client-side filter over already-loaded `storeIds`, including untagged items |
| ORG-03 | User can sort items alphabetically (A-Z) | Add alternate derived view that ignores category sections for active items |
| ORG-04 | User can sort items by store | Add store-section derived view for active items; place untagged items in a dedicated fallback section |
</phase_requirements>

---

## Summary

Phase 3 should extend the existing dashboard page, not introduce a separate route. The current architecture already loads all active items, categories, and stores server-side in [`src/app/(app)/dashboard/page.tsx`](src/app/(app)/dashboard/page.tsx) and hands them to a single client state owner in [`src/app/(app)/dashboard/_components/ShoppingList.tsx`](src/app/(app)/dashboard/_components/ShoppingList.tsx). That is the natural place to add trip-mode derived state: active vs completed partitions, store filter, organization mode, and persisted UI preferences.

The schema is already favorable: `items.isChecked` exists in [`src/db/schema/items.ts`](src/db/schema/items.ts), so check/uncheck is a pure behavior change, not a migration. The missing backend capability is bulk clear. Single-item PATCH already supports partial updates in [`src/app/api/items/[id]/route.ts`](src/app/api/items/[id]/route.ts), but it cannot safely express "clear all checked items for this org" without overloading item-specific semantics. Planning should assume one new bulk mutation endpoint for clear-completed plus an undo path.

The largest implementation risk is not persistence; it is interaction conflict. The current row tap expands inline editing in [`src/app/(app)/dashboard/_components/ItemRow.tsx`](src/app/(app)/dashboard/_components/ItemRow.tsx). Phase 3 wants that same collapsed-row tap to toggle checked state during shopping. Planning needs an explicit row interaction model so trip toggle, edit affordance, completed-section behavior, and desktop/mobile discoverability do not fight each other.

**Primary recommendation:** keep all list filtering/sorting client-side for Phase 3, add one bulk-clear API route, and refactor `ShoppingList` around derived selectors instead of incrementally stacking conditionals into the current `grouped` computation.

---

## Standard Stack

### Core

| Library / Surface | Current Use | Phase 3 Use |
|-------------------|-------------|-------------|
| Next.js App Router | Server page + client dashboard | Keep server fetch for initial payload; all trip controls remain client-side |
| Drizzle ORM | Item/category/store queries | Reuse for bulk clear mutation and any updated list ordering query if needed later |
| Existing REST routes | `/api/items`, `/api/items/[id]` | Reuse PATCH for check/uncheck; add a bulk endpoint for clear-completed |
| sonner | Error / delete toasts | Use for clear-completed confirmation result + undo affordance |
| Existing dashboard components | `ShoppingList`, `ItemRow`, `CategorySection` | Extend rather than replace |
| localStorage | Last-used category only | Persist selected store filter and organization mode locally |

### Supporting

| Surface | Recommendation | Why |
|---------|----------------|-----|
| Native `<button>` / existing Button primitive | Use for segmented control, chips, sticky bar actions | No new dependency needed |
| Existing category ordering in `fetchCategories` | Treat as aisle order source of truth | Avoid schema change for sort order |

### Installation

No new packages are required for this phase.

---

## Current Codebase Constraints And Extension Points

### 1. Dashboard is already the correct integration surface

- [`src/app/(app)/dashboard/page.tsx`](src/app/(app)/dashboard/page.tsx) fetches all active items with joined `storeIds`, fetches categories in display order, and fetches active stores.
- [`src/app/(app)/dashboard/_components/ShoppingList.tsx`](src/app/(app)/dashboard/_components/ShoppingList.tsx) owns the interactive item array and already performs optimistic add, update, and delete.
- This means store filtering and organization mode can be derived entirely from already-available props without extra server reads.

### 2. `ShoppingList` currently assumes only category grouping

- The only derived list structure is `grouped`, computed from `categoryList` and `items` in lines 48-60 of [`src/app/(app)/dashboard/_components/ShoppingList.tsx`](src/app/(app)/dashboard/_components/ShoppingList.tsx).
- That logic currently:
  - defaults uncategorized items into the first category
  - filters per category by repeatedly scanning `items`
  - has no notion of store filter, completed partition, or alternate organization mode
- Planning should expect a refactor into layered selectors:
  - `visibleItems`
  - `activeItems`
  - `completedItems`
  - `groupedActiveItems` based on organization mode

### 3. `ItemRow` interaction is the main UX conflict

- Collapsed-row click currently expands inline edit via `handleExpand()` in lines 72-85 of [`src/app/(app)/dashboard/_components/ItemRow.tsx`](src/app/(app)/dashboard/_components/ItemRow.tsx).
- That is incompatible with the phase decision that row tap toggles check/uncheck.
- Extension options:
  1. Introduce explicit trip mode behavior to `ItemRow`, with row tap toggling checked and a separate affordance for editing.
  2. Split collapsed display into two variants: shopping-trip row and editing row.
  3. Keep inline editing only behind a secondary control such as a chevron or long-press/menu.
- Planning should treat this as a first-class design decision, not a minor prop addition.

### 4. Existing optimistic update path is a strong fit for check/uncheck

- `handleUpdate()` in lines 120-163 of [`src/app/(app)/dashboard/_components/ShoppingList.tsx`](src/app/(app)/dashboard/_components/ShoppingList.tsx) already patches local state before issuing `PATCH /api/items/[id]`.
- Extending its update type to include `isChecked` is straightforward.
- Since active/completed sections are derived from `items`, optimistic partition movement will fall out naturally if selectors are cleanly separated.

### 5. CategorySection is reusable, but not sufficient for all views

- [`src/app/(app)/dashboard/_components/CategorySection.tsx`](src/app/(app)/dashboard/_components/CategorySection.tsx) is generic enough for category and likely store sections.
- Alphabetical mode is different: it should be a flat list, so do not force it through fake one-item or A-Z sections unless a later design choice explicitly wants letter headings.
- Completed section can likely reuse the same section pattern with a different label and default collapsed state.

### 6. Schema supports the phase, but not undo-friendly bulk clear metadata

- `items.isChecked` already exists in lines 40-58 of [`src/db/schema/items.ts`](src/db/schema/items.ts).
- No `checkedAt`, `clearedAt`, or manual sort position exists.
- That is acceptable for Phase 3 because:
  - restore-on-uncheck can be recomputed from the current sort/filter model
  - checked items are visually separated rather than historically tracked
- It does mean bulk-clear undo must be handled either with a temporary client snapshot or a server-side reversible mutation strategy if the undo window should survive refresh/navigation.

---

## API And Data Model Implications

### Check / uncheck

**Recommendation:** extend existing single-item PATCH to accept `isChecked?: boolean`.

Why this fits:
- Partial update semantics already exist in [`src/app/api/items/[id]/route.ts`](src/app/api/items/[id]/route.ts).
- `isChecked` lives on the item row already, so no new relation or table is required.
- Optimistic updates already exist in the client.

Planning implications:
- `itemPatchSchema` must add `isChecked`.
- The PATCH refine guard must treat `isChecked` as a valid payload field.
- `ShoppingList` item update typing must include `isChecked`.
- Tests must cover both `false -> true` and `true -> false`.

### Bulk clear completed

**Recommendation:** create a dedicated endpoint such as `POST /api/items/clear-completed` or `DELETE /api/items/checked`.

Why not overload current routes:
- `DELETE /api/items/[id]` is item-scoped.
- Repeated client-side per-item DELETE calls would create avoidable race conditions, noisy network traffic, and brittle rollback behavior.
- A bulk route can scope by `organizationId` and `isChecked=true` once, which matches the requirement precisely.

Recommended behavior:
- Soft-delete checked items by setting `isActive=false` and `updatedAt=now` for all checked items in the org.
- Return the cleared item payloads so the client can build an undo snapshot without refetch.

Undo implications:
- Minimum viable Phase 3 undo: client stores returned cleared items, restores them via per-item recreate/patch flow during toast window.
- Better Phase 3 undo: bulk endpoint supports an explicit restore token or accepts a list of item ids to re-activate.

Because the project state explicitly says items are never hard-deleted, bulk clear should preserve that rule and use `isActive=false`, not physical deletion.

### Store filtering

**Recommendation:** keep store filtering client-side for Phase 3.

Why:
- Dashboard already fetches all active items plus joined `storeIds` in [`src/app/(app)/dashboard/page.tsx`](src/app/(app)/dashboard/page.tsx).
- Household size and list size are small enough that client filtering is cheaper than adding query params, router state, and cache invalidation complexity.

Required predicate:
- `All stores`: all active items
- specific store: items whose `storeIds` includes the selected store OR whose `storeIds.length === 0`

Persistence:
- Store selected store id in `localStorage`, parallel to the existing last-category preference pattern in lines 69-74 and 111-113 of [`src/app/(app)/dashboard/_components/ShoppingList.tsx`](src/app/(app)/dashboard/_components/ShoppingList.tsx).

### Sorting / organization

**Recommendation:** treat organization mode as client-only view state, not persisted to DB.

Modes:
- `category`: group active items by resolved category using existing category order
- `alphabetical`: flat active list sorted by normalized item name
- `store`: group active items into store sections; untagged items need a defined fallback section such as `All Stores` or `Untagged`

Important implication:
- The phase uses "sort" language, but for category and store views the UI is really "organization mode." Planning should model this explicitly in code as `organizationMode`, because alphabetical mode is not just another sort comparator layered on top of grouped sections.

### Data model changes

No schema migration is required for the requested feature set.

Optional but unjustified for Phase 3:
- `checkedAt`
- `sortOrder`
- persisted per-user view preferences in DB

These only become necessary if later phases require cross-device preference sync, analytics/history, or manual drag ordering.

---

## Architecture Patterns

### Pattern 1: Derive trip views from one canonical item array

Keep one source of truth in `ShoppingList`: the `items` state array. Everything else should be derived:

- `filteredItems` from store filter
- `activeItems` and `completedItems` from `isChecked`
- `activeGroups` from `organizationMode`

This avoids bugs where the same item is stored in multiple lists and check/uncheck falls out of sync.

### Pattern 2: Separate list controls from list rendering

Introduce a trip controls layer above the list body:
- store chips
- organization segmented control
- clear-completed action bar

Then keep rendering components focused on one job:
- active list renderer
- completed section renderer
- row renderer

This keeps the current `ShoppingList` from becoming an all-in-one state machine.

### Pattern 3: Completed items are always a post-processing partition

Do not try to keep checked items inside category/store/alphabetical group structures. First derive the active view, then separately render completed items below. That directly matches the phase decisions and simplifies every organization mode.

### Pattern 4: Bulk mutations should be explicit API surfaces

Single-item PATCH remains correct for row-level mutations. Bulk clear should be a bulk route with a bulk response. This preserves clean contracts and is easier to test.

---

## UI / Interaction Considerations That Matter To Planning

### Row interaction needs a deliberate replacement for current expand-on-tap

Current behavior trains users that tapping a row edits it. Phase 3 changes that mental model. Planning needs to choose one of these before execution:

1. Trip-first row: tap toggles checked, secondary icon opens edit.
2. Checkbox affordance: checkbox toggles checked, row tap still edits.
3. Mode-based behavior: dashboard defaults to trip behavior, edit control is explicit.

The context explicitly prefers row tap toggle, so option 1 is the closest fit.

### Completed section default collapse is important for mobile performance and focus

Large completed lists can dominate vertical space. Default-collapsed completed items are not just a visual preference; they prevent list thrash and reduce accidental unchecks.

### Sticky action bar should own destructive bulk actions

Putting clear-completed in a sticky bottom action bar keeps the action reachable on mobile and avoids burying it inside headers that scroll offscreen. Planning should ensure it does not conflict with the existing bottom quick-add bar.

Likely implication:
- trip controls may need a top sticky strip, while clear-completed shares the bottom zone with quick add
- or quick add/trip actions need a unified bottom bar

This overlap should be resolved in plan decomposition, because both are currently bottom-biased UX controls.

### Store chips need overflow handling

Households with many stores can overflow horizontally. Planning should include:
- horizontal scroll container
- clear selected visual state
- persistent `All stores` chip at the front

### Store organization view needs a rule for untagged items

Because untagged items must appear in store-filtered views, store-section mode also needs a visible home for them. Otherwise they disappear in store-sorted mode and violate user expectations.

### Restore on uncheck should rely on deterministic sorting

The context wants items to return to their prior position. With the current data model, "prior position" should be interpreted as "where the item belongs in the active derived order for the current mode," not as a literal remembered index. That is the only robust implementation without adding a manual ordering field.

---

## Common Pitfalls

- Reusing collapsed row tap for both edit and toggle creates accidental check-offs and inaccessible editing.
- Clearing checked items via multiple per-item requests makes undo and failure handling much harder than a dedicated bulk endpoint.
- Mixing checked items into group sections and then trying to render a completed section afterward will create duplication and counting bugs.
- Forgetting untagged items in store-filtered or store-organized views breaks a locked phase decision.
- Treating alphabetical mode as "alphabetical inside category groups" fails ORG-03; it must be a genuinely flat A-Z list.
- Using array index positions to restore unchecked items will be unstable once filtering or sorting changes.
- Letting localStorage be the only source for critical destructive undo is unsafe across refresh; if undo must be resilient, the API needs to support restoration.
- Adding server-side query params for store/sort state too early will complicate the implementation without clear Phase 3 value.

---

## Don't Hand-Roll

| Problem | Do Not Build | Use Instead |
|---------|--------------|-------------|
| Bulk multi-item mutation semantics | ad hoc loops of `fetch('/api/items/:id')` | One explicit bulk-clear API route |
| Separate duplicated item collections | active/completed arrays both mutated independently | One canonical `items` state + derived selectors |
| DB-backed preference sync | new tables for filter/sort mode | `localStorage` for Phase 3 |
| Manual persisted item position tracking | custom order columns or history | deterministic derived ordering from current mode |

---

## Test Implications

### Unit / component coverage

New test surface is needed beyond existing `ItemRow` tests:

- `ShoppingList` derived rendering tests
  - category mode renders active groups only
  - checked item moves to completed section
  - unchecking restores item to active section
  - store filter includes untagged items
  - alphabetical mode renders a flat sorted list
  - store mode renders store sections and untagged section
  - completed section starts collapsed
- `ItemRow` interaction tests
  - row tap toggles checked in collapsed trip view
  - edit affordance still exposes inline edit path
  - checked styling appears in collapsed row

### API route coverage

Extend existing route tests:

- `PATCH /api/items/[id]`
  - accepts `isChecked: true`
  - accepts `isChecked: false`
  - still rejects empty payload
  - still scopes by organization
- new bulk-clear route
  - 401 without session
  - 400 or 200 when no active org / no checked items, depending on chosen contract
  - clears only checked items in the caller org
  - leaves unchecked items untouched
  - returns payload sufficient for undo

### E2E coverage

Phase 3 likely needs the first dashboard/trip Playwright specs:

- shopper checks and unchecks an item on `/dashboard`
- clear completed removes only checked items after confirmation
- undo after clear restores items
- store chip filter includes tagged + untagged items
- organization mode switch between category, alphabetical, and store views

Because no dashboard E2E specs exist yet, planning should allocate Wave 0 or early test scaffolding for these flows if Nyquist is enforced.

---

## Risks And Dependencies

### Risks

| Risk | Why It Matters | Mitigation |
|------|----------------|------------|
| Tap-conflict between trip toggle and editing | Highest chance of user-visible regression | Decide row interaction model before component work starts |
| Bottom quick-add bar vs sticky trip action bar overlap | Two sticky mobile affordances can block content or each other | Plan layout ownership for top/bottom sticky regions up front |
| Undo complexity for bulk clear | Client-only undo may be fragile if the page refreshes | Define undo scope clearly in plan; prefer API response snapshot |
| Selector sprawl inside `ShoppingList` | Adding filters, partitions, and modes naively will create brittle conditionals | Refactor derived-state structure first |
| Incomplete test coverage for derived views | Most regressions here are rendering/state bugs, not schema bugs | Add `ShoppingList` tests early |

### Dependencies

- Phase 2 dashboard structure must remain the base implementation surface.
- Existing item PATCH flow must be extended without breaking ITEM-02 edit behavior.
- Existing delete semantics (`isActive=false`) should remain the model for clear completed.
- Nyquist validation is enabled in [`.planning/config.json`](.planning/config.json), so planning should include explicit automated verification artifacts.

---

## Validation Architecture

Nyquist validation is enabled in [`.planning/config.json`](.planning/config.json), so Phase 3 should plan validation at three layers.

### 1. API route tests

Use Vitest route tests for:
- `PATCH /api/items/[id]` check/uncheck behavior
- bulk-clear route behavior and org scoping

These are the contract tests for ITEM-04, ITEM-05, and ITEM-06.

### 2. Component tests

Add React Testing Library coverage for:
- `ShoppingList` selectors and rendering across organization modes
- completed section collapse behavior
- store-filter rules including untagged items
- row interaction behavior after the tap-model change

This is the main verification layer for ORG-01 through ORG-04 because the complexity is mostly client-side derivation.

### 3. Playwright dashboard trip flows

Add a new dashboard/trip spec file for end-to-end validation:
- check item
- uncheck item
- clear completed with confirmation
- undo clear
- switch store filter and organization modes

### Recommended coverage mapping

| Requirement | Primary Automated Verification |
|-------------|-------------------------------|
| ITEM-04 | API PATCH tests + dashboard E2E check-off |
| ITEM-05 | API PATCH tests + component/E2E uncheck restoration |
| ITEM-06 | bulk-clear route tests + E2E clear/undo flow |
| ORG-01 | `ShoppingList` component tests in category mode |
| ORG-02 | `ShoppingList` component tests for store filter predicate + E2E chip switching |
| ORG-03 | `ShoppingList` component tests for flat alphabetical rendering |
| ORG-04 | `ShoppingList` component tests for store-section rendering |

### Wave 0 implications

Phase 3 should expect new test files at minimum for:
- dashboard `ShoppingList` component behavior
- extended item PATCH route cases
- bulk-clear route tests
- dashboard/trip Playwright flow

---

## Recommended Plan Shape

The cleanest plan split is:

1. Test scaffolding and red-state coverage for derived list behavior and bulk clear.
2. API updates: `isChecked` support in PATCH plus dedicated bulk-clear route.
3. `ShoppingList` state refactor: selectors for filter, organization mode, active/completed partition.
4. `ItemRow` interaction redesign for trip toggle plus edit access.
5. Trip controls and completed section UI.
6. Verification pass for mobile sticky controls, undo behavior, and all requirement flows.

This sequence isolates contract work first, then derived-state refactor, then UI wiring.

---

## Sources

### Primary (HIGH confidence)

- Codebase inspection of [`src/app/(app)/dashboard/page.tsx`](src/app/(app)/dashboard/page.tsx)
- Codebase inspection of [`src/app/(app)/dashboard/_components/ShoppingList.tsx`](src/app/(app)/dashboard/_components/ShoppingList.tsx)
- Codebase inspection of [`src/app/(app)/dashboard/_components/ItemRow.tsx`](src/app/(app)/dashboard/_components/ItemRow.tsx)
- Codebase inspection of [`src/app/(app)/dashboard/_components/CategorySection.tsx`](src/app/(app)/dashboard/_components/CategorySection.tsx)
- Codebase inspection of [`src/app/api/items/[id]/route.ts`](src/app/api/items/[id]/route.ts)
- Codebase inspection of [`src/app/api/items/route.ts`](src/app/api/items/route.ts)
- Codebase inspection of [`src/db/schema/items.ts`](src/db/schema/items.ts)
- Codebase inspection of [`src/app/(app)/dashboard/__tests__/ItemRow.test.tsx`](src/app/(app)/dashboard/__tests__/ItemRow.test.tsx)
- Codebase inspection of [`src/app/api/items/[id]/route.test.ts`](src/app/api/items/[id]/route.test.ts)
- Codebase inspection of [`src/app/api/items/route.test.ts`](src/app/api/items/route.test.ts)
- Codebase inspection of [`.planning/phases/03-shopping-trip/03-CONTEXT.md`](.planning/phases/03-shopping-trip/03-CONTEXT.md)
- Codebase inspection of [`.planning/config.json`](.planning/config.json)

### Notes

- `qmd query` could not be used in this Windows session because `qmd.ps1` attempted to invoke `/bin/sh.exe`, which does not exist in the current environment. Research was completed through direct file inspection instead.

---

## Metadata

**Confidence breakdown:**
- Current codebase constraints: HIGH
- API/data model implications: HIGH
- UI interaction recommendations: HIGH
- Validation architecture: HIGH

**Research date:** 2026-03-13
**Valid until:** next substantial dashboard architecture change
