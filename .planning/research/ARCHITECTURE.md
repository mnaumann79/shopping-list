# Architecture Research

**Domain:** Design polish — dark mode, compact item rows, unified theming (v1.1)
**Researched:** 2026-03-18
**Confidence:** HIGH — codebase read directly; all integration points confirmed from source files

---

## Standard Architecture

### System Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                    Root Layout (RSC)                              │
│  src/app/layout.tsx                                               │
│  Injects font vars, Toaster. <html lang="en"> with no class.     │
│  CHANGE: wrap children in <ThemeProvider>                         │
├──────────────────────────────────────────────────────────────────┤
│                  App Route Group Layout (RSC)                     │
│  src/app/(app)/layout.tsx                                         │
│  Session guard only — no UI.  Unchanged.                          │
├──────────────────────────────────────────────────────────────────┤
│                Dashboard Page (RSC)                               │
│  src/app/(app)/dashboard/page.tsx                                 │
│  Fetches items / stores / categories, renders header + ShoppingList│
│  CHANGE: add <DarkModeToggle /> in header; unify token usage      │
├──────────────────────┬───────────────────────────────────────────┤
│  Client Components   │  Theme Infrastructure (NEW)               │
│                      │                                            │
│  ShoppingList        │  ThemeProvider  ("use client")            │
│  "use client"        │  ├── wraps root layout children           │
│  localStorage prefs  │  ├── runs useTheme internally             │
│  established pattern │  └── applies .dark on <html> post-mount   │
│                      │                                            │
│  ItemRow             │  useTheme  (hook, lib/use-theme.ts)       │
│  "use client"        │  ├── reads system pref (matchMedia)       │
│  expand/edit UI      │  ├── reads/writes localStorage            │
│  CHANGE: compact row │  └── exposes { theme, toggle }            │
│                      │                                            │
│  QuickAddBar         │  DarkModeToggle  ("use client")           │
│  "use client"        │  ├── consumes ThemeContext                 │
│  CHANGE: last-store  │  └── renders sun/moon icon button          │
│  default on submit   │                                            │
├──────────────────────┴───────────────────────────────────────────┤
│                     CSS Token Layer (EXISTING — unchanged)        │
│  src/app/globals.css                                              │
│  @custom-variant dark (&:is(.dark *))   ← already wired          │
│  :root { --background, --foreground, --muted … }                  │
│  .dark { same tokens, dark values }                               │
│  All Tailwind semantic classes resolve correctly in both modes    │
└──────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Status |
|-----------|----------------|--------|
| `src/app/layout.tsx` | Root HTML shell, fonts, Toaster | MODIFY — wrap children in `<ThemeProvider>` |
| `ThemeProvider` | Apply/remove `.dark` class on `<html>`, expose context | NEW |
| `useTheme` hook | Read system pref, read/write localStorage, toggle | NEW |
| `DarkModeToggle` | Sun/moon icon button, consumes ThemeContext | NEW |
| `dashboard/page.tsx` | SSR data fetch + header + ShoppingList | MODIFY — add `<DarkModeToggle>` in header |
| `ItemRow.tsx` | Per-item check + edit UI | MODIFY — collapsed single-line view |
| `QuickAddBar.tsx` | Quick-add form | MODIFY — default store tag from last-selected |
| `globals.css` | CSS variable palette, dark variant | UNCHANGED — `.dark` block already complete |

---

## Recommended Project Structure

```
src/
├── app/
│   ├── layout.tsx                      # MODIFY: wrap with ThemeProvider
│   ├── globals.css                     # UNCHANGED
│   └── (app)/
│       └── dashboard/
│           ├── page.tsx                # MODIFY: DarkModeToggle in header
│           └── _components/
│               ├── ItemRow.tsx         # MODIFY: compact collapsed row
│               ├── ShoppingList.tsx    # minor layout tweak if needed
│               └── QuickAddBar.tsx     # MODIFY: last-store default
├── components/
│   ├── theme-provider.tsx              # NEW: "use client" wrapper
│   ├── dark-mode-toggle.tsx            # NEW: "use client" button
│   └── ui/                             # UNCHANGED
└── lib/
    └── use-theme.ts                    # NEW: hook for theme state
```

