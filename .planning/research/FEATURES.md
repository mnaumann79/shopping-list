# Feature Research

**Domain:** Mobile-first web app design polish — dark mode, compact list rows, smart store defaults, unified theming
**Researched:** 2026-03-18
**Confidence:** HIGH (established UI/UX patterns, consistent across mobile web ecosystem)

---

## Scope Note

This research covers **v1.1 Design Polish** only. Core features (auth, item CRUD, shopping trip mode, household management) are already built in v1.0. All four features below are additive polish on top of existing functionality. v1.0 feature research is preserved at the bottom of this file for reference.

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Dark mode respects system preference by default | iOS and Android both auto-apply dark mode to native apps; mobile web users expect the same | LOW | `prefers-color-scheme` CSS media query; initial render must match system pref without a flash |
| Dark mode manual override persists across sessions | Setting it once and having it reset on page reload is a UX failure | LOW | localStorage; post-mount restore pattern already established in v1.0 (PROJECT.md Key Decisions) |
| Dark mode toggle is visible and discoverable | A setting buried in a menu is invisible to most users; expect a visible icon button | LOW | Sun/moon icon in nav header is the universal convention across iOS, Android, and web |
| Compact row shows name + key metadata at a glance | Mobile users scan lists, not read paragraphs; each item taking 3+ lines makes a 20-item list feel overwhelming at the store | MEDIUM | Name (prominent, full width first line), quantity + store + notes-preview on a secondary line |
| Notes preview truncated, not hidden | Users add notes for a reason ("2% not whole", "brand X only"); hiding them entirely defeats the purpose | LOW | Single line, ellipsis overflow at ~40 chars; full notes accessible via row tap/expand |
| Store field on add form defaults to last used store | Re-selecting the same store on every item is unnecessary friction; smart default reduces taps | LOW | Persist last-used store ID in localStorage; pre-populate the store field on form mount |
| Unified color theme consistent across all pages | Inconsistent colors (different grays, random accent colors per page) signals an unfinished product; especially jarring in dark mode where some pages may still render light backgrounds | MEDIUM | CSS custom properties / design tokens applied globally; requires audit of all components and pages |

### Differentiators (Competitive Advantage)

Features that set the product apart. Not required, but valued.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Dark mode stored per-user on server | Most apps (AnyList, OurGroceries) store dark mode preference locally only; it resets on new devices or browsers — storing in user settings means it follows you | LOW | Write preference to user settings on server; fall back to localStorage for instant restore on load |
| Compact row with inline checked state | Checked items visually distinct (strikethrough + muted text) within the compact row — no layout shift, no height change | LOW | CSS class toggle on checked state; row height stays consistent whether checked or not |
| Notes tap-to-expand inline | Tap the compact row to reveal full notes inline without navigating to an edit screen; reduces navigation depth during active shopping | MEDIUM | Accordion-style expand; per-item expand state managed in component; collapse on tap again |
| Store default scoped to most-recent selection | "Last used" matches the user's mental model: "I'm shopping at Costco today" — more predictable than most-frequent which can be surprising | LOW | Single persisted value per user (last store ID used in add form); no frequency calculation needed |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Per-category color coding in dark mode | Looks polished in design mockups | High-saturation category colors are often illegible on dark backgrounds; maintaining a separate dark-mode palette for every category color doubles the theming work and ongoing maintenance | Use muted/desaturated variants via CSS `color-mix()` or reduced opacity; or restrict category colors to chips/badges with proper contrast ratios |
| Animate all colors on dark mode toggle | Smooth cross-fade feels premium | `transition: all` on every element causes layout/paint jank on low-end mobile; can interfere with existing transitions (e.g., checkbox animations) | Transition only `background-color` and `color` on root and key containers; keep duration under 200ms |
| "Most frequent" store smart default | Sounds intelligent and personalized | Non-obvious to users ("why is it defaulting to Target?"); can be wrong when switching stores for a specific trip; harder to implement (frequency counting) | Last-used is simpler, more predictable, and matches the "I'm shopping at X right now" mental model |
| Remove expanded row view in favor of forced compact | Simplifies the UI surface | Power users editing items with long notes need full field access; removing expanded view forces navigation to a separate edit screen for every change | Compact as the default display mode; tap-to-expand inline (or navigate to edit form) for full field access |
| Multiple color themes (not just light/dark) | Looks feature-rich, personalizable | Multiplies QA surface area; every theme combination (light blue, dark blue, light green, etc.) needs to be tested; high effort for low actual usage at household scale | One unified theme in light + dark variants; get both right before offering alternatives |
| System-font only, no icon library | Reduces bundle size | Icons communicate meaning faster than text on mobile; a nav with text labels only is harder to scan when your hands are full of groceries | Use a lightweight icon set (Lucide, Heroicons) already in the stack; don't add a new dependency just for this milestone |

---

## Feature Dependencies

```
[Unified Color Theme / Design Tokens]
    └──required by──> [Dark Mode Toggle]
                          └──requires──> [Dark Mode Persistence]
                                             └──requires──> [Post-mount restore pattern] (already built in v1.0)

[Compact Item Row Layout]
    └──enhances──> [Shopping Trip Filter/Sort] (already built — compact rows make filtered lists more scannable)
    └──enhances──> [Bulk Clear Completed] (more items visible at once; easier to review before clearing)
    └──optional extension──> [Notes Tap-to-Expand] (adds interaction layer on top of compact row)

[Store Default to Last Used]
    └──requires──> [Add Item Form] (already built)
    └──enhances──> [Per-item Store Tags] (already built)
```

### Dependency Notes

