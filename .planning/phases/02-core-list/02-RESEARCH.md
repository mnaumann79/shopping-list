# Phase 2: Core List - Research

**Researched:** 2026-03-12
**Domain:** Next.js App Router + Drizzle ORM CRUD, mobile-first list UI, swipe-to-delete, inline expand pattern
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Item Entry UX**
- Quick-add bar pinned at the bottom of the list — thumb-accessible on mobile, single-field (name only), type and hit enter to add
- Tapping an existing item expands it inline to reveal edit fields (name, quantity, note, category, store tags) — no modal, no navigation away
- New items auto-assign to the last used category (not uncategorized by default)
- Swipe left to delete on mobile; delete is immediate with an undo toast (sonner is already installed)
- Desktop: trash icon visible in the expanded row

**List Layout**
- Items grouped under category section headers (collapsible)
- Users can collapse/expand category sections manually
- Empty categories (no items) are hidden — only categories with items are shown
- Item row displays: name + quantity inline (e.g. "Milk x2"), store tags as small text chips/badges
- Notes are visible only in the expanded row, not the collapsed list view
- Custom categories appended after default categories
- Empty list state: friendly message with a prompt/arrow pointing to the bottom quick-add bar

**Store Management**
- Stores are managed in the household settings page (/household/settings) — settings page already exists from Phase 1
- Add store: "Add Store" button opens a dialog with a name field (consistent with the dialog pattern used in Phase 1 for invites)
- Rename store: edit icon on each store row opens a rename dialog
- Delete store: immediately removes the store and silently strips that store's tag from all affected items — no warning, no block

**Multi-Store Tag UX**
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

### Deferred Ideas (OUT OF SCOPE)
- None — discussion stayed within phase scope
- Viewing filters, sorting, and check-off during shopping trips are Phase 3
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| ITEM-01 | User can add an item with a name, optional quantity, and optional note | Quick-add bar (name only) + inline expand for quantity/note; POST /api/items route with Drizzle insert |
| ITEM-02 | User can edit an item's name, quantity, note, category, and store tags | Inline expand row pattern; PATCH /api/items/[id] with itemStores junction updates |
| ITEM-03 | User can delete an item | Soft-delete via is_active=false; swipe-to-delete on mobile / trash icon on desktop; undo via sonner toast with setTimeout cancel |
| CAT-01 | Household list has a default set of grocery categories | Seed defaults on first household access; isDefault=true rows in categories table with fixed display order |
| CAT-02 | User can create a custom category | Inline "Add category" flow from the item edit expand; POST /api/categories; custom categories appended after defaults |
| CAT-03 | User can assign an item to a category when adding or editing | categoryId field on items table; select/combobox in inline expand; auto-assign to last used category on quick-add |
| STOR-01 | User can add a store to the household | "Add Store" dialog in /household/settings; POST /api/stores |
| STOR-02 | User can rename a store | Edit icon + rename dialog in settings; PATCH /api/stores/[id] |
| STOR-03 | User can delete a store | Delete button in settings; DELETE /api/stores/[id] cascades via itemStores FK onDelete cascade in DB schema |
</phase_requirements>

---

## Summary

Phase 2 builds the core CRUD layer for the grocery list on top of the complete DB schema already defined in Phase 1. The schema (`categories`, `stores`, `items`, `itemStores`) is migration-ready and needs no changes. The primary implementation work is: (1) seeding default categories per household, (2) API route handlers for items, categories, and stores following the existing pattern in `src/app/api/households/`, (3) the list UI on the dashboard page with inline expand, collapsible category sections, and a pinned quick-add bar, and (4) store management UI added to the existing household settings page.

The hardest interaction to implement correctly is swipe-to-delete with undo. No external swipe library is installed. The correct approach for this project is a native Pointer Events implementation (pointerdown / pointermove / pointerup) — no extra dependencies needed, works on both touch and mouse, consistent with the project's minimal-dependency philosophy. The undo pattern uses `sonner`'s action button with a cancelled-flag pattern (set a timeout to execute delete; if undo is clicked, clear the timeout and restore).

The last-used-category feature requires a small piece of client state (`localStorage` or React state) that persists the most recent `categoryId` used when adding an item, applying it automatically to new quick-adds.