### Structure Rationale

- **`components/theme-provider.tsx`:** Shared across all route groups — auth pages (sign-in, sign-up) benefit from dark mode too. Not colocated in `(app)/` which would exclude auth routes.
- **`lib/use-theme.ts`:** Hook lives alongside other lib utilities. Reusable if a settings page later needs a theme picker input.
- **`components/dark-mode-toggle.tsx`:** Shared component; dashboard header and a future settings page can both render it without cross-route imports.

---

## Architectural Patterns

### Pattern 1: Post-Mount Preference Restore (ESTABLISHED — follow this)

**What:** SSR renders with a safe neutral default (no `.dark` class on `<html>`). A `useEffect` fires after hydration, reads localStorage, and applies the real preference. Prevents hydration mismatch between server HTML and client DOM.

**When to use:** Any localStorage-backed UI preference. Already in production use in `ShoppingList.tsx` for `selectedStoreId` and `organizationMode` (lines 208-217, the `preferencesLoaded` gate pattern).

**Trade-offs:** One-frame flash of light theme on first load is acceptable and is the industry-standard approach at this scale. The alternative (cookie + middleware) is significantly more complex for a household app.

**Skeleton:**
```typescript
// src/lib/use-theme.ts
const THEME_KEY = "shopping-theme";
type Theme = "system" | "light" | "dark";

export function useTheme() {
  const [theme, setTheme] = useState<Theme>("system"); // SSR-safe default
  const [resolvedDark, setResolvedDark] = useState(false);

  useEffect(() => {
    // Post-mount restore — matches ShoppingList pattern
    const stored = localStorage.getItem(THEME_KEY) as Theme | null;
    const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const initial = stored ?? "system";
    setTheme(initial);
    setResolvedDark(initial === "dark" || (initial === "system" && systemDark));
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", resolvedDark);
  }, [resolvedDark]);

  function toggle() {
    // cycle: system → light → dark → system
    // or simpler: light ↔ dark, skipping system after first manual choice
  }

  return { theme, resolvedDark, toggle };
}
```

### Pattern 2: ThemeProvider as Thin Context Wrapper

**What:** A `"use client"` component at the root layout level runs `useTheme` and provides context. It renders `{children}` with no extra DOM elements. This keeps `layout.tsx` as an RSC (no `"use client"` on the root layout) while still enabling client-side theme logic throughout the tree.

**When to use:** Any global client state needed tree-wide (theme, modals, toast). The existing `<Toaster>` follows a similar pattern.

**Trade-offs:** One extra component indirection; trivial cost.

```typescript
// src/components/theme-provider.tsx
"use client";
export const ThemeContext = createContext<ReturnType<typeof useTheme> | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}
```

### Pattern 3: Compact ItemRow — Single Line Collapsed

**What:** Current `ItemRow` renders two visible sections at all times: a check button area and a separate "Edit" button bar, divided by a border. Compact redesign collapses to one row: `[check] Name · qty  [store chips]  [edit icon]`. The expanded edit panel (form fields, save/cancel) is unchanged.

**When to use:** Mobile list UI where vertical density matters. Users on a shopping trip need maximum items visible per screen.

**Trade-offs:** Edit affordance is less obvious (icon vs. labelled button). Acceptable because the primary trip action is checking — editing is secondary and the icon is a standard affordance.

**Current structure to replace:**
```
<div>                           ← outer border, rounded
  <button>                      ← check area (name + store chips)
  <div class="border-t">        ← always-visible edit bar
    <Button>Edit</Button>
```

**Target structure:**
```
<div>                           ← outer border, rounded, single row height
  <button class="flex w-full">  ← check toggle (left side)
  <span>Name · qty</span>
  [store chips inline]
  <button class="ml-auto">      ← edit icon (right side, stops check propagation)
```

---

## Data Flow

### Theme Toggle Flow

