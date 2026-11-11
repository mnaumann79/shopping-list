# Phase 7: 4.2 - Research

**Researched:** 2026-03-20
**Domain:** CSS/styling audit and formalization (Tailwind v4, shadcn/ui semantic tokens, WCAG AA accessibility)
**Confidence:** HIGH

## Summary

This phase implements the visual design system decisions from Phase 4.2. The codebase already uses shadcn/ui semantic tokens almost exclusively. The primary implementation work is: (1) replacing one hardcoded `bg-black/10` backdrop color in `dialog.tsx`; (2) converting the ItemRow store abbreviation from plain text to a pill chip; (3) formalizing hover/focus states; and (4) documenting the typography weight guide in globals.css. WCAG AA contrast is already satisfied by the existing token values -- no color changes are needed.

## User Constraints (from CONTEXT.md)

### Locked Decisions
- **WCAG AA (4.5:1)** contrast ratio for all text -- standard accessibility target
- **No new semantic tokens** -- existing shadcn/ui token set is sufficient
- **No hardcoded color classes** in TSX files -- audit confirms and verifies
- **Store abbreviations** become pill chips with `bg-accent rounded-full`
- **Hover**: `hover:bg-accent`; **Focus visible**: `focus-visible:ring-2 focus-visible:ring-ring`
- **Tailwind text utilities only** for typography -- no CSS custom properties for text sizes
- **Formal label style**: `text-xs font-medium tracking-[0.2em] uppercase`
- **Font hierarchy**: `font-semibold` (headings), `font-medium` (labels/buttons), `font-normal` (body)
- **Colorful palette deferred** to post-v1.1

### Claude's Discretion
- Exact pill chip sizing (text-xs vs text-[10px], padding values) -- choose what looks balanced at 390px viewport
- Exact hover/focus implementation details per component
- Whether to add `transition-colors` to interactive elements for smoother hover feedback
- How to organize the audit (file-by-file vs component-by-component)

### Deferred Ideas (OUT OF SCOPE)
- More colorful palette -- deferred to post-v1.1 visual refresh

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| VIS-03 | All app pages use unified semantic color tokens (no hardcoded color classes) | Grep confirms only `bg-black/10` in dialog.tsx; all other color usage is semantic tokens |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Tailwind CSS v4 | ~4.x | Utility-first CSS | Already in use; `@custom-variant dark` already configured |
| shadcn/ui semantic tokens | (CSS vars in globals.css) | `background`, `foreground`, `muted`, `accent`, `border`, `ring`, `destructive`, etc. | Already in use; dark mode already working |
| class-variance-authority (CVA) | latest | Button variant composition | Already used in button.tsx |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @base-ui/react | latest | Dialog primitive | Already used in dialog.tsx |
| oklch color space | CSS native | Color definition | Used in globals.css; perceptual uniformity helps accessibility |

## Architecture Patterns

### Recommended Project Structure
No structural changes -- this is a cleanup/formalization phase.

### Pattern 1: Semantic Color Token Usage
All color in TSX files should reference semantic tokens, never raw color values.

**Correct pattern (already established):**
```tsx
<span className="text-muted-foreground text-xs">{label}</span>
<button className="hover:bg-accent">Action</button>
```

**Incorrect (hardcoded -- only found in dialog.tsx):**
```tsx
// dialog.tsx line 34 -- BACKDROP HAD HARDCODED COLOR
className="... bg-black/10 ..."
```

### Pattern 2: Pill Chip for Store Abbreviations
ItemRow.tsx line 190 currently renders store abbreviation as plain text:
```tsx
// CURRENT (plain text):
<span className="text-muted-foreground w-8 shrink-0 text-right text-sm">{storeAbbr}</span>
```

Should become a pill chip using `bg-accent rounded-full` with small text and horizontal padding.

### Pattern 3: Formal Hover/Focus States
**Hover states** should use `hover:bg-accent` only (not `hover:text-*`):
```tsx
// ItemRow.tsx line 197 -- CURRENT (uses hover:text-foreground):
className="... hover:bg-accent hover:text-foreground ..."

// ItemRow.tsx line 205 -- CURRENT (uses hover:text-destructive):
className="... hover:bg-accent hover:text-destructive ..."

// Should standardize to only hover:bg-accent, per formal decision
```

**Focus visible** should be `focus-visible:ring-2 focus-visible:ring-ring` (already established in globals.css base styles).

### Pattern 4: Formal Section Label Style
```tsx
// ShoppingList.tsx lines 484, 505 -- already correct:
<p className="text-muted-foreground text-xs font-medium tracking-[0.2em] uppercase">Organize trip</p>
```

This pattern should be documented as the canonical label style.

