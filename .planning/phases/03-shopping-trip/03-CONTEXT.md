# Phase 3: Shopping Trip - Context

**Gathered:** 2026-03-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Household members can efficiently complete a shopping trip using the existing shared list. This phase covers checking items off and undoing that state, clearing checked items after a trip, filtering the list to a selected store, and reorganizing the trip view for faster in-store navigation.

Item history and re-adding prior purchases remain out of scope for this phase and belong to v2.

</domain>

<decisions>
## Implementation Decisions

### Trip flow
- Checking an item marks it complete via the same row tap used to uncheck it later.
- Checked items remain visible with dimmed styling and strike-through text.
- Checked items move out of the active list into a single completed section rather than staying mixed into each category or sort group.
- The completed section is collapsed by default while shopping.
- If an item is unchecked from the completed section, it returns to its previous position in the active list.
- Clearing checked items is a user-triggered bulk action with confirmation, not an automatic cleanup.
- The clear action removes only currently checked items.
- After a bulk clear, show an undo toast for recovery.
- The clear-completed control should live in a sticky trip action bar on mobile.

### Store focus
- The default view should remember the last selected store filter.
- Users must have an explicit `All stores` option to get back to the full list.
- Selecting a store shows items tagged for that store plus items with no store tags.
- Items tagged to multiple stores appear in every matching store-filtered view.
- Store filter controls should use horizontal chips for fast mobile switching.

### Organization modes
- Default organization is by category/aisle.
- Organization mode switching should use a compact segmented control.
- Alphabetical mode should become one flat A-Z list rather than keeping category sections.
- Store sorting should render as store sections rather than a flat list.
- Checked items should always remain in the separate completed section regardless of the active organization mode.

### Claude's Discretion
- Exact copy and iconography for the sticky trip action bar and completed section header.
- Exact visual treatment for dimmed checked rows beyond the required strike-through and reduced emphasis.
- Whether the completed section label includes an item count badge.
- How remembered store selection is persisted locally.

</decisions>

<specifics>
## Specific Ideas

- The trip view should preserve the shopper's mental map: an unchecked item goes back to where it was before completion.
- A selected-store trip should still include untagged items so store-agnostic essentials are not missed.
- Alphabetical mode is intended for quick item lookup and should feel meaningfully different from category navigation.

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/app/(app)/dashboard/_components/ShoppingList.tsx`: Existing client-side list state, grouping, optimistic add/update/delete flows, and bottom quick-add structure can be extended for trip controls, filter state, and alternate organization modes.
- `src/app/(app)/dashboard/_components/ItemRow.tsx`: Current row interaction pattern can be adapted so collapsed rows support trip check/uncheck behavior while preserving inline editing.
- `src/app/(app)/dashboard/_components/CategorySection.tsx`: Existing section wrapper can continue to power category-based browsing and can inform the new completed and store-section layouts.
- `src/components/ui/button.tsx`, `src/components/ui/separator.tsx`, `src/components/ui/dropdown-menu.tsx`: Existing UI primitives cover action controls, section separation, and lightweight control surfaces.

### Established Patterns
- Dashboard data is loaded server-side in `src/app/(app)/dashboard/page.tsx` and passed into a client component for interaction.
- Item updates already use optimistic client mutation followed by `PATCH /api/items/[id]`, which is the natural path for check/uncheck state.
- Category ordering is already defined by `src/lib/categories.ts`, so category/aisle mode should build on that existing grocery order.
- The schema already includes `items.isChecked` in `src/db/schema/items.ts`, so trip completion state is modeled already.

### Integration Points
- Phase 3 should extend the existing dashboard list rather than introducing a separate shopping-trip page unless planning later proves that necessary.
- Store data already arrives with dashboard props, so store-filter chips can be derived from current household stores without new settings flows.
- Item fetch and mutation routes in `src/app/api/items` are the core integration points for check-off, bulk clear, and organization behavior.

</code_context>

<deferred>
## Deferred Ideas

- Item history and one-tap re-add remain future work under v2 requirements, not Phase 3.

</deferred>

---

*Phase: 03-shopping-trip*
*Context gathered: 2026-03-13*