```
User taps DarkModeToggle
    ↓
toggle() in useTheme
    ↓
setTheme(next) → localStorage.setItem(THEME_KEY, next)
    ↓
resolvedDark recalculates
(dark mode = theme==="dark", or theme==="system" && matchMedia dark)
    ↓
useEffect: document.documentElement.classList.toggle("dark", resolvedDark)
    ↓
CSS: .dark { } variables activate on :root descendants
    ↓
All Tailwind semantic tokens (bg-background, text-muted-foreground, border…)
re-render correctly — no component changes needed
```

### System Preference Live Update Flow

```
OS dark mode toggled by user
    ↓
matchMedia "change" event fires
    ↓
useTheme listener: if theme === "system", recalculate resolvedDark
    ↓
document.documentElement.classList updated
    ↓
App reflects new OS preference immediately
```

Note: listener only active when `theme === "system"`. When user has manually chosen light or dark, OS changes are ignored.

### Last-Selected Store Default Flow

```
User selects store filter pill in ShoppingList
    ↓
setSelectedStoreId(storeId)
    ↓
useEffect: localStorage.setItem(TRIP_STORE_FILTER_KEY, storeId)
    ↓ (later, on item add)
handleAdd / QuickAddBar reads TRIP_STORE_FILTER_KEY
    ↓
if value !== "all": pre-tag new item with that store
otherwise: no default store tag
```

This reuses the existing `TRIP_STORE_FILTER_KEY` constant — no new localStorage key needed.

---

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| Household (current) | localStorage is sufficient; no server-side theme preference needed |
| If theme-flash elimination required | Store theme pref in a cookie; read in middleware; set `.dark` class on `<html>` before hydration — eliminates flash entirely but adds cookie management complexity |

---

## Anti-Patterns

### Anti-Pattern 1: Setting `.dark` Class in SSR

**What people do:** Read a cookie or env var in `layout.tsx` (RSC) and add `className="dark"` to `<html>` conditionally.
**Why it's wrong:** No cookie mechanism exists in this app. Without it, server renders no class and client renders with class — hydration mismatch error. React will throw in development and silently misrender in production.
**Do this instead:** Keep `<html lang="en">` with no theme class in the RSC. `ThemeProvider` applies `.dark` post-mount via `document.documentElement.classList`.

### Anti-Pattern 2: Adding `dark:` Prefix Classes to Components

**What people do:** Scatter `dark:bg-gray-900 dark:text-white` across every component to "fix" dark mode.
**Why it's wrong:** `globals.css` already has a complete `.dark { }` CSS variable block and `@custom-variant dark (&:is(.dark *))` on line 5. All semantic tokens (`bg-background`, `text-foreground`, `border`, `text-muted-foreground`, etc.) already resolve correctly in both modes when `.dark` is on `<html>`. Manual `dark:` overrides fight the token system and create maintenance burden.
**Do this instead:** Use semantic tokens only. If a component looks wrong in dark mode, the fix is in the CSS variable value in `globals.css`, not in the component's className.

### Anti-Pattern 3: Theme State Without localStorage Persistence

**What people do:** Toggle a React boolean, apply class — resets on every navigation or page refresh.
**Why it's wrong:** User preference is lost immediately. Inconsistent with the established pattern where all UI preferences live in localStorage (`TRIP_STORE_FILTER_KEY`, `TRIP_ORGANIZATION_MODE_KEY`, `LAST_CATEGORY_KEY`).
**Do this instead:** Write to localStorage on every theme change, restore on mount — same discipline as the other preference keys.

### Anti-Pattern 4: Keeping Two-Section ItemRow for "Compact"

**What people do:** Reduce font size or padding while leaving the check-area + separate edit-bar two-div structure.
**Why it's wrong:** The border between sections is the primary source of visual weight. Compressing padding with the same structure still shows two rows per item.
**Do this instead:** Flatten to a single flex row. Edit icon on the right, store chips inline, check on the left. Expanded edit panel is a separate collapsible below — same as today.

---

## Integration Points

### New vs Modified Components