**Primary recommendation:** Build API routes first (stores, categories, items), seed defaults on first list load, then build the UI layer from the bottom up: pinned quick-add bar, item row, inline expand, category section header, full list page.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js App Router | 16.1.6 (already installed) | Server Components for data fetch, Client Components for interactive list | Established in Phase 1 |
| Drizzle ORM | 0.45.1 (already installed) | DB queries; `eq`, `and`, `inArray` operators for item/store/category CRUD | Established in Phase 1 |
| drizzle-zod | 0.8.3 (already installed) | Generate Zod schemas from Drizzle table definitions for validation | Established in Phase 1 |
| shadcn/ui components | already installed | Button, Dialog, Input, Form, Label, Separator, Sonner | Established in Phase 1 |
| sonner | 2.0.7 (already installed) | Undo-delete toast with action button | Established in Phase 1 |
| lucide-react | 0.577.0 (already installed) | Trash, Edit, ChevronDown/Up icons for list UI | Established in Phase 1 |
| react-hook-form + zod | already installed | Form validation in dialogs and inline edit | Established in Phase 1 |
| better-auth | 1.5.5 (already installed) | Session auth; `auth.api.getSession()` for org/user context in API routes | Established in Phase 1 |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Pointer Events API | Native browser | Swipe-to-delete gesture | Use native — no swipe library needed given project's minimal deps |
| localStorage | Native browser | Persist last-used categoryId across sessions | Client-side only, no DB needed for this UX preference |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Native Pointer Events for swipe | `@use-gesture/react` or `react-swipeable` | External deps add bundle weight; native API is sufficient for single swipe-left gesture on a list row |
| Native checkbox input | shadcn Checkbox component | shadcn Checkbox is a Radix wrapper — not currently installed; native `<input type="checkbox">` styled with Tailwind is sufficient for store tag checkboxes |

**Installation:** No new packages required for Phase 2. All dependencies are already present.

---

## Architecture Patterns

### Recommended Project Structure

```
src/
├── app/
│   ├── (app)/
│   │   ├── dashboard/
│   │   │   ├── page.tsx              # Server Component — fetch categories + items + stores
│   │   │   └── _components/
│   │   │       ├── ShoppingList.tsx  # Client Component — main list state
│   │   │       ├── CategorySection.tsx # collapsible section header + item rows
│   │   │       ├── ItemRow.tsx       # collapsed row + inline expand
│   │   │       └── QuickAddBar.tsx   # pinned bottom bar
│   │   └── household/
│   │       └── settings/
│   │           └── page.tsx          # add StoresSection to existing file
│   └── api/
│       ├── items/
│       │   ├── route.ts              # GET (list), POST (create)
│       │   └── [id]/
│       │       └── route.ts          # PATCH (update), DELETE (soft-delete)
│       ├── categories/
│       │   └── route.ts              # GET (list), POST (create custom)
│       └── stores/
│           ├── route.ts              # GET (list), POST (create)
│           └── [id]/
│               └── route.ts          # PATCH (rename), DELETE (hard delete)
```

### Pattern 1: Server Component Data Fetch + Client Component List

**What:** Dashboard page is a Server Component that fetches all data (categories, items with store tags) and passes it as props to a Client Component that manages local optimistic state.

**When to use:** When initial data must be available on first render (mobile performance) but list interactions need reactive state.

**Example:**
```typescript
// src/app/(app)/dashboard/page.tsx (Server Component)
export default async function DashboardPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");

  const orgId = session.session.activeOrganizationId;
  if (!orgId) redirect("/onboarding");

  await ensureDefaultCategories(orgId); // idempotent seed

  const [categories, items, stores] = await Promise.all([
    fetchCategories(orgId),
    fetchItems(orgId),
    fetchStores(orgId),
  ]);

  return <ShoppingList categories={categories} items={items} stores={stores} />;
}
```

### Pattern 2: API Routes with Session Auth Guard

**What:** All `/api/items`, `/api/categories`, `/api/stores` routes follow the established pattern from Phase 1 — session check first, then extract `activeOrganizationId` for data scoping.

**When to use:** Every API route that touches household data.

**Example:**
```typescript
// src/app/api/items/route.ts
export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const orgId = session.session.activeOrganizationId;
  if (!orgId) return Response.json({ error: "No active household" }, { status: 400 });

  // validate body with zod, insert with drizzle
}
```

### Pattern 3: Default Category Seeding (Idempotent)

**What:** On first load of the list for a given `organizationId`, check if any `isDefault=true` categories exist. If none, insert the 10 defaults. This is idempotent — runs at most once per household.

