---
phase: 02
reviewers: [gemini, codex]
reviewed_at: 2026-04-07
plans_reviewed: [02-01-PLAN.md, 02-02-PLAN.md, 02-03-PLAN.md, 02-04-PLAN.md, 02-05-PLAN.md, 02-06-PLAN.md, 02-07-PLAN.md, 02-08-PLAN.md]
---

# Cross-AI Plan Review — Phase 2 (Core List)

## Gemini Review

### Plan 02-01 (Wave 0, TDD + DB migration)
**Summary:** Solid foundation plan, but "RED on non-existent imports" is not sufficient TDD by itself. Value depends on whether tests assert business behavior, auth boundaries, and transaction semantics rather than just module existence.

**Strengths:**
- Front-loads schema and behavioral expectations before implementation
- Creates explicit contract for later API/UI waves
- Unique-constraint migration added early, necessary for duplicate prevention and idempotency

**Concerns:**
- **HIGH:** "Tests fail on non-existent imports" is not sufficient TDD — only proves files are absent, not requirements correctly specified
- **HIGH:** No explicit mention of transaction tests for atomic store-tag replacement (core requirement)
- **HIGH:** No explicit org-scope/authz test coverage described, despite being security-critical
- **MEDIUM:** Soft-delete + undo needs tests across both DB state and API visibility
- **MEDIUM:** Category seeding idempotency needs concurrency-oriented tests

**Suggestions:**
- Add explicit behavioral test matrices for each requirement ID
- Include tests for unauthorized/cross-household access on every route family
- Add concurrency-focused tests for `ensureDefaultCategories` and transactional item-store replacement

**Risk:** MEDIUM

---

### Plan 02-02 (Wave 2, Stores API)
**Summary:** Directionally correct with explicit auth guard and org scoping. Main risks are validation, duplicate handling, and ensuring destructive actions don't cross household boundaries.

**Strengths:**
- Correctly separates CRUD endpoints for stores
- Explicit auth guard and org scope on every WHERE
- DB cascade for item-store cleanup matches silent-strip deletion decision

**Concerns:**
- **HIGH:** No explicit mention of validating store ownership before PATCH/DELETE
- **HIGH:** No duplicate-name policy described — if unique per household, needs schema and API behavior
- **MEDIUM:** GET ordering unspecified — unstable ordering makes settings UI feel inconsistent
- **MEDIUM:** No mention of handling delete/rename race conditions

**Risk:** MEDIUM

---

### Plan 02-03 (Wave 2, Categories API)
**Summary:** One of the stronger plans. Idempotent seeding, retrieval ordering, and 409 duplicate handling are all well-designed. Largest open risk is concurrent "first household visit" semantics.

**Strengths:**
- `ensureDefaultCategories` directly addresses CAT-01
- Idempotent seeding via `onConflictDoNothing` is the right design
- Retrieval ordering well thought out (defaults by aisle order, custom alphabetically)
- GET ensuring defaults before returning aligns with first-visit bootstrapping

**Concerns:**
- **HIGH:** "First household visit" can involve concurrent requests from multiple members/devices — needs concurrency-safe testing
- **MEDIUM:** Name normalization rules not defined ("Produce" vs " produce " vs "PRODUCE")
- **MEDIUM:** No explicit org-scope mention, though critical for multi-tenant correctness

**Risk:** LOW to MEDIUM

---

### Plan 02-04 (Wave 3, Items API)
**Summary:** Phase-critical backend plan covering active-item reads, creation, transactional store-tag replacement, and soft delete. Main concerns are response shaping from joins, validation rules, and undo/category-assignment semantics.

**Strengths:**
- Covers full CRUD surface for items
- Transactional store-tag replacement correctly called out
- Soft delete matches requirement and locked UX
- GET filters to active items correctly

**Concerns:**
- **HIGH:** `leftJoin` and `storeIds` aggregation can produce duplicated item rows or null-handling bugs if shaping is not careful
- **HIGH:** No explicit org-scope statement even though items are highest-value cross-tenant data
- **HIGH:** Last-used-category auto-assignment is locked UX but no persistence strategy mentioned
- **MEDIUM:** Soft delete + undo requires clear server contract

**Risk:** HIGH

---

### Plan 02-05 (Wave 3, Store settings UI)
**Summary:** Likely sufficient for basic settings surface, but reads thin compared to backend complexity. Silent delete UX needs better failure handling definition.

**Concerns:**
- **MEDIUM:** Silent delete without confirmation increases accidental destructive action risk
- **MEDIUM:** No loading, error, and disabled states for operations
- **MEDIUM:** Dialogs may be awkward on mobile-first flows

**Risk:** MEDIUM

---

### Plan 02-06 (Wave 4, Structural components)
**Summary:** Coherent component decomposition. Main risks are pinned bottom input on mobile, optimistic-state reconciliation, and cross-component state ownership.

**Strengths:**
- Component boundaries are sensible
- Quick-add bar matches locked UX
- Grouping and collapsible category sections align with requirements
- Optimistic add fits fast shopping workflow

**Concerns:**
- **HIGH:** Pinned bottom input on mobile can conflict with virtual keyboard, safe-area insets, and viewport resize
- **MEDIUM:** Optimistic add without clear reconciliation strategy can cause duplicate/out-of-order items
- **MEDIUM:** Collapse state persistence not defined