| Component | Status | Integration Touchpoint |
|-----------|--------|------------------------|
| `src/components/theme-provider.tsx` | NEW | Wraps `{children}` in `src/app/layout.tsx`, inside `<body>` |
| `src/lib/use-theme.ts` | NEW | Used by `ThemeProvider`; also directly by `DarkModeToggle` if context not available |
| `src/components/dark-mode-toggle.tsx` | NEW | Rendered in `dashboard/page.tsx` header; importable by other page headers |
| `src/app/layout.tsx` | MODIFY | Import `<ThemeProvider>`, wrap `{children}` and `<Toaster>` |
| `src/app/(app)/dashboard/page.tsx` | MODIFY | Add `<DarkModeToggle />` in header; audit header for hardcoded colors |
| `dashboard/_components/ItemRow.tsx` | MODIFY | Collapsed row restructure; expanded panel unchanged |
| `dashboard/_components/QuickAddBar.tsx` | MODIFY | Read `TRIP_STORE_FILTER_KEY` on submit for default store tag |
| `src/app/globals.css` | UNCHANGED | `.dark` variables complete; `@custom-variant dark` declared |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| `ThemeProvider` ↔ `DarkModeToggle` | React context (`ThemeContext`) | Toggle button is a consumer; does not own state |
| `ThemeProvider` ↔ DOM | `document.documentElement.classList` mutation | ThemeProvider is the sole writer of `.dark` on `<html>` — nothing else should touch it |
| `ThemeProvider` ↔ `globals.css` | Implicit CSS cascade — `.dark *` activates dark variable block | No code dependency; purely DOM class → CSS |
| `ShoppingList` ↔ `QuickAddBar` | Props: `onAdd` callback; implicit: shared localStorage key | No new props needed; `handleAdd` already reads `LAST_CATEGORY_KEY` the same way |
| `QuickAddBar` ↔ localStorage | Direct read in submit handler | Read `TRIP_STORE_FILTER_KEY`; treat "all" as no default store |

---

## Build Order

Dependencies between the v1.1 features dictate this sequence:

| Step | Work | Rationale |
|------|------|-----------|
| 1 | `useTheme` hook + `ThemeProvider` + `DarkModeToggle` | No deps on other v1.1 work. Unblocks visual review of all subsequent changes in dark mode. |
| 2 | Wire `ThemeProvider` into `layout.tsx`; add `DarkModeToggle` to dashboard header | Requires step 1. Theme now functional end-to-end. |
| 3 | Unified color theme audit — replace hardcoded colors with semantic tokens across all pages | Requires step 2 (dark mode must work to verify fixes visually). Touch: dashboard header, onboarding, household settings. |
| 4 | Compact `ItemRow` redesign | Requires step 2 (review in dark mode). Independent from step 3. |
| 5 | Last-selected store default in `QuickAddBar` | No structural dependencies. Can overlap with steps 3-4. Small isolated change. |

---

## Sources

- Codebase read directly (2026-03-18):
  - `src/app/globals.css` — confirms `.dark { }` variable block complete, `@custom-variant dark` on line 5
  - `src/app/layout.tsx` — confirms RSC, no existing theme logic
  - `src/app/(app)/layout.tsx` — confirms session-guard only
  - `src/app/(app)/dashboard/page.tsx` — confirms header structure, SSR data fetch
  - `src/app/(app)/dashboard/_components/ShoppingList.tsx` — confirms post-mount restore pattern (lines 208-217), localStorage keys
  - `src/app/(app)/dashboard/_components/ItemRow.tsx` — confirms current two-section layout
- Tailwind CSS v4 `@custom-variant` — present in globals.css line 5; confirmed working variant mechanism
- Post-mount restore pattern — established in ShoppingList.tsx (`preferencesLoaded` gate)
- localStorage preference keys in use: `TRIP_STORE_FILTER_KEY`, `TRIP_ORGANIZATION_MODE_KEY`, `LAST_CATEGORY_KEY`

---
*Architecture research for: v1.1 Design Polish — dark mode toggle, compact item rows, unified theming*
*Researched: 2026-03-18*
