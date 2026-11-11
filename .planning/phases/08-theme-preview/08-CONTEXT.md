# Phase 8: Theme Preview - Context

**Gathered:** 2026-03-20
**Status:** Fully implemented

<domain>
## Phase Boundary

Add temporary theme preview switches to the settings page. Users can preview three alternative palettes (Warm & Inviting, Clean & Fresh, Bold & Playful) before committing to one. If approved, the chosen palette becomes the new default theme and preview code is removed. If rejected, all preview code is removed.

</domain>

<decisions>
## Implementation Decisions

### Three Preview Themes

**Warm & Inviting** — Soft, cozy, notebook feel
```
--primary:           oklch(0.45 0.08 45)    /* Terracotta */
--accent:            oklch(0.60 0.05 130)   /* Sage green */
--font-sans:         'Nunito', ui-sans-serif, system-ui, sans-serif
--font-heading:      'Fraunces', ui-serif, Georgia, serif
```
Dark mode: `--primary: oklch(0.65 0.12 45)`, `--accent: oklch(0.65 0.06 130)`

**Clean & Fresh** — Modern grocery app, professional
```
--primary:           oklch(0.65 0.12 145)   /* Fresh green */
--accent:            oklch(0.55 0.15 250)    /* Blueberry */
--font-sans:         'Plus Jakarta Sans', ui-sans-serif, system-ui, sans-serif
--font-heading:      'Poppins', ui-sans-serif, system-ui, sans-serif
```
Dark mode: `--primary: oklch(0.72 0.15 145)`, `--accent: oklch(0.65 0.15 250)`

**Bold & Playful** — Energetic, fun to use
```
--primary:           oklch(0.65 0.18 50)    /* Electric coral */
--accent:            oklch(0.65 0.15 200)    /* Electric teal */
--secondary:         oklch(0.93 0.02 280)    /* Soft lavender */
--font-sans:         'DM Sans', ui-sans-serif, system-ui, sans-serif
--font-heading:      'Fredoka', ui-sans-serif, system-ui, sans-serif
```
Dark mode: `--primary: oklch(0.72 0.18 50)`, `--accent: oklch(0.72 0.15 200)`

### Preview Approach
- Three mutually exclusive toggle switches in settings: "Warm & Inviting", "Clean & Fresh", "Bold & Playful"
- Enabling one automatically disables the others
- When enabled: adds `.warm-preview`, `.clean-preview`, or `.bold-preview` class to `<html>` which overrides all CSS variables
- Theme selection persisted to `localStorage` key `"theme-preview"` with values `"warm"`, `"clean"`, or `"bold"`
- On page load, a `useEffect` reads localStorage and re-applies the saved theme class
- When all toggles off: no preview class, original palette restored

### Font Loading Fix
- **Bug**: Original used `var(--font-sans)` as fallback which created circular reference — browser resolved to just font name with no system stack, breaking font loading
- **Fix**: All preview themes use explicit complete font stacks: `'FontName', ui-sans-serif, system-ui, sans-serif`
- Google Fonts loaded via single `<link>` in root layout with all 6 fonts: Fraunces, Nunito, Poppins, Plus Jakarta Sans, Fredoka, DM Sans

### Toggle UI
- Switch components in settings page under "Theme Preview" section
- Three labels: "Warm & Inviting", "Clean & Fresh", "Bold & Playful"
- Each has a short description (e.g. "Terracotta, sage, cream — soft and cozy")
- Toggle state persisted in localStorage (survives refresh)

### Scope: REMOVE AFTER DECISION
- This preview is EXPLICITLY TEMPORARY
- After user decides: either adopt chosen palette permanently OR remove all preview code
- No localStorage migration needed at this stage

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing Code
- `src/app/globals.css` — CSS variables, dark mode block, and `.warm-preview` / `.clean-preview` / `.bold-preview` blocks
- `src/app/layout.tsx` — Google Fonts `<link>` with all 6 fonts
- `src/app/(app)/household/settings/_components/HouseholdSettingsClient.tsx` — Theme preview toggle component
- `.planning/PROJECT.md` — warm palette deferred from Phase 4.2

### Established Patterns
- CSS variables for theming (already in globals.css)
- Dark mode via `.dark` compound selector on preview class (e.g., `.warm-preview.dark`)
- `document.documentElement.classList.add/remove()` for theme switching

### Integration Points
- globals.css — `.warm-preview`, `.clean-preview`, `.bold-preview` blocks with full CSS variable overrides
- Root layout — Google Fonts `<link>` tag
- HouseholdSettingsClient — three `useState` initializers reading localStorage, mount `useEffect` to apply saved class

</canonical_refs>

<codebase>
## Existing Code Insights

### Reusable Assets
- `src/components/ui/switch` — shadcn/ui Switch component for toggles
- `src/components/ui/label` — Label component
- `src/app/(app)/household/settings/_components/HouseholdSettingsClient.tsx` — Settings component where toggles live

### Theme Class Application
- `document.documentElement.classList.add('warm-preview')` in toggle `onCheckedChange`
- Mount `useEffect` reads `localStorage.getItem("theme-preview")` and applies saved class
- CSS cascade: preview class variables override `:root` variables; `.dark` class variables override both

### Font Stack Pattern
- Always use explicit complete stacks: `'FontName', ui-sans-serif, system-ui, sans-serif`
- Never use `var(--font-sans)` as fallback inside a block that already sets `--font-sans`

</codebase>

<specifics>
## Specific Ideas

- User wanted to preview multiple palette directions before committing
- Three themes built sequentially: Warm → Clean → Bold
- Font loading bug discovered when fonts reverted on refresh — fixed by using explicit stacks
- localStorage persistence added so selection survives page refresh
- Mutually exclusive toggles: enabling one disables the other two

</specifics>

<deferred>
## Deferred Ideas

- Final theme adoption (remove preview code once palette chosen)
- Removing unused Google Fonts for non-chosen themes after decision

</deferred>

---

*Phase: 08-theme-preview*
*Context updated: 2026-03-20*
