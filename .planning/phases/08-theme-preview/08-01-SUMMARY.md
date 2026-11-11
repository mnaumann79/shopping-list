---
phase: "08-theme-preview"
plan: "01"
subsystem: ui
tags: [theme, warm-palette, google-fonts, settings, switch]

# Dependency graph
requires:
  - phase: "07-visual-design-system"
    provides: "CSS variable structure, semantic token patterns, globals.css organization"
provides:
  - "Temporary warm palette preview via .warm-preview class"
  - "Fraunces + Nunito font pairing loaded from Google Fonts"
  - "Settings toggle to enable/disable warm preview"
affects:
  - "globals.css (add .warm-preview overrides)"
  - "settings page (add preview toggle)"
  - "root layout (add Google Fonts link)"

# Tech tracking
tech-stack:
  added:
    - "@radix-ui/react-switch"
    - "Google Fonts: Fraunces (variable), Nunito (variable)"
  patterns:
    - "CSS variable overrides via class (.warm-preview on <html>)"
    - "Non-persistent toggle state (useState, not localStorage)"

key-files:
  created:
    - "src/components/ui/switch.tsx"
  modified:
    - "src/app/globals.css"
    - "src/app/layout.tsx"
    - "src/app/(app)/household/settings/_components/HouseholdSettingsClient.tsx"

key-decisions:
  - "Switch component created using @radix-ui/react-switch following existing radix-ui pattern in codebase"
  - "Warm preview toggle added to HouseholdSettingsClient.tsx (the actual settings client) rather than the server page component"
  - "Non-persistent toggle: state is in-memory only, reload required per toggle hint text"

patterns-established:
  - "CSS variable overrides via class on <html> for theme previews"
  - "Google Fonts loaded via <link> tags in root layout head"

requirements-completed: []

# Metrics
duration: 5min
completed: 2026-03-20
---

# Phase 08 Theme Preview Plan 01 Summary

**Warm palette preview with Fraunces + Nunito font pairing toggleable from settings page**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-20T20:21:51Z
- **Completed:** 2026-03-20T20:26:21Z
- **Tasks:** 3
- **Files modified:** 4 (3 modified, 1 created)

## Accomplishments

- `.warm-preview` CSS class added to globals.css overriding all semantic tokens with warm terracotta/sage/cream palette
- Fraunces (headings) and Nunito (body) loaded from Google Fonts via layout.tsx
- Settings page (HouseholdSettingsClient) gained "Preview warm palette" toggle using new Switch component

## Task Commits

Each task was committed atomically:

1. **Task 1: Add warm palette CSS variables** - `60b5680` (feat)
2. **Task 2: Add Google Fonts to root layout** - `04bd9d6` (feat)
3. **Task 3: Add preview toggle to settings page** - `258572e` (feat)

## Files Created/Modified

- `src/app/globals.css` - Added `.warm-preview` block with terracotta primary (oklch 0.45 0.08 45), sage accent, warm cream backgrounds, and heading font rules
- `src/app/layout.tsx` - Added Google Fonts `<link>` for Fraunces and Nunito in `<head>`
- `src/app/globals.css` (Task 2) - Added `--font-sans: 'Nunito', ...` and `--font-heading: 'Fraunces', ...` to `:root`
- `src/app/(app)/household/settings/_components/HouseholdSettingsClient.tsx` - Added warm preview toggle section with Switch component
- `src/components/ui/switch.tsx` - New component using @radix-ui/react-switch

## Decisions Made

- Created Switch component using @radix-ui/react-switch following the same pattern as existing Label component (also radix-based)
- Added toggle to HouseholdSettingsClient.tsx (the client component) rather than the server page component, since the toggle needs React state
- Plan referenced `src/app/(app)/settings/page.tsx` but actual route is `src/app/(app)/household/settings/` - implementation placed in correct file

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## Next Phase Readiness

- Warm palette preview infrastructure is in place
- Settings page toggle ready for user testing
- Fraunces and Nunito fonts available site-wide (only applied via `.warm-preview` class for now)

---
*Phase: 08-theme-preview*
*Completed: 2026-03-20*