**When to use:** `ensureDefaultCategories(orgId)` called from the Server Component before data fetch.

**Default category order (aisle order):**
```typescript
const DEFAULT_CATEGORIES = [
  "Produce",
  "Dairy",
  "Bakery",
  "Meat",
  "Frozen",
  "Pantry",
  "Beverages",
  "Household",
  "Personal Care",
  "Other",
];
```

Note: The `categories` table has no `sortOrder` column in the current schema. Default ordering must be enforced in application code by returning defaults before custom categories. Options: (a) use the `isDefault` flag to sort defaults first, then sort defaults by a fixed in-code array position, or (b) add a `sortOrder` integer column via migration. Prefer option (a) to avoid a migration — look up the default category names in the fixed array to get their sort index.

### Pattern 4: Soft Delete for Items

**What:** Item deletion sets `is_active = false` rather than deleting the row. Established decision from Phase 1 research ("Items are never hard-deleted"). The `items` table already has `isActive boolean` for this.

**When to use:** All item delete operations.

**Undo pattern with sonner:**
```typescript
// in ItemRow.tsx (Client Component)
function handleDelete(itemId: string) {
  // Optimistically hide item from list
  setItems(prev => prev.filter(i => i.id !== itemId));

  let undone = false;
  const timeoutId = setTimeout(async () => {
    if (!undone) {
      await fetch(`/api/items/${itemId}`, { method: "DELETE" });
    }
  }, 5000);

  toast("Item removed", {
    action: {
      label: "Undo",
      onClick: () => {
        undone = true;
        clearTimeout(timeoutId);
        setItems(prev => [...prev, originalItem]); // restore
      },
    },
  });
}
```

### Pattern 5: Swipe-to-Delete (Native Pointer Events)

**What:** No swipe library — implement with `onPointerDown`, `onPointerMove`, `onPointerUp` on the item row. Translate the row left as user swipes; if swipe exceeds threshold (e.g., 80px), trigger delete.

**When to use:** Mobile item rows (applies on touch screens; on desktop, pointer events also fire so guard with `e.pointerType === "touch"`).

**Example structure:**
```typescript
// in ItemRow.tsx
const startX = useRef(0);
const [swipeOffset, setSwipeOffset] = useState(0);

function onPointerDown(e: React.PointerEvent) {
  if (e.pointerType !== "touch") return;
  startX.current = e.clientX;
  e.currentTarget.setPointerCapture(e.pointerId);
}

function onPointerMove(e: React.PointerEvent) {
  const delta = e.clientX - startX.current;
  if (delta < 0) setSwipeOffset(Math.max(delta, -120));
}

function onPointerUp() {
  if (swipeOffset < -80) handleDelete(item.id);
  else setSwipeOffset(0); // snap back
}
```

Apply `transform: translateX(${swipeOffset}px)` via inline style or Tailwind `translate-x-*` (dynamic values require inline style).

### Pattern 6: itemStores Junction — Delete Store Cascade

**What:** The `itemStores` table already has `storeId` with `onDelete: "cascade"` referencing `stores`. Deleting a store via Drizzle will automatically remove all `itemStores` rows for that store — no application-level cleanup code needed.

**When to use:** DELETE `/api/stores/[id]` — just delete the store row and DB cascade handles the rest.

### Anti-Patterns to Avoid

- **Fetching items without org scoping:** Every DB query MUST include a `where(eq(items.organizationId, orgId))` clause. Never fetch by item ID alone without also asserting org ownership.
- **Hard deleting items:** Items use soft-delete (`isActive = false`). Hard deletes break Phase 3 history features and the `is_active` flag pattern established in Phase 1.
- **Blocking on undo:** Don't wait to confirm undo before showing the toast. Show immediately, delay the actual API call — this is the responsive pattern.
- **Managing categories in a modal:** Category creation must happen inline (from the item expand row), not in a separate dialog navigation. The user should not lose their item context.
- **Seeding categories on every request:** `ensureDefaultCategories` must be idempotent — check for existing defaults before inserting. Consider a `count` query rather than always inserting with ON CONFLICT.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Form validation for item/store/category inputs | Custom validation logic | drizzle-zod + react-hook-form (already installed) | Established pattern from Phase 1 — handles all edge cases, type-safe |
| Toast notifications with action button | Custom toast overlay | sonner (already installed) | `toast("...", { action: { label, onClick } })` handles all undo UI |
| Dialog for add/rename store | Custom overlay/sheet | shadcn Dialog (already installed) | Established dialog pattern from Phase 1 invite flow |
| Auth + org scoping in every API route | Session middleware | `auth.api.getSession()` + `activeOrganizationId` (established pattern) | Same pattern used in all Phase 1 routes |
| Store-to-item cascade on delete | Manual item update queries | Drizzle FK `onDelete: "cascade"` already defined in `itemStores` schema | DB handles it automatically |

