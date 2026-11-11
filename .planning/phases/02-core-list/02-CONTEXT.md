# Phase 2: Core List - Context

**Gathered:** 2026-03-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Household members can build and maintain a shared grocery list — items organized by category, tagged to stores. This phase delivers: adding/editing/deleting items (name, quantity, note, category, store tags), default and custom categories, and store management (add, rename, delete).

Viewing filters, sorting, and check-off during shopping trips are Phase 3.

</domain>

<decisions>
## Implementation Decisions

### Item Entry UX
- Quick-add bar pinned at the bottom of the list — thumb-accessible on mobile, single-field (name only), type and hit enter to add
- Tapping an existing item expands it inline to reveal edit fields (name, quantity, note, category, store tags) — no modal, no navigation away
- New items auto-assign to the last used category (not uncategorized by default)
- Swipe left to delete on mobile; delete is immediate with an undo toast (sonner is already installed)
- Desktop: trash icon visible in the expanded row

### List Layout
- Items grouped under category section headers (collapsible)
- Users can collapse/expand category sections manually
- Empty categories (no items) are hidden — only categories with items are shown
- Item row displays: name + quantity inline (e.g. "Milk ×2"), store tags as small text chips/badges
- Notes are visible only in the expanded row, not the collapsed list view
- Custom categories appended after default categories (category order: Claude's discretion — use grocery store aisle order)
- Empty list state: friendly message with a prompt/arrow pointing to the bottom quick-add bar

### Store Management
- Stores are managed in the household settings page (/household/settings) — settings page already exists from Phase 1
- Add store: "Add Store" button opens a dialog with a name field (consistent with the dialog pattern used in Phase 1 for invites)
- Rename store: edit icon on each store row opens a rename dialog
- Delete store: immediately removes the store and silently strips that store's tag from all affected items — no warning, no block

### Multi-Store Tag UX
- In the inline item edit expand, store assignment is a checkbox list — all household stores shown with checkboxes
- Store tags appear on the collapsed item row as small text chip/badge labels (e.g. "Costco", "Trader Joe's")
- If no stores have been added to the household yet: show a link to Settings within the store section ("No stores added. Add one in Settings.")

### Claude's Discretion
- Exact category ordering for defaults (suggested: aisle order — Produce, Dairy, Bakery, Meat, Frozen, Pantry, Beverages, Household, Personal Care, Other)
- Visual design of category section headers (typography, spacing, collapse indicator)
- Exact swipe-to-delete implementation and animation
- Store chip color/styling
- Loading and skeleton states
- Error handling for failed API calls

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/components/ui/card.tsx` — Card component available for item rows or section containers
- `src/components/ui/button.tsx` — Button for Add Store, delete confirmation
- `src/components/ui/dialog.tsx` — Dialog for add/rename store flows
- `src/components/ui/form.tsx`, `input.tsx`, `label.tsx` — Form primitives for item add/edit and store dialogs
- `src/components/ui/sonner.tsx` — Toast component for undo-delete feedback (already installed)
- `src/components/ui/separator.tsx` — Useful for section dividers between categories

### Established Patterns
- Next.js App Router: Server Components for data fetching, Client Components for interactivity
- shadcn/ui for all UI components — consistent with Phase 1 forms and dialogs
- Drizzle ORM + PostgreSQL (Neon) — DB queries in server actions or route handlers
- better-auth sessions — `auth.api.getSession()` in server components to get current user + org context

### Integration Points
- Dashboard (`/app/(app)/dashboard/page.tsx`) is the stub where the shopping list will be built — currently shows a placeholder
- Household settings (`/app/(app)/household/settings`) is where store management UI will be added
- DB schema already complete: `categories`, `stores`, `items`, `itemStores` tables defined in `src/db/schema/items.ts`
- `organizationId` on all tables = household ID from better-auth's organization plugin

</code_context>

<specifics>
## Specific Ideas

- No specific UI references provided — open to standard mobile grocery list patterns
- Mobile-first is non-negotiable (from PROJECT.md): primary use case is at the store on a phone
- Keep the add flow fast: one tap to expand, swipe to delete — no confirmation dialogs for common actions

</specifics>

<deferred>
## Deferred Ideas

- None — discussion stayed within phase scope

</deferred>

---

*Phase: 02-core-list*
*Context gathered: 2026-03-12*
