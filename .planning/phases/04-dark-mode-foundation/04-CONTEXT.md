# Phase 4: Dark Mode Foundation - Context

**Gathered:** 2026-03-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Wire ThemeProvider and audit color tokens so the app renders correctly in System, Light, and Dark modes. Deliver a three-state toggle on all page headers. No new pages or features — this phase is purely theming infrastructure and the toggle UI.

</domain>

<decisions>
## Implementation Decisions

### Toggle appearance
- Cycling icon button: one button cycles System → Light → Dark on each click
- Icon changes with mode: monitor (system) → sun (light) → moon (dark)
- **Responsive label**: icon only on mobile, icon + current mode text on desktop (e.g. "☀ Light")
- Tooltip on hover shows current mode name (both breakpoints)

### Toggle placement
- **Dashboard**: top-right of the existing controls bar (alongside store filter and org mode controls) — no new header component needed
- **Settings and onboarding pages**: top-right corner, floating — consistent position without requiring a full header
- All pages use the same `DarkModeToggle` component

### Theme switching transition
- Smooth 150ms fade on `background-color` and `color` only — no `transition: all`
- Keeps the switch feeling polished without mobile jank

### ThemeProvider wiring (implementation notes for planner)
- Add `suppressHydrationWarning` to `<html>` in root `layout.tsx`
- Wrap children with `<ThemeProvider attribute="class" defaultTheme="system" enableSystem>` from `next-themes`
- `next-themes` is already installed — `--legacy-peer-deps` flag needed if re-installing for React 19

### Color token audit
- `globals.css` already has a complete `.dark {}` block with all semantic CSS custom properties — no new CSS needed
- `@custom-variant dark (&:is(.dark *))` already declared
- Audit task: find components using hardcoded color classes (`bg-white`, `bg-gray-*`, `text-gray-900`, etc.) and replace with semantic tokens (`bg-background`, `text-foreground`, etc.)
- Body uses `@apply bg-background text-foreground` — correct pattern

### Claude's Discretion
- Exact icon library choice (Lucide is already in use — use Sun/Moon/Monitor icons from there)
- Sonner Toaster dark mode prop (`theme` prop on `<Toaster>`) — add it, don't ask
- Shadcn dropdown portal dark mode — verify during implementation, fix if needed
- Specific transition CSS implementation

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Theme infrastructure
- `.planning/research/STACK.md` — next-themes version, Tailwind v4 dark mode pattern, React 19 peer dep workaround
- `.planning/research/PITFALLS.md` — FOUC prevention, correct wiring order (ThemeProvider before toggle), hydration pitfalls

### Requirements
- `.planning/REQUIREMENTS.md` — DARK-01 through DARK-04, VIS-03

### Existing code
- `src/app/globals.css` — complete `.dark {}` block and `@custom-variant` declaration (already correct)
- `src/app/layout.tsx` — insertion point for ThemeProvider and suppressHydrationWarning
- `src/app/(app)/dashboard/_components/ShoppingList.tsx` — existing post-mount preference restore pattern to follow for theme hook

No external ADRs — requirements fully captured above.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/components/ui/button.tsx` — use for the toggle button base
- `src/components/ui/dropdown-menu.tsx` — available if toggle design changes, not needed for cycling button
- Lucide icons already in use — Sun, Moon, Monitor icons available

### Established Patterns
- Post-mount preference restore: `ShoppingList.tsx` uses a `preferencesLoaded` gate to avoid SSR/client hydration mismatch — `useTheme()` hook's `mounted` check follows the same pattern
- localStorage keys follow `SCREAMING_SNAKE_CASE` convention (e.g. `TRIP_STORE_FILTER_KEY`)

### Integration Points
- `src/app/layout.tsx`: wrap `{children}` + `<Toaster>` inside `<ThemeProvider>` — root RSC, no "use client" needed on layout itself
- `src/app/(app)/dashboard/_components/ShoppingList.tsx`: toggle button goes top-right of the controls bar (alongside store filter / org mode)
- `src/app/(app)/household/settings/page.tsx`: floating top-right position
- `src/app/(app)/onboarding/page.tsx`: floating top-right position

</code_context>

<specifics>
## Specific Ideas

- Responsive toggle: icon-only on mobile, icon + mode label text on desktop — matches how other responsive controls work in the app

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 04-dark-mode-foundation*
*Context gathered: 2026-03-18*