- **Unified color theme must precede dark mode:** Dark mode is implemented by toggling a set of CSS custom property values (e.g., `data-theme="dark"` on `<html>`). If components use hardcoded colors (hex literals, Tailwind classes like `bg-white`, `text-gray-900`), dark mode will be incomplete and patchy — some elements flip, others don't. The token/design-system audit is the required first step.
- **Post-mount preference restore is already solved:** PROJECT.md Key Decisions documents this pattern from v1.0 (SSR-safe defaults, reconcile persisted UI in effects). Dark mode preference follows the identical pattern — no new architectural work needed.
- **Compact row does not conflict with existing sort/filter:** The row redesign is purely presentational. Existing sort/filter logic operates on data, not on row markup. No risk of regression.
- **Store default is self-contained:** localStorage read on add-form mount, write on form submit (after successful item creation). No server round-trip required. No conflict with existing item creation flow.
- **Notes tap-to-expand is optional:** Compact row works without it. Expand behavior can be added after compact layout is stable.

---

## MVP Definition

### v1.1 Milestone — All Four Features Are the MVP

- [ ] **Unified color theme** — audit all components; replace hardcoded colors with CSS custom properties; verify consistency in both light and dark modes
- [ ] **Dark mode toggle** — system preference as default; manual override with sun/moon icon in nav; persisted in localStorage via post-mount restore pattern
- [ ] **Compact item row** — name on first line (bold, full width); quantity + store label + notes-preview (truncated, ellipsis) on second line; consistent row height across checked and unchecked states
- [ ] **Store defaults to last selected** — persist last-used store ID in localStorage; pre-populate add-item form store field on mount

### Not in This Milestone

- Notes tap-to-expand inline accordion — useful but adds interaction complexity; stable compact row first, then layer this on in v1.2
- Dark mode preference sync via user account (server-side) — good ergonomics but requires a backend schema change and API call on toggle; localStorage sufficient for household scale
- Per-category dark-mode color variants — only address if category colors are actively illegible in dark mode after token audit; don't pre-optimize

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Unified color theme / design tokens | HIGH | MEDIUM | P1 — prerequisite for dark mode; must go first |
| Dark mode toggle + localStorage persistence | HIGH | LOW | P1 — high user expectation on mobile browsers |
| Compact item row redesign | HIGH | MEDIUM | P1 — directly improves active shopping UX |
| Store default to last selected | MEDIUM | LOW | P1 — low cost, reduces per-item friction |
| Notes tap-to-expand inline | MEDIUM | MEDIUM | P2 — enhances compact row; defer to v1.2 |
| Dark mode sync via user account (server) | LOW | MEDIUM | P3 — localStorage sufficient at household scale |
| Multiple color themes | LOW | HIGH | P3 — one good theme beats several mediocre ones |

**Priority key:**
- P1: Must have for this milestone
- P2: Should have, add when possible
- P3: Nice to have, future consideration

---

## Competitor Feature Analysis

| Feature | AnyList | OurGroceries | Bring! | Our Approach |
|---------|---------|--------------|--------|--------------|
| Dark mode | Yes, system-aware | Yes, manual toggle | Yes, system-aware | System-aware default + manual override persisted in localStorage |
| Compact list rows | Yes (name + qty on one line) | Moderate density, no notes preview | High density, icon-heavy | Name + qty/store/notes-preview in two-line compact; consistent row height |
| Store default | No remembered default | No remembered default | N/A (no per-item store tags) | Last-used store persisted in localStorage |
| Unified theme | Consistent | Inconsistent across some settings screens | Consistent but branded heavily | CSS custom properties globally; audit all pages/components |

---

## Sources

- AnyList and OurGroceries feature set — direct product observation, HIGH confidence
- `prefers-color-scheme` — MDN Web Docs CSS media query standard, HIGH confidence
- Post-mount preference restore pattern — documented in PROJECT.md Key Decisions (established in v1.0), HIGH confidence
- localStorage for UI preference persistence — universal web pattern, HIGH confidence
- Two-line compact row (name + metadata) — standard mobile list pattern used in iOS Reminders, Google Keep, Android native lists, HIGH confidence
- Dark mode flash-of-wrong-theme prevention — well-documented Next.js / React SSR pattern, HIGH confidence

---

## v1.0 Feature Research (Reference)

*Original research from 2026-03-10 covering the full feature landscape for initial build. Preserved for context.*

**Domain:** Household shared shopping list web app

### Table Stakes — v1.0

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Add / edit / delete items | The literal core action | LOW | Needs item name, optional quantity, optional note |
| Check off items during shopping | Every shopping list app does this | LOW | Checked items move to bottom or done section |
| Category / aisle grouping | All major apps group by category | MEDIUM | Fixed category set; allow user assignment/override |
| Shared household list | Core value prop | MEDIUM | Requires user accounts + list membership model |
| User accounts / auth | Prerequisite for sharing | MEDIUM | Email + password |
| Multiple list members | Households have 2–6 people | LOW | Once accounts exist, adding members is straightforward |
| Item persistence after check-off | Users re-add same items weekly | LOW | Checked items persist; user explicitly clears |
| Mobile-responsive layout | Primary use case is at-store on phone | MEDIUM | Touch targets, readable font at arm's length |
| Re-add items from history | Same 40 items recur weekly | LOW | Single tap on history item |
| Clear completed items | Resets list after trip | LOW | Removes checked from active list; keeps in history |

### Key Decisions — v1.0

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Per-item store tags (not per-list) | More flexible | Validated — core to shopping trip filtering |
| Web-first (not native mobile) | Faster to ship, works on all devices | Validated — mobile-responsive works well |
| Individual accounts over shared login | Extensible for attribution later | Validated — enables household member management |
| Post-mount preference restore | SSR-safe defaults, then reconcile persisted UI in effects | Established — eliminates hydration mismatches |

---
*Feature research for: v1.1 Design Polish — household shopping list app*
*Researched: 2026-03-18*
