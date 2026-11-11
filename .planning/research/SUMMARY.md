# Project Research Summary

**Project:** Household Shopping List — v1.1 Design Polish
**Domain:** Mobile-first web app UI polish (dark mode, list density, unified theming, smart defaults)
**Researched:** 2026-03-18
**Confidence:** HIGH

## Executive Summary

This milestone adds four design polish features on top of a fully functional v1.0 shopping list app built with Next.js 16 App Router, Tailwind v4, Drizzle ORM, and Better Auth. The codebase was examined directly during research, which gives unusually high confidence: the exact integration points, existing patterns, and gaps are all known quantities rather than inferences. The recommended approach treats dark mode infrastructure as a mandatory prerequisite — it must be wired before any component work begins, because without `.dark` correctly toggling on `<html>`, visual verification of every subsequent change is impossible.

The four features form a clear dependency chain: unified color tokens must be audited before dark mode renders consistently; dark mode infrastructure must be functional before the compact row redesign can be verified in both themes; and the store-default persistence is self-contained and can run in parallel with the compact row work. The build order is not arbitrary — it is dictated by what you need working to verify the next thing. This milestone is low-risk: all patterns are established and the codebase already has the `.dark` CSS variable block, `@custom-variant dark` declaration, and `next-themes` installed. The primary implementation risk is developer shortcuts (scattering `dark:` utility overrides instead of migrating to semantic tokens) that create long-term maintenance debt.

The single most important architectural decision for this milestone: use `next-themes` `ThemeProvider` with `attribute="class"` and add `suppressHydrationWarning` to `<html>`. This is not optional. The app's SSR architecture means the server cannot know the user's theme preference, and without next-themes' built-in blocking script, dark mode users will see a white flash on every page load. All other patterns (post-mount preference restore, localStorage persistence, semantic tokens) are already established and require only consistent application.

## Key Findings

### Recommended Stack

The v1.0 stack (Next.js 16, Tailwind v4, shadcn/ui, Drizzle, Neon, Better Auth, TanStack Query, Zustand) carries forward unchanged. The only new dependency for v1.1 is `next-themes@0.4.6`, which is already installed in `package.json`. No new libraries are required for compact rows, store defaults, or unified theming — these are implemented with existing Tailwind utilities, localStorage, and CSS custom properties.

The critical version compatibility constraint is Tailwind v4's complete removal of `darkMode: 'class'` from tailwind.config.js. Dark mode is now declared via `@custom-variant dark (&:where(.dark, .dark *))` in CSS — this is already correct in `globals.css`. The only setup gap confirmed by codebase inspection is the missing `suppressHydrationWarning` on `<html>` in `layout.tsx` and the missing `ThemeProvider` wrapper.

**Core technologies (v1.1 additions):**
- `next-themes`: Dark mode flash prevention — handles the blocking inline script that applies theme before paint; rolling this manually recreates the exact problem it solves
- `@custom-variant dark` (globals.css): Already declared and correct — do not change
- CSS `@theme` tokens (globals.css): Already complete light + dark variable blocks — audit components to use them instead of hardcoded colors

### Expected Features

All four v1.1 features are P1 for this milestone. The dependency ordering (not alphabetical priority) determines implementation sequence.

**Must have (table stakes):**
- Dark mode follows system preference by default — mobile users expect this; iOS and Android native apps do it automatically
- Dark mode manual override persists across sessions — a setting that resets on reload is a UX failure
- Dark mode toggle visible in main nav (sun/moon icon) — buried settings toggles are invisible to most users
- Compact item row (name + qty/store/notes-preview in two lines) — 20-item lists with 3-line rows are overwhelming at the grocery store
- Store field defaults to last-used store — re-selecting the same store on every item is unnecessary friction
- Unified color theme consistent across all pages — inconsistent grays and accent colors signal an unfinished product

**Should have (competitive):**
- Notes preview truncated to one line (not hidden) — users add notes for a reason; hiding defeats the purpose
- Compact row with inline checked state (strikethrough, muted, no layout shift) — visual feedback without height change

**Defer to v1.2:**
- Notes tap-to-expand inline accordion — adds interaction complexity; stable compact row first
- Dark mode preference sync via user account (server-side) — localStorage sufficient at household scale
- Multiple color themes — one well-executed theme beats several mediocre ones

### Architecture Approach

The v1.1 architecture introduces three new components (`ThemeProvider`, `useTheme` hook, `DarkModeToggle`) and modifies four existing ones (`layout.tsx`, `dashboard/page.tsx`, `ItemRow.tsx`, `QuickAddBar.tsx`). `globals.css` is unchanged — the dark variable block is complete. The key structural principle is that `ThemeProvider` must live at the root layout level (not inside a route group) so it covers both app routes and auth pages. Theme state is owned exclusively by `next-themes` context; filter/sort/category preferences continue to use the existing `preferencesLoaded` post-mount pattern — these two systems must not be conflated.