**Risk:** MEDIUM

---

### Plan 02-07 (Wave 5, ItemRow)
**Summary:** Central to locked UX with highest front-end interaction risk. Swipe, inline expand, category creation, and undo all interact in one component.

**Strengths:**
- Matches locked UX decisions closely
- Inline expand avoids modal churn on mobile
- Inline category creation supports CAT-02 naturally
- Native Pointer Events for swipe aligns with minimal-dependency philosophy
- Undo toast with timeout/cancel pattern is sensible

**Concerns:**
- **HIGH:** Swipe gestures can conflict with scroll, tap-to-expand, text selection, and horizontal movement inside expanded editor
- **HIGH:** Undo semantics underspecified — immediate soft-delete vs delayed client-side delete changes consistency model
- **HIGH:** Inline "+ New category" creation needs state coordination to avoid failed item edits when category creation fails
- **MEDIUM:** Store chips on collapsed rows may overflow on small screens with many stores
- **MEDIUM:** Accessibility: pointer gestures, inline expansion need keyboard/focus handling on desktop

**Risk:** HIGH

---

### Plan 02-08 (Wave 6, Dashboard wiring)
**Summary:** Reasonable integration step using server-side fetching correctly. Human verification checkpoint is good practice. Initialization responsibility may be split across layers.

**Strengths:**
- Server Component fetch strategy appropriate for initial dashboard load
- `Promise.all` sensible for independent fetches
- Human verification checkpoint included

**Concerns:**
- **HIGH:** Calling `ensureDefaultCategories` in Server Component AND via categories API creates duplicated responsibility
- **MEDIUM:** `Promise.all` failure behavior not defined — one failing fetch breaks entire page
- **MEDIUM:** No cache invalidation/revalidation strategy after mutations
- **MEDIUM:** Eight-step browser test doesn't explicitly cover auth boundaries and undo failure modes

**Risk:** MEDIUM

---

## Codex Review

### Overall Summary
**Risk: LOW-MEDIUM**

The plans are technically sound with good logical dependency chain (Stores → Categories → Items). Mobile-optimized UX via Native Pointer Events and pinned Quick-Add bar demonstrates commitment to mobile-first. Drizzle transactions for atomic store-tag replacement prevent orphaned records. Idempotent seeding via `onConflictDoNothing` handles concurrent sessions robustly.

**Proceed with Implementation**, prioritizing strict session-based `householdId` scoping in Plans 02-02 and 02-04.

### Cross-Plan Strengths
- Good wave decomposition with backend-before-UI ordering
- Requirements mostly mapped to concrete implementation areas
- Research findings applied directly
- UX decisions reflected consistently in UI plans

### Cross-Plan Concerns
- **HIGH:** Multi-tenant security (org-scope) not explicitly repeated in categories/items
- **HIGH:** Last-used-category behavior locked but not clearly assigned to any plan
- **HIGH:** Undo semantics not fully defined across client/server boundaries
- **HIGH:** TDD may be shallow if tests mostly establish file contracts rather than requirement behavior
- **MEDIUM:** Validation/normalization rules for names/quantities/notes broadly underspecified
- **MEDIUM:** ItemRow interaction complexity may need more incremental testing

### Codex Suggestions
1. **Refine seeding trigger:** Move `ensureDefaultCategories` to Household Creation or post-signup hook. If kept on dashboard, wrap in mutex or use unique constraint on `(householdId, categoryName)`.
2. **Optimistic delete:** Call DELETE API immediately (optimistic) and have Undo trigger re-activation API call. More resilient than waiting 5s before notifying server.
3. **Transactional category creation:** Inline category creation during item edit should be handled cleanly or use dedicated endpoint.
4. **DB migration update:** Include `last_used_category_id` persistence field to satisfy locked UX requirements.
5. **Constraint migration:** Add Unique Index on `(householdId, name)` for both Stores and Categories.

---

## Consensus Summary

### Agreed Strengths
- Wave decomposition and logical dependency chain (backend before UI)
- Mobile-first implementation approach (Pointer Events, pinned bottom bar)
- Idempotent default category seeding with `onConflictDoNothing`
- Transactional store-tag replacement for data integrity
- Respect for locked UX decisions across all plans

### Agreed Concerns (Highest Priority)
1. **Org-scope enforcement** — Critical for multi-tenant safety but not explicitly repeated in all API plans
2. **Last-used-category persistence** — Locked UX decision not assigned to any specific plan
3. **Undo server contract** — Whether DELETE is immediate or delayed affects consistency guarantees
4. **TDD depth** — "RED on imports" may not test actual business behavior and security boundaries

### Divergent Views
- **Gemini:** Overall phase risk is MEDIUM-HIGH; more concerned about interaction complexity in ItemRow
- **Codex:** Overall phase risk is LOW-MEDIUM; believes architectural decisions are sound if security is prioritized

### Priority Actions Before Execution
1. Assign last-used-category persistence to a specific plan (Server Component vs localStorage)
2. Define undo as immediate DELETE + restore API vs delayed DELETE
3. Add explicit org-scope enforcement statements to Plans 02-03 and 02-04
4. Expand TDD tests in Plan 02-01 to cover auth boundaries and transaction semantics
