# Household Shopping List App

## What This Is

A web app for households to maintain a single shared shopping list. Each family member has their own account and contributes to shared lists. Items can be tagged to specific stores and organized by category, so shopping trips are faster and nothing gets missed.

## Core Value

One shared, always-up-to-date list that everyone in the household can see and edit — no more scattered texts, notes, and paper scraps.

## Requirements

### Validated

- ✓ User authentication (email/password) — v1.0
- ✓ Household creation and member invites — v1.0
- ✓ Shareable join links — v1.0
- ✓ Store management (add/rename/delete) — v1.0
- ✓ Item CRUD with categories and store tags — v1.0
- ✓ Check/uncheck items during shopping trip — v1.0
- ✓ Bulk clear completed items — v1.0
- ✓ Filter by store — v1.0
- ✓ Sort by category/alphabetical/store — v1.0
- ✓ Default + custom categories — v1.0
- ✓ Dark mode toggle (System/Light/Dark) — v1.1
- ✓ Global app header with avatar, settings nav, theme toggle — v1.1
- ✓ Compact single-line item rows — v1.1
- ✓ Store default persistence (last-used pre-selected) — v1.1
- ✓ Visual design system (semantic tokens, pill chips, focus states) — v1.1
- ✓ Three theme preview palettes (Warm, Clean, Bold) — v1.1
- ✓ Bundle size audit and optimization (68KB lazy-loaded) — v1.2
- ✓ React render optimization (React.memo, useCallback, useMemo) — v1.2
- ✓ Data fetching parallelization (clear-completed queries) — v1.2
- ✓ TBT reduced 91% (1930ms → 170ms) — v1.2
- ✓ Lucide tree-shaking verified (17 individual icons bundled, no monolithic chunk) — v1.2 (verified 2026-07-10)
- ✓ Dashboard LCP within budget (LCP 2332ms < 2.5s on /dashboard, mobile simulated 4G) — v1.2 (Phase 11)
- ✓ Dashboard TBT within budget (TBT 0ms < 300ms on /dashboard) — v1.2 (Phase 11)
- ✓ Auth-gated Lighthouse verification infrastructure (CDP cookie injection + Playwright auth setup) — v1.2 (Phase 11)

### Active

- [ ] Item history — checked-off items saved for re-adding next week
- [ ] Re-add item from history with one tap
- [ ] Barcode scanning to add items
- [ ] Voice input to add items
- [ ] Custom drag-to-reorder items
- [ ] Auto-categorization from item name

### Out of Scope

- Real-time live sync — complexity vs. value unclear; revisit if needed
- Mobile native app — web-first
- Who added each item display — not selected as a priority

## Context

- Pain point: shopping coordination is scattered across texts, sticky notes, and multiple apps — no household single source of truth
- Users will primarily use this on mobile browsers while at the store
- Individual accounts are needed so items can eventually be attributed or managed per person

## Constraints

- **Platform**: Web app (browser-based, mobile-responsive)
- **Users**: Household scale — small number of accounts per household, not a public SaaS

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Per-item store tags (not per-list) | More flexible — one item can apply to multiple stores or be store-agnostic | ✓ Validated — core to shopping trip filtering |
| Web-first (not native mobile) | Faster to ship, works on all devices via browser | ✓ Validated — mobile-responsive works well |
| Individual accounts over single shared login | Extensible — enables attribution and per-user features later | ✓ Validated — enables household member management |
| Post-mount preference restore | SSR-safe defaults, then reconcile persisted UI in effects | ✓ Validated — eliminates hydration mismatches |
| Visual design system | WCAG AA contrast, semantic tokens only, Tailwind utilities, pill chip store tags, formal hover/focus | ✓ Validated — v1.1 Phase 7 |
| Three-state theme toggle (System/Light/Dark) | Covers all user preferences cleanly | ✓ Validated — v1.1 Phase 4 |
| Cascading store defaults | Filter store → last-used → blank covers real-world shopping patterns | ✓ Validated — v1.1 Phase 6 |
| CSS class overrides for theme previews | Non-destructive, toggleable without layout shift | ✓ Validated — v1.1 Phase 8 |
| Lazy-load `OrganizeTripBar` via `next/dynamic({ ssr: false })` | Remove "ORGANIZE TRIP" LCP element from initial HTML; same lazy-load pattern as 10-03's DropdownMenu + sonner | ✓ Validated — v1.2 Phase 11 (LCP 2846ms → 2332ms, TBT 327ms → 0ms) |
| Duplicate `type OrganizationMode` between ShoppingList and OrganizeTripBar | Structural typing makes them equivalent; cheaper than the type-only-import dance | ✓ Validated — v1.2 Phase 11 |
| Lighthouse auth via CDP `Network.setCookie` over `extraHeaders` | `extraHeaders` does not carry HTTPOnly cookies through navigation in Lighthouse v13; CDP injection is required for auth-gated audits | ✓ Validated — v1.2 Phase 11 |
| Playwright `request` API captures multi-response Set-Cookie; Node `fetch` does not | Use Playwright for auth setup, transfer cookies to Chrome via CDP for Lighthouse | ✓ Validated — v1.2 Phase 11 |