**Key insight:** Phase 2 is almost entirely assembly of existing primitives. The DB schema is complete, UI components exist, auth pattern is established. The novel work is the swipe gesture and the inline expand pattern — everything else is wiring.

---

## Common Pitfalls

### Pitfall 1: activeOrganizationId Can Be Null

**What goes wrong:** `session.session.activeOrganizationId` is `null` for users who completed auth but haven't joined/created a household yet. Passing `null` as `organizationId` to DB queries will return all rows (if no WHERE clause) or throw a constraint error.

**Why it happens:** better-auth allows sessions without an active org. Phase 1 redirects to `/onboarding` from middleware, but API routes have no middleware protection.

**How to avoid:** Every API route guard: `if (!orgId) return Response.json({ error: "No active household" }, { status: 400 })`. The Server Component should also redirect if `orgId` is null.

**Warning signs:** Items appearing for wrong household, empty list errors, DB constraint violations.

### Pitfall 2: itemStores Updates on Item Edit

**What goes wrong:** When editing store tags on an item, naively inserting new `itemStores` rows without first deleting existing ones creates duplicate tags. The `itemStores` table has no unique constraint in the current schema.

**Why it happens:** Many-to-many junction tables require a delete-then-insert (or upsert) pattern on updates.

**How to avoid:** In the PATCH `/api/items/[id]` handler, wrap store tag updates in a transaction: `DELETE FROM item_stores WHERE item_id = ?`, then re-insert the new set.

**Warning signs:** Store tags multiplying on repeated edits, duplicate badges appearing in UI.

### Pitfall 3: Last-Used Category Persisting Stale State

**What goes wrong:** User adds items to "Produce", then household deletes "Produce" category (Phase 3 feature, but categories can be deactivated). Quick-add auto-assigns to deleted category ID, API call fails.

**How to avoid:** When resolving last-used category on quick-add, validate that the stored `categoryId` still exists in the current categories list before applying it. Fall back to the first default category ("Produce") if stale.

### Pitfall 4: Swipe Capturing Scroll

**What goes wrong:** On mobile, horizontal swipe on a list item that should trigger delete instead scrolls the page vertically (or vice versa — swipe intended as scroll triggers delete).

**Why it happens:** Browser's native touch handling competes with the pointer events implementation until pointer capture is established.

**How to avoid:** Call `e.currentTarget.setPointerCapture(e.pointerId)` on `pointerdown`. Only begin swipe tracking if the initial delta is predominantly horizontal (`Math.abs(deltaX) > Math.abs(deltaY)`). Add `touch-action: pan-y` CSS to the list container so vertical scrolling remains native.

### Pitfall 5: Default Category Seeding Race Condition

**What goes wrong:** Two users in the same household hit the dashboard simultaneously; both trigger `ensureDefaultCategories`; both find zero defaults and both insert 10 rows — resulting in 20 default category rows.

**Why it happens:** Check-then-insert is not atomic.

**How to avoid:** Use Drizzle's `onConflictDoNothing()` with a unique constraint, OR query with `SELECT COUNT` and insert only if count is 0 (acceptable at this household scale — 2-6 users, race is very rare). For v1, a `(organizationId, name, isDefault)` unique constraint on the categories table would be ideal. Alternatively: use a single INSERT ... WHERE NOT EXISTS pattern at the DB level.

---

## Code Examples

Verified patterns from existing codebase:

### Drizzle Insert with org scoping

```typescript
// Follows existing pattern in src/db/index.ts + src/db/schema/items.ts
import { db } from "@/db";
import { items } from "@/db/schema";
import { eq, and } from "drizzle-orm";

const newItem = await db.insert(items).values({
  organizationId: orgId,
  name: body.name,
  quantity: body.quantity ?? null,
  note: body.note ?? null,
  categoryId: body.categoryId ?? null,
  createdById: session.user.id,
}).returning();
```

### Drizzle Select items with store tags (JOIN)