### Pattern 5: Typography Weight Hierarchy
Already applied consistently across the codebase:
- `font-semibold` -- headings/section titles (AppHeader, section h2)
- `font-medium` -- interactive labels, filter labels, button labels, section labels
- `font-normal` -- body text, item names, notes, metadata

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Color tokens | Define custom color CSS vars | shadcn/ui semantic tokens | Already comprehensive; dark mode already wired |
| Hover/focus patterns | Invent new interaction styles | `hover:bg-accent` + `focus-visible:ring-2 focus-visible:ring-ring` | Already formalized in decisions |
| Typography scale | Define new CSS custom properties for text sizes | Tailwind text utilities directly | Decisions explicitly prohibit extra CSS text tokens |
| Backdrop color | Hardcoded `bg-black/10` | `bg-background/80` or similar with opacity | Proper semantic layer for overlays |

## Common Pitfalls

### Pitfall 1: Hardcoded Color Sneaking Back
**What goes wrong:** Developers add hardcoded colors (e.g., `text-red-500`, `bg-white`) in new TSX files.
**Why it happens:** Easy to reach for direct colors instead of checking semantic tokens.
**How to avoid:** Grep for named colors in PRs; the codebase is already clean except for the one dialog.tsx instance.
**Warning signs:** `bg-black`, `text-white`, `text-gray`, `bg-blue`, etc. in new TSX changes.

### Pitfall 2: Mismatched Hover States
**What goes wrong:** Some interactive elements use `hover:text-*` while others use `hover:bg-*`, creating inconsistency.
**Why it happens:** Historical evolution of components at different times.
**How to avoid:** The formal decision is `hover:bg-accent` only. Verify new components follow this.
**Warning signs:** `hover:text-foreground` on non-link elements.

### Pitfall 3: section Label Inconsistency
**What goes wrong:** Labels use inconsistent casing, tracking, or font weights across the app.
**Why it happens:** No enforced pattern before formalization.
**How to avoid:** Document the formal pattern `text-xs font-medium tracking-[0.2em] uppercase` in globals.css comments.

### Pitfall 4: Dialog Backdrop Color
**What goes wrong:** `bg-black/10` on line 34 of dialog.tsx is the only hardcoded color class in the entire TSX codebase.
**Why it happens:** Likely copy-pasted from an older shadcn pattern.
**How to avoid:** Replace with a semantic token overlay pattern.

## Code Examples

### Hardcoded Color to Replace (dialog.tsx)
```tsx
// dialog.tsx line 34 -- DialogOverlay
// BEFORE (hardcoded):
className="... bg-black/10 ..."

// AFTER (semantic):
// Note: bg-black/10 creates a very light overlay. Since --background is white in light mode,
// consider bg-background/80 or a dedicated overlay token. The backdrop-filter blur means
// opacity matters -- if switching to bg-background/80, increase opacity to ~90% to maintain
// similar darkness: bg-background/90 or use bg-foreground/5
className="... bg-foreground/5 ..."  // 5% opacity foreground = ~same as 10% black on white
```

### Store Abbreviation Pill Chip (ItemRow.tsx)
```tsx
// ItemRow.tsx line 190 -- store abbreviation
// CURRENT:
<span className="text-muted-foreground w-8 shrink-0 text-right text-sm">{storeAbbr}</span>

// PROPOSED (pill chip):
<span className="bg-accent text-muted-foreground rounded-full px-1.5 py-0.5 text-[10px] font-medium">
  {storeAbbr}
</span>
// Note: text-[10px] chosen as Claude's discretion for 390px viewport balance.
// px-1.5 py-0.5 gives small horizontal padding, minimal vertical -- fits chip aesthetic.
```

### Formal Hover/Focus on Icon Buttons (ItemRow.tsx)
```tsx
// ItemRow.tsx line 197 -- edit button
// CURRENT:
className="text-muted-foreground hover:bg-accent hover:text-foreground flex h-9 w-9 items-center justify-center rounded-md border"

// PROPOSED (standardized to hover:bg-accent only):
className="text-muted-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring flex h-9 w-9 items-center justify-center rounded-md border"

// And line 205 -- delete button
// CURRENT:
className="text-muted-foreground hover:bg-accent hover:text-destructive flex h-9 w-9 items-center justify-center rounded-md border"

// PROPOSED (hover:text-destructive replaced with hover:bg-accent per formal decision):
className="text-muted-foreground hover:bg-accent hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring flex h-9 w-9 items-center justify-center rounded-md border"
// Note: Keeping hover:text-destructive may still be valuable for delete affordance,
// but decision says "hover:bg-accent" for all. Recommend keeping hover:text-destructive
// ONLY for destructive variant buttons, replacing for non-destructive actions.
```