**Major components:**
1. `ThemeProvider` (NEW, `src/components/theme-provider.tsx`) — `"use client"` wrapper at root layout; delegates to next-themes; applies/removes `.dark` on `<html>` via next-themes' blocking script
2. `DarkModeToggle` (NEW, `src/components/dark-mode-toggle.tsx`) — consumes ThemeContext; renders sun/moon icon button; guards with `mounted` state before rendering icon to avoid hydration mismatch
3. `ItemRow.tsx` (MODIFY) — flatten from two-section layout (check area + always-visible edit bar) to single flex row: `[check] Name · qty [store chips] [edit icon]`; expanded edit panel below unchanged
4. `QuickAddBar.tsx` (MODIFY) — read `TRIP_STORE_FILTER_KEY` from localStorage on submit to pre-tag items with current store filter; validate store ID exists in current store list before applying

### Critical Pitfalls

1. **Dark mode FOUC / hydration mismatch** — Add `suppressHydrationWarning` to `<html>` in `layout.tsx` and use `next-themes` `ThemeProvider` with `attribute="class"`. The server cannot set `.dark` on `<html>` without cookie infrastructure that doesn't exist; next-themes injects a blocking script that applies the theme before paint — do not attempt to replicate this manually.

2. **Hardcoded colors not responding to dark mode** — `globals.css` has a complete semantic token system. Components using `bg-white`, `text-gray-900`, or `border-gray-200` will not respond to dark mode. Audit all components before the token migration phase; never use `dark:` utility overrides as a shortcut — they fight the token system and create debt.

3. **Conflating `next-themes` mount state with the existing `preferencesLoaded` pattern** — `useTheme()` from next-themes returns `undefined` for `resolvedTheme` before mount. The existing `preferencesLoaded` gate in `ShoppingList.tsx` is a separate system. Components needing both must guard against both independently.

4. **Compact list rows below 44px touch target on mobile** — The primary use case is one-handed at the grocery store. Minimum row height is 44px (`min-h-[44px]`), not a fixed reduced height. Design on mobile viewport (390px) first.

5. **Stale deleted store ID in localStorage** — When restoring last-selected store, validate `stores.find(s => s.id === storedId)` and fall back to "no store" if not found. This pattern is already established for `LAST_CATEGORY_KEY` in `ShoppingList.tsx` — follow it exactly.

## Implications for Roadmap

The feature dependency chain dictates a 3-phase structure. Dark mode infrastructure is Phase 1 because it is the prerequisite for verifying all visual work. The compact row is Phase 2 because it is higher user-value and requires Phase 1 to verify. Store default persistence is Phase 3 — self-contained and small.

### Phase 1: Dark Mode Foundation

**Rationale:** Dark mode infrastructure must be the first change. Without `.dark` toggling correctly on `<html>`, it is impossible to visually verify any subsequent component change in dark mode. This is also where the highest-severity pitfalls live (FOUC, hydration mismatch, next-themes integration). Solve it completely and verify it before touching anything else.

**Delivers:** Functional dark mode end-to-end — system preference respected on first load, manual toggle persists across sessions, no flash, no hydration warnings, all pages/components consistent in both themes.

**Addresses:** Dark mode toggle (table stakes), dark mode persistence (table stakes), unified token audit (prerequisite for consistent dark mode)

**Avoids:** Pitfall 1 (FOUC/hydration), Pitfall 2 (next-themes + preferencesLoaded conflict), Pitfall 3 (hardcoded color specificity)

**Key tasks:**
- Add `suppressHydrationWarning` to `<html>` in `src/app/layout.tsx`
- Create `src/components/theme-provider.tsx` wrapping next-themes `ThemeProvider` with `attribute="class"`
- Wrap `{children}` and `<Toaster>` in `ThemeProvider` in `layout.tsx`
- Create `src/components/dark-mode-toggle.tsx` with `mounted` guard
- Add `DarkModeToggle` to dashboard header
- Audit all components for hardcoded color classes; replace with semantic tokens from `globals.css`
- Pass `theme={resolvedTheme}` to `<Toaster>` component

### Phase 2: Compact Item Row

**Rationale:** The compact row redesign is a visual change that must be verified in both light and dark modes — Phase 1 must be complete. It is architecturally independent from the store default feature and is higher user-value (directly improves active shopping UX).

**Delivers:** One-line compact item row with name, quantity, store label, and notes preview (truncated); consistent 44px+ touch targets on mobile; inline checked state (strikethrough, muted, no height change); edit icon replacing always-visible edit bar.

**Addresses:** Compact item row (table stakes), notes preview visible without interaction (competitive)

**Avoids:** Pitfall 4 (mobile touch target minimum 44px)

**Key tasks:**
- Restructure `ItemRow.tsx` from two-section layout to single flex row
- Maintain `min-h-[44px]` on row and interactive elements
- Truncate notes preview to one line with ellipsis
- Test on 390px mobile viewport before calling phase complete
- Keep expanded edit panel behavior unchanged

### Phase 3: Store Default Persistence