## Current Milestone: v1.2 Performance & Polish — CLOSED (2026-07-10)

**v1.2 fully verified and shipped.** Phase 11 (Dashboard Performance) retroactively closed the PERF-07 verification debt that originally shipped with phases 9-10 only — 10-03's "Dashboard LCP couldn't be measured headlessly (requires auth session)" hid a real ~800ms LCP regression for 4 months that Phase 11 finally surfaced via CDP-injected cookies.

---

## Current State

**v1.2 Performance & Polish — fully closed.** Phases 9, 10, 11 all executed. Phase 11 retroactively added to close PERF-07 verification debt. 8 plans, 3 phases. LCP 2846ms → 2332ms, TBT 327ms → 0ms on the auth-gated dashboard; sign-in TBT 1930ms → 170ms (Phase 10).

---

<details>
<summary>v1.2 Performance & Polish — Shipped 2026-03-31, fully verified 2026-07-10</summary>

**Goal:** Performance audit and optimizations — identify and fix bottlenecks in the existing app

**Phases:** 9 (Performance Audit), 10 (Performance Optimizations), 11 (Dashboard Performance, retroactive)

**Accomplishments:**
- Bundle analyzer configured — sonner toast lib (68KB) lazy-loaded via dynamic import
- React.memo on ItemRow with custom areEqual comparator — eliminated 3-27× redundant re-renders
- useCallback on 4 ShoppingList mutation handlers with itemsRef rollback pattern
- useMemo on 9 ShoppingList derived values with correct dependency arrays
- Parallel SELECT+UPDATE in clear-completed route via Promise.all
- TBT reduced 91% (1930ms → 170ms) on sign-in via lazy-loading DropdownMenu and sonner
- **Phase 11**: Lazy-loaded the fixed "Organize trip" bottom bar via `next/dynamic({ ssr: false })` — moved LCP element out of initial HTML. **Dashboard LCP 2846ms → 2332ms (-514ms), TBT 327ms → 0ms (-327ms), performance score 88 → 98** (3-run Lighthouse median on /dashboard).
- Lucide tree-shaking verified: 17 individual icons bundled as separate ESM modules, no monolithic chunk
- Established auth-aware Lighthouse verification infrastructure: Playwright for setup + CDP `Network.setCookie` for Chrome + Lighthouse programmatic API

**Stats:** 3 phases, 8 plans, ~3.5-month timeline (2026-03-24 → 2026-07-10)

</details>

<details>
<summary>v1.1 Design Polish — Completed 2026-03-23</summary>

**Goal:** Improve usability and visual consistency across the app

**Phases:** 4 (Dark Mode), 4.1 (Global Header), 5 (Compact Rows), 6 (Store Defaults), 7 (Design System), 8 (Theme Preview)

**Accomplishments:**
- ThemeProvider with unified color tokens — light, dark, and system-preference modes
- DarkModeToggle (three-state cycle) placed consistently across all pages
- Global AppHeader with avatar, settings nav, and theme toggle on every app page
- Compact single-line ItemRow with Dialog edit modal and clickable notes
- Store dropdown in QuickAddBar with cascading defaults
- Visual design system: zero hardcoded colors, pill chip store tags, focus states documented
- Three theme preview palettes with dark mode variants
- ShoppingList refactored: CompletedSection extracted, duplicate useEffects merged

**Stats:** 8 phases, 8 plans, 249 files modified, ~22K LOC added, 6-day timeline

</details>

---
*Last updated: 2026-07-10 after v1.2 milestone fully verified (Phase 11 retroactively added)*