```typescript
// Items with their store tags via itemStores junction
const itemsWithStores = await db
  .select({
    item: items,
    storeId: itemStores.storeId,
  })
  .from(items)
  .leftJoin(itemStores, eq(itemStores.itemId, items.id))
  .where(and(
    eq(items.organizationId, orgId),
    eq(items.isActive, true)
  ));
// Group storeIds by itemId in application code
```

### Soft delete item

```typescript
await db
  .update(items)
  .set({ isActive: false, updatedAt: new Date() })
  .where(and(
    eq(items.id, itemId),
    eq(items.organizationId, orgId) // always scope to org
  ));
```

### Transaction: update item + replace store tags

```typescript
await db.transaction(async (tx) => {
  await tx.update(items).set({ name, quantity, note, categoryId, updatedAt: new Date() })
    .where(and(eq(items.id, itemId), eq(items.organizationId, orgId)));

  await tx.delete(itemStores).where(eq(itemStores.itemId, itemId));

  if (storeIds.length > 0) {
    await tx.insert(itemStores).values(
      storeIds.map(storeId => ({ itemId, storeId }))
    );
  }
});
```

### sonner undo toast (from sonner 2.x docs)

```typescript
// sonner action button pattern — already used in Phase 1 for other toasts
import { toast } from "sonner";

toast("Item removed", {
  action: {
    label: "Undo",
    onClick: () => { /* restore logic */ },
  },
});
```

### Collapsible category section (React state, no library)