**Rationale:** Self-contained, low-risk change with no dependencies on Phases 1 or 2. Placed last because it is the smallest change; delivering it after the higher-impact phases keeps focus on user-visible improvements first.

**Delivers:** Add-item form pre-populates store field with last-used store; falls back gracefully when stored store has been deleted.

**Addresses:** Store defaults to last selected (table stakes)

**Avoids:** Pitfall 5 (stale deleted store ID)

**Key tasks:**
- Read `TRIP_STORE_FILTER_KEY` from localStorage in `QuickAddBar.tsx` on form mount or submit
- Validate store ID against current store list; fall back to no default if not found
- Follow `LAST_CATEGORY_KEY` defensive pattern from `ShoppingList.tsx` exactly

### Phase Ordering Rationale

- Phase 1 must come first: it is both a prerequisite for visual verification and the highest-risk integration point
- Phase 2 before Phase 3: higher user-value; compact row benefits shoppers on every trip while store default reduces friction only on item add
- Phases 2 and 3 have no dependency on each other and can run in parallel if capacity allows
- All three phases are small enough to complete in one session each; no phase should require re-research

### Research Flags

Phases with standard patterns (all three — skip `/gsd:research-phase`):
- **Phase 1:** next-themes integration fully documented; STACK.md and ARCHITECTURE.md provide complete implementation patterns; codebase gaps identified at line level
- **Phase 2:** Compact row is a markup restructure with well-understood Tailwind layout utilities; ARCHITECTURE.md documents current and target structure
- **Phase 3:** Directly mirrors the `LAST_CATEGORY_KEY` defensive validation pattern already in `ShoppingList.tsx`; no novel work

No phases require deeper research — all integration points confirmed from direct codebase inspection.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All packages version-verified via npm; next-themes already installed; compatibility constraints confirmed including Tailwind v4 peer dep workaround |
| Features | HIGH | Patterns verified against AnyList/OurGroceries; established mobile web conventions; post-mount restore pattern documented in PROJECT.md |
| Architecture | HIGH | Codebase examined directly; all integration points confirmed from source files; existing patterns identified at line level in ShoppingList.tsx |
| Pitfalls | HIGH | Derived from direct codebase examination plus current community sources on next-themes + Tailwind v4 + SSR dark mode |

**Overall confidence:** HIGH

### Gaps to Address

- **Sonner toaster dark mode:** `<Toaster>` in `layout.tsx` needs `theme` prop from `useTheme()` to render correctly in dark mode. Minor but easily missed — include in Phase 1 verification checklist.
- **Shadcn dropdown portals in dark mode:** Dropdowns render in a portal outside the normal component tree. Verify `.dark` class on `<html>` propagates to portaled elements via `globals.css` `:is(.dark *)` selector. Confirm during Phase 1 verification; low-likelihood issue but worth a deliberate check.
- **next-themes React 19 peer dep warning:** Installs with `--legacy-peer-deps`. Functionally compatible; monitor for upstream fix. No action needed now.

## Sources

### Primary (HIGH confidence)
- Codebase examined directly (2026-03-18) — `globals.css`, `layout.tsx`, `(app)/layout.tsx`, `dashboard/page.tsx`, `ShoppingList.tsx` (lines 208-217 for post-mount pattern), `ItemRow.tsx`, `package.json`
- [next-themes GitHub — pacocoursey/next-themes](https://github.com/pacocoursey/next-themes) — ThemeProvider config, suppressHydrationWarning, blocking script mechanism, React 19 peer dep issue #296
- [Tailwind CSS Dark Mode docs](https://tailwindcss.com/docs/dark-mode) — v4 `@custom-variant` strategy, `darkMode` config key removal confirmed
- [Tailwind CSS Theme Variables docs](https://tailwindcss.com/docs/theme) — `@theme` block, CSS custom property generation
- npm registry (verified 2026-03-18) — next-themes@0.4.6, next@16.1.6, tailwindcss@4.2.1, drizzle-orm@0.45.1, better-auth@1.5.4

### Secondary (MEDIUM confidence)
- [Dark Mode Next.js 15 + Tailwind v4 — sujalvanjare.com](https://www.sujalvanjare.com/blog/dark-mode-nextjs15-tailwind-v4) — verified integration pattern
- [Theme colors with Tailwind v4 and Next Themes — medium.com](https://medium.com/@kevstrosky/theme-colors-with-tailwind-css-v4-0-and-next-themes-dark-light-custom-mode-36dca1e20419) — CSS variable dark override pattern
- [Understanding & Fixing FOUC in Next.js App Router 2025 — dev.to](https://dev.to/amritapadhy/understanding-fixing-fouc-in-nextjs-app-router-2025-guide-ojk) — hydration mismatch patterns
- [Tailwind v4 dark mode selector discussion](https://github.com/tailwindlabs/tailwindcss/discussions/13863) — confirmed `@custom-variant` as correct v4 approach
- AnyList and OurGroceries — direct product observation for feature benchmarking

---
*Research completed: 2026-03-18*
*Ready for roadmap: yes*