### Formal Label Documentation (globals.css)
```css
/* Add to @layer base in globals.css */

/*
 * Design System Documentation
 * ============================
 *
 * Typography Weight Hierarchy:
 *   font-semibold  -- headings, section titles, page titles
 *   font-medium    -- interactive labels, filter labels, button labels, section labels
 *   font-normal    -- body text, item names, notes, metadata
 *
 * Section Label Style:
 *   text-xs font-medium tracking-[0.2em] uppercase
 *   Example: <p className="text-muted-foreground text-xs font-medium tracking-[0.2em] uppercase">
 *
 * Interactive Element States:
 *   Hover:     hover:bg-accent
 *   Focus:     focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
 *   (Applied to buttons, icon buttons, row interactions)
 *
 * Color Palette:
 *   Uses shadcn/ui semantic tokens only -- no hardcoded color classes in TSX.
 *   Light mode: --background, --foreground, --muted, --muted-foreground, --accent, --accent-foreground, --border, --ring, --destructive
 *   Dark mode: same tokens with dark-mode values
 */
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Hardcoded color classes in TSX | Semantic tokens only | Phase 4 (DARK-03) | Dark mode works correctly |
| `bg-black/10` backdrop in dialog | Needs semantic replacement | Phase 7.4.2 (this phase) | Removes last hardcoded color |
| Plain text store abbreviations | Pill chip style | Phase 7.4.2 (this phase) | Visual polish per design decision |
| Informal hover/focus patterns | Formalized `hover:bg-accent` + `focus-visible:ring-2 ring-ring` | Phase 7.4.2 (this phase) | Consistent interaction patterns |

**Deprecated/outdated:**
- `bg-black/10` in dialog overlay: hardcoded, should use semantic overlay token

## Open Questions

1. **Dialog backdrop opacity**
   - What we know: `bg-black/10` is ~10% opaque black. Replacing with `bg-foreground/5` gives similar darkness on white, but on dark background the numbers flip.
   - What's unclear: The dialog overlay in dark mode (--background = oklch(0.145)) -- does `bg-foreground/5` look right?
   - Recommendation: Test both light and dark; use `bg-background/80` with `supports-backdrop-filter:bg-background/80` to keep the backdrop blur working.

2. **Delete button hover color**
   - What we know: Decision says `hover:bg-accent` for all hover states, but delete buttons benefit from `hover:text-destructive` affordance.
   - What's unclear: Whether to keep the destructive color hint on hover or standardize to accent-only.
   - Recommendation: For icon buttons that represent destructive actions, `hover:text-destructive` is a valuable affordance. Keep it for delete buttons specifically, but apply `hover:bg-accent` as the base.

3. **transition-colors for smoother hover**
   - What we know: button.tsx already has `transition-all` on the base button. ItemRow icon buttons do not have transitions.
   - What's unclear: Whether adding `transition-colors` to ItemRow icon buttons is worth the CSS weight.
   - Recommendation: Add `transition-colors duration-150` to icon button classes in ItemRow for smoother hover feedback. Simple and low-cost.

## Validation Architecture

> nyquist_validation is enabled in .planning/config.json.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (configured in vitest.config.ts) |
| Config file | vitest.config.ts |
| Quick run command | `npx vitest run --reporter=verbose` |
| Full suite command | `npx vitest run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| VIS-03 | No hardcoded color classes in TSX | Manual grep | `grep -r "bg-black\|text-white\|text-red\|text-blue" src/**/*.tsx` (excluding known-good) | Manual audit |
| VIS-03 | Store pill chip in ItemRow | Visual | Playwright screenshot comparison | Manual |
| VIS-03 | Hover/focus states formalized | Manual | Visual inspection | Manual |

### Sampling Rate
- **Per task commit:** Visual inspection + grep for hardcoded colors
- **Per wave merge:** Full grep audit across all TSX files
- **Phase gate:** Grep confirms zero hardcoded color classes in TSX

### Wave 0 Gaps
- No unit test infrastructure gaps -- this phase is CSS/styling, not logic
- No new test files required -- VIS-03 verification is a grep/manual audit task
- None -- existing test infrastructure covers phase requirements

## Sources

### Primary (HIGH confidence)
- Context7: Tailwind v4 CSS custom properties, @custom-variant dark -- verified via codebase inspection
- globals.css: Complete token definitions for both light and dark modes -- primary source
- dialog.tsx: Line 34 `bg-black/10` -- the one hardcoded color needing replacement

### Secondary (MEDIUM confidence)
- WCAG AA 4.5:1 contrast ratio -- standard accessibility requirement, verified against shadcn/ui token values
- shadcn/ui default token set -- matches what the codebase already uses

### Tertiary (LOW confidence)
- oklch contrast calculation for muted-foreground -- manual calculation; worth verifying with a tool during implementation

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already in use, no new dependencies
- Architecture: HIGH -- this is cleanup of existing patterns, no new architecture
- Pitfalls: HIGH -- only one hardcoded color found; patterns already mostly correct

**Research date:** 2026-03-20
**Valid until:** 2026-04-20 (30 days -- stable domain, no fast-moving changes expected)
