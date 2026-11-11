# Phase 7: 4.2 - Context

**Gathered:** 2026-03-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Implement the visual design system decisions from Phase 4.2: audit all hardcoded color usage, ensure WCAG AA accessibility contrast, formalize typography system (weights, labels), implement store pill chips, and formalize hover/focus states. This is implementation-only — no new design decisions.

</domain>

<decisions>
## Implementation Decisions

### Implementation Structure
- **Single comprehensive plan** — one plan covering all implementation tasks: color audit, typography formalization, pill chips, hover states, accessibility verification

### Accessibility Contrast
- **WCAG AA (4.5:1)** contrast ratio for all text — standard accessibility target sufficient for a shopping list used in varied lighting

### Color Tokens
- **No new semantic tokens** beyond shadcn/ui defaults — the existing token set (`background`, `foreground`, `muted`, `accent`, `destructive`, `border`, `ring`, etc.) is sufficient for a shopping list app
- No explicit `success`/`warning`/`info` tokens unless specific use cases arise
- No hardcoded color classes in TSX files — audit task is to confirm all usage and verify contrast compliance

### Store Tag Chips
- Store abbreviations in ItemRow become **pill chips** with `bg-accent rounded-full` — small rounded chip style, not plain text

### Hover / Focus States
- Formalized interactive element styles:
  - Hover: `hover:bg-accent`
  - Focus visible: `focus-visible:ring-2 focus-visible:ring-ring`
  - Apply to buttons, row interactions, icon buttons

### Typography Scale
- **Tailwind text utilities only** — no extra CSS custom properties for text sizes
- No formal type scale tokens added to `globals.css`

### Font Weight Guide
- Formal weight hierarchy (apply consistently across all components):
  - `font-semibold` — headings, section titles, page titles
  - `font-medium` — interactive labels, filter labels, button labels
  - `font-normal` — body text, item names, notes, metadata

### Section Labels
- Formalized uppercase label style: `text-xs font-medium tracking-[0.2em] uppercase`
- Use for: "ORGANIZE TRIP", "STORE FOCUS", and any similar section label throughout the app

### Heading Hierarchy
- **No formal heading hierarchy** — Tailwind classes used case-by-case; no enforced heading level system

### Spacing System
- **Tailwind spacing utilities as-is** — no formal spacing scale or custom spacing tokens

### Visual Palette (Deferred)
- **Colorful palette stays deferred** — user prefers to keep v1.1 focused on polish and consistency; more vibrant palette is a post-v1.1 visual redesign

### Claude's Discretion
- Exact pill chip sizing (text-xs vs text-[10px], padding values) — choose what looks balanced at 390px viewport
- Exact hover/focus implementation details per component
- Whether to add `transition-colors` to interactive elements for smoother hover feedback
- How to organize the audit (file-by-file vs component-by-component)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Prior Phase Context
- `.planning/phases/04.2-visual-design-system-colors-and-typography-audit-review-all-hardcoded-colors-and-ensure-accessibility-contrast-define-typography-system-with-font-families-sizes-weights/04.2-CONTEXT.md` — All visual design decisions (colors, contrast, typography, chips, hover/focus)

### Requirements
- `.planning/REQUIREMENTS.md` — VIS-03 (unified color tokens)

### Design Patterns
- `.planning/phases/04-dark-mode-foundation/04-CONTEXT.md` — dark mode token structure, post-mount preference restore pattern, 150ms transition
- `.planning/phases/05-compact-item-row/05-CONTEXT.md` — compact row layout, strikethrough + muted for checked state

### Existing Code
- `src/app/globals.css` — complete `.dark {}` block, CSS custom properties, `@custom-variant dark` declaration, font variables (`--font-sans`, `--font-mono`), radius tokens
- `src/app/(app)/dashboard/_components/ItemRow.tsx` — store abbreviation chip (`storeAbbr`), hover states, checked state styling
- `src/app/(app)/dashboard/_components/ShoppingList.tsx` — filter bar label styling (`text-muted-foreground text-xs font-medium tracking-[0.2em] uppercase`)

No external ADRs — requirements fully captured in decisions above.

</canonical_refs>

<codebase>
## Existing Code Insights

### Reusable Assets
- `src/components/ui/` — button, input, dialog, card, dropdown-menu, avatar, separator, sonner, form, label — all using semantic tokens
- `globals.css` — `--font-sans` and `--font-mono` already defined as CSS vars; `--radius-*` scale already defined
- Tailwind v4 with `@custom-variant dark` — semantic tokens already work with `dark:` variant

### Established Patterns
- Semantic color tokens: `text-foreground`, `text-muted-foreground`, `bg-background`, `bg-accent`, `border-border` — no hardcoded colors in TSX
- Hover: `hover:bg-accent` already used on icon buttons (ItemRow, AppHeader)
- Focus: `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring` already used
- 44px touch targets: `min-h-[44px]` on interactive elements

### Integration Points
- `globals.css` — add formal comments documenting the label style, weight guide, and hover/focus tokens
- `ItemRow.tsx` — update store abbreviation to pill chip style
- All components using `tracking-[0.2em] uppercase` — apply the formal label style token pattern
- Audit pass across all TSX files to confirm semantic token usage everywhere

</codebase>

<specifics>
## Specific Ideas

- Pill chip confirmed: small rounded chip with bg-accent for store abbreviations in ItemRow
- "Current black and white color theme is boring — needs more pop" — noted as deferred for post-v1.1

</specifics>

<deferred>
## Deferred Ideas

- **More colorful palette** — user wants a more vibrant/punchy visual direction beyond the current neutral palette. This is a visual redesign (new capability scope), not an audit. Deferred to a post-v1.1 visual refresh phase.

</deferred>

---

*Phase: 07-4-2*
*Context gathered: 2026-03-20*