```typescript
// Native useState — no accordion library needed
const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

function toggleCategory(categoryId: string) {
  setCollapsed(prev => {
    const next = new Set(prev);
    next.has(categoryId) ? next.delete(categoryId) : next.add(categoryId);
    return next;
  });
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Page navigation for item edit | Inline expand row (no navigation) | UX decision in CONTEXT.md | Eliminates full-page reload on mobile |
| Separate "manage categories" page | Inline category creation from item form | UX decision | Keeps context while adding categories |
| Real-time sync (WebSockets) | Polling / fetch-on-focus | Phase 1 research decision | Acceptable for 2-6 user households |
| Confirm dialog before delete | Immediate delete + undo toast | UX decision in CONTEXT.md | Faster interactions on mobile |

---

## Open Questions

1. **Default category sortOrder in DB vs application code**
   - What we know: The `categories` table has no `sortOrder` column. Default categories must appear before custom ones, and in a specific order.
   - What's unclear: Whether a future `CAT-V2-01` (rename) or `CAT-V2-02` (delete) would need sortOrder in DB to allow user reordering.
   - Recommendation: For Phase 2, sort in application code using the fixed array index of the category name. If the planner wants to future-proof, add a `sortOrder integer` column in Phase 2 migration — acceptable scope.

2. **Unique constraint for default category seeding race**
   - What we know: No unique constraint exists on `categories(organizationId, name)`.
   - What's unclear: Whether the race condition (two simultaneous first-loads) is worth a migration to add a unique constraint.
   - Recommendation: Add `unique()` on `(organizationId, name)` via a Drizzle migration in Wave 0 of this phase. Use `onConflictDoNothing()` on seed insert. This is low effort and prevents data integrity issues.

3. **Checkbox component for store tags**
   - What we know: shadcn Checkbox is not installed. The store assignment in item edit is a checkbox list.
   - What's unclear: Whether to install shadcn Checkbox or use native `<input type="checkbox">` styled with Tailwind.
   - Recommendation: Use native checkbox with Tailwind styling (consistent with project's minimal-shadcn footprint; no new dependency needed for a simple checklist).

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.0 + React Testing Library 16.3.2 |
| Config file | `vitest.config.ts` (project root) |
| Quick run command | `npx vitest run --reporter=verbose` |
| Full suite command | `npx vitest run` |

### Phase Requirements -> Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ITEM-01 | POST /api/items creates item scoped to org | unit (API route) | `npx vitest run src/app/api/items/route.test.ts -t "POST"` | Wave 0 |
| ITEM-01 | Quick-add bar submits name and calls API | unit (component) | `npx vitest run src/app/(app)/dashboard/__tests__/QuickAddBar.test.tsx` | Wave 0 |
| ITEM-02 | PATCH /api/items/[id] updates item + replaces store tags | unit (API route) | `npx vitest run src/app/api/items/\[id\]/route.test.ts -t "PATCH"` | Wave 0 |
| ITEM-02 | Inline expand renders edit fields for an item | unit (component) | `npx vitest run src/app/(app)/dashboard/__tests__/ItemRow.test.tsx -t "expand"` | Wave 0 |
| ITEM-03 | DELETE /api/items/[id] soft-deletes (sets is_active=false) | unit (API route) | `npx vitest run src/app/api/items/\[id\]/route.test.ts -t "DELETE"` | Wave 0 |
| ITEM-03 | Undo toast action restores item in UI | unit (component) | `npx vitest run src/app/(app)/dashboard/__tests__/ItemRow.test.tsx -t "undo"` | Wave 0 |
| CAT-01 | ensureDefaultCategories inserts 10 defaults when none exist | unit | `npx vitest run src/lib/categories.test.ts` | Wave 0 |
| CAT-01 | ensureDefaultCategories is idempotent (no duplicates on second call) | unit | same file | Wave 0 |
| CAT-02 | POST /api/categories creates custom category after defaults | unit (API route) | `npx vitest run src/app/api/categories/route.test.ts -t "POST"` | Wave 0 |
| CAT-03 | Item row shows category assignment; edit updates categoryId | unit (component) | `npx vitest run src/app/(app)/dashboard/__tests__/ItemRow.test.tsx -t "category"` | Wave 0 |
| STOR-01 | POST /api/stores creates store scoped to org | unit (API route) | `npx vitest run src/app/api/stores/route.test.ts -t "POST"` | Wave 0 |
| STOR-02 | PATCH /api/stores/[id] renames store | unit (API route) | `npx vitest run src/app/api/stores/\[id\]/route.test.ts -t "PATCH"` | Wave 0 |
| STOR-03 | DELETE /api/stores/[id] removes store | unit (API route) | `npx vitest run src/app/api/stores/\[id\]/route.test.ts -t "DELETE"` | Wave 0 |
| STOR-03 | Store tags removed from items after store delete | manual | — | manual-only (cascade verified by DB constraint; component integration test is low ROI) |

### Sampling Rate

- **Per task commit:** `npx vitest run --reporter=verbose`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `src/app/api/items/route.test.ts` — covers ITEM-01 POST
- [ ] `src/app/api/items/[id]/route.test.ts` — covers ITEM-02 PATCH, ITEM-03 DELETE
- [ ] `src/app/api/categories/route.test.ts` — covers CAT-02 POST
- [ ] `src/app/api/stores/route.test.ts` — covers STOR-01 POST
- [ ] `src/app/api/stores/[id]/route.test.ts` — covers STOR-02 PATCH, STOR-03 DELETE
- [ ] `src/lib/categories.test.ts` — covers CAT-01 seeding idempotency
- [ ] `src/app/(app)/dashboard/__tests__/QuickAddBar.test.tsx` — covers ITEM-01 component
- [ ] `src/app/(app)/dashboard/__tests__/ItemRow.test.tsx` — covers ITEM-02, ITEM-03 undo, CAT-03

---

## Sources

### Primary (HIGH confidence)

- Existing codebase inspection — `src/db/schema/items.ts`, `src/app/api/households/invite/route.ts`, `src/app/(app)/household/settings/page.tsx`, `src/app/(app)/dashboard/page.tsx`, `vitest.config.ts`, `package.json`
- Phase 1 established decisions in `.planning/STATE.md` — soft-delete pattern, auth session pattern, Drizzle schema structure
- `.planning/phases/02-core-list/02-CONTEXT.md` — locked UX decisions

### Secondary (MEDIUM confidence)

- Sonner 2.x action button API — verified against installed version (2.0.7) and project usage in `src/components/ui/sonner.tsx`
- Drizzle ORM transaction API — consistent with drizzle-orm 0.45.1 installed; `db.transaction(async tx => {...})` is the documented pattern

### Tertiary (LOW confidence)

- Pointer Events swipe-to-delete implementation — pattern is well-established web standard but the exact threshold values (80px, 120px) are judgment calls; validate on real device during execution

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already installed and in use
- Architecture: HIGH — patterns directly derived from existing Phase 1 codebase
- Pitfalls: HIGH (org scoping, itemStores update) / MEDIUM (swipe scroll conflict — established pattern, no codebase-specific precedent)
- Test plan: HIGH — follows established vitest + RTL pattern from Phase 1

**Research date:** 2026-03-12
**Valid until:** 2026-06-12 (stable stack — Next.js, Drizzle, shadcn versions unlikely to change mid-project)
