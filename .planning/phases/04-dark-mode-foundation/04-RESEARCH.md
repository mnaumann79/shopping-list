# Phase 4: Dark Mode Foundation - Research

**Researched:** 2026-03-18
**Domain:** next-themes + Tailwind v4 dark mode on Next.js 16 App Router (React 19)
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Toggle appearance: cycling icon button — System → Light → Dark on each click
- Icons: Monitor (system), Sun (light), Moon (dark) from Lucide
- Responsive label: icon only on mobile, icon + current mode text on desktop ("System" / "Light" / "Dark")
- Tooltip on hover shows current mode name (both breakpoints)
- Dashboard placement: top-right of the existing controls bar (alongside store filter and org mode controls) — no new header component
- Settings and onboarding pages: floating top-right corner
- All pages use the same `DarkModeToggle` component
- Transition: smooth 150ms fade on `background-color` and `color` only — no `transition: all`
- Add `suppressHydrationWarning` to `<html>` in root `layout.tsx`
- Wrap children with `<ThemeProvider attribute="class" defaultTheme="system" enableSystem>` from `next-themes`
- next-themes is already installed — `--legacy-peer-deps` flag needed only if re-installing
- `globals.css` already has a complete `.dark {}` block — no new CSS needed
- `@custom-variant dark (&:is(.dark *))` already declared — do not change
- Audit task: find components using hardcoded color classes and replace with semantic tokens

### Claude's Discretion
- Exact icon library choice (Lucide is already in use — use Sun/Moon/Monitor icons from there)
- Sonner Toaster dark mode prop (`theme` prop on `<Toaster>`) — add it
- Shadcn dropdown portal dark mode — verify during implementation, fix if needed
- Specific transition CSS implementation

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DARK-01 | User can toggle between System, Light, and Dark themes | DarkModeToggle component with three-state cycle; useTheme() from next-themes |
| DARK-02 | Theme preference persists across browser sessions | next-themes persists to localStorage automatically via ThemeProvider |
| DARK-03 | Page loads with correct theme applied (no flash of incorrect theme) | next-themes injects blocking inline script before paint; suppressHydrationWarning on html |
| DARK-04 | Theme toggle is accessible from all page headers | Single DarkModeToggle component placed in dashboard controls bar, settings floating, onboarding floating |
| VIS-03 | All app pages use unified semantic color tokens (no hardcoded color classes) | Color audit of src/ — grep confirmed zero hardcoded bg-white/bg-gray/text-gray currently; audit still needed during implementation to stay clean |
</phase_requirements>

---

## Summary

This phase wires `next-themes` ThemeProvider into the existing Next.js 16 App Router root layout and builds a single `DarkModeToggle` component that cycles System → Light → Dark. The infrastructure prerequisites are already largely in place: `next-themes` v0.4.6 is installed, `globals.css` has a complete `.dark {}` CSS variable block, and `@custom-variant dark` is declared for Tailwind v4. The three implementation gaps are: (1) ThemeProvider is not yet in layout.tsx, (2) `suppressHydrationWarning` is not on `<html>`, and (3) the `DarkModeToggle` component does not exist yet.

The color token audit (VIS-03) is a prerequisite for verifiable dark mode. A scan of the current codebase found zero hardcoded color classes — shadcn/ui components already use semantic tokens and the app components appear clean. The audit task during this phase is therefore a verification pass, not a major remediation effort.

The key risk is FOUC (Flash of Unstyled Content) — the server renders `<html>` without a dark class, and without next-themes' blocking inline script, dark-mode users see a white flash. next-themes prevents this automatically when wired correctly. The mount guard pattern (`if (!mounted) return <placeholder />`) on the toggle component is required to prevent a secondary hydration mismatch on the toggle icon itself.

**Primary recommendation:** Wire ThemeProvider first, then build DarkModeToggle, then place it in the three locations, then run the color audit pass. Do not reverse this order.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| next-themes | 0.4.6 (installed) | Three-state theme management, FOUC prevention, persistence | Injects blocking inline script before paint; wraps localStorage persistence; single source of truth for theme state |
| Lucide React | installed | Sun / Moon / Monitor toggle icons | Already in use project-wide; all three icons available |
| shadcn Button | installed (ghost variant) | Toggle button base | Provides ghost hover, focus ring, accessible click target — no custom button needed |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| React `useState` / `useEffect` | React 19 (installed) | Mount guard for toggle component | Required to avoid SSR/client hydration mismatch on the toggle icon |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| next-themes | Manual inline script | next-themes IS the well-tested inline script — rolling it by hand produces the same result with more code to maintain. CONTEXT.md decision: use next-themes. |
| next-themes | CSS-only `prefers-color-scheme` | Loses manual override capability (cannot satisfy DARK-01 with CSS-only approach) |

**Installation:** next-themes is already installed. No new packages required for this phase.

---

## Architecture Patterns

### Recommended Project Structure

```
src/
├── app/
│   ├── layout.tsx                    # Add ThemeProvider + suppressHydrationWarning
│   └── providers.tsx                 # New: 'use client' wrapper for ThemeProvider
├── components/
│   └── DarkModeToggle.tsx            # New: cycling toggle component
└── app/(app)/
    ├── dashboard/_components/
    │   └── ShoppingList.tsx          # Add <DarkModeToggle /> to controls bar
    ├── household/settings/page.tsx   # Add <DarkModeToggle /> floating top-right
    └── onboarding/page.tsx           # Add <DarkModeToggle /> floating top-right
```

### Pattern 1: ThemeProvider Wiring

**What:** Extract ThemeProvider into a `providers.tsx` client component; import it in the RSC root layout.
**When to use:** Root layout is a Server Component — it cannot directly import a Client Component with context. The providers wrapper isolates the `'use client'` boundary.

```tsx
// src/app/providers.tsx
'use client'
import { ThemeProvider } from 'next-themes'

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      {children}
    </ThemeProvider>
  )
}
```

```tsx
// src/app/layout.tsx (modified)
<html lang="en" suppressHydrationWarning>
  <body ...>
    <Providers>
      {children}
      <Toaster theme={...} />  {/* Toaster moves inside Providers */}
    </Providers>
  </body>
</html>
```

**Source:** `.planning/research/STACK.md` — v1.1 Design Polish: Dark Mode setup, Steps 2 and 3.

### Pattern 2: Mount Guard on Toggle Component

**What:** Return a same-dimension placeholder `<div>` until the component is mounted on the client.
**When to use:** Any component that reads `resolvedTheme` from `useTheme()` — value is `undefined` on the server and immediately after hydration begins.

```tsx
'use client'
import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'
import { Sun, Moon, Monitor } from 'lucide-react'
import { Button } from '@/components/ui/button'

const CYCLE: Array<'system' | 'light' | 'dark'> = ['system', 'light', 'dark']

export function DarkModeToggle() {
  const [mounted, setMounted] = useState(false)
  const { theme, setTheme } = useTheme()

  useEffect(() => setMounted(true), [])

  if (!mounted) return <div className="w-8 min-h-[44px]" />

  const current = (theme as 'system' | 'light' | 'dark') ?? 'system'
  const next = CYCLE[(CYCLE.indexOf(current) + 1) % CYCLE.length]

  const Icon = current === 'dark' ? Moon : current === 'light' ? Sun : Monitor
  const label = current === 'dark' ? 'Dark' : current === 'light' ? 'Light' : 'System'

  return (
    <Button variant="ghost" size="icon" onClick={() => setTheme(next)}
      className="min-h-[44px]" title={tooltipFor(current)}>
      <Icon className="size-4" />
      <span className="hidden sm:inline ml-1 text-sm">{label}</span>
    </Button>
  )
}
```

**Source:** `.planning/research/STACK.md` — Step 4 (adapted for three-state cycle); `.planning/research/PITFALLS.md` — Pitfall 2 (mount guard).

### Pattern 3: CSS Transition on html Element

**What:** Declare 150ms `background-color` + `color` transition on `<html>` in `globals.css`.
**When to use:** Prevents jarring instant theme swap without touching `transition: all` (which causes mobile jank).

```css
/* globals.css — add inside @layer base or directly */
html {
  transition: background-color 150ms ease, color 150ms ease;
}
```

**Source:** `04-UI-SPEC.md` — DarkModeToggle Transition specification.

### Pattern 4: Sonner Toaster Theme Integration

**What:** The `<Toaster />` in layout needs to receive the resolved theme to render dark/light toast styles.
**When to use:** Toaster must be inside ThemeProvider scope to call `useTheme()`.

The Toaster must be moved inside the `<Providers>` wrapper. Create a thin `ThemedToaster` client component if needed:

```tsx
'use client'
import { useTheme } from 'next-themes'
import { Toaster } from '@/components/ui/sonner'

export function ThemedToaster() {
  const { resolvedTheme } = useTheme()
  return <Toaster theme={resolvedTheme as 'light' | 'dark' | 'system'} />
}
```

**Source:** `.planning/research/PITFALLS.md` — Integration Gotchas table (Sonner toaster); `04-UI-SPEC.md` — Sonner Toaster section.

### Anti-Patterns to Avoid

- **`transition: all` on html:** Causes every CSS property to animate on theme switch — visible reflow and mobile jank. Use only `background-color` and `color`.
- **Reading `localStorage` directly for theme:** Causes FOUC. next-themes handles this internally.
- **Storing theme in React state:** Resets on navigation. Use `setTheme()` from `useTheme()` only.
- **Using `darkMode: 'class'` in tailwind.config.js:** Tailwind v4 removed this key. Already using `@custom-variant dark` in globals.css — correct.
- **Skipping the mount guard:** `resolvedTheme` is `undefined` server-side. Rendering the icon without a mount check causes hydration mismatch.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| FOUC prevention | Custom inline script in `<head>` | `next-themes` ThemeProvider | next-themes IS the well-tested inline script with SSR/Next.js edge cases handled |
| Theme persistence | `localStorage.setItem('theme', ...)` in useEffect | `next-themes` | next-themes persists automatically; manual approach produces FOUC and hydration warnings |
| OS preference tracking | `window.matchMedia('prefers-color-scheme')` listener | `next-themes` `enableSystem` prop | next-themes manages the media query listener and tears it down correctly |

**Key insight:** next-themes is not an abstraction over a trivial thing — it solves three distinct hard problems (FOUC, persistence, SSR safety) in 10 lines of setup. The investment is already paid; use it fully.

---

## Common Pitfalls

### Pitfall 1: FOUC — Missing suppressHydrationWarning or ThemeProvider Not at Root

**What goes wrong:** Server renders `<html>` without `.dark`. next-themes applies `.dark` on the client before hydration completes. React detects mismatch or corrects with a visible white flash.
**Why it happens:** `suppressHydrationWarning` is not yet on `<html>` (confirmed by reading layout.tsx). ThemeProvider wired after children, or inside a non-root component.
**How to avoid:** `suppressHydrationWarning` must be on `<html>` before ThemeProvider is added. ThemeProvider must wrap `{children}` at the root layout level.
**Warning signs:** Console warns `Prop 'className' did not match. Server: "" Client: "dark"`. Users see white flash on hard-refresh in dark mode.

### Pitfall 2: Conflict with Existing Post-Mount Pattern

**What goes wrong:** `useTheme()` returns `undefined` for `resolvedTheme` until client mounts — a different "wait for mount" from the app's `preferencesLoaded` pattern in ShoppingList.tsx. Conflating them causes double-render waterfalls or wrong initial icon.
**Why it happens:** Both patterns are "wait for client" but they are independent systems for independent concerns.
**How to avoid:** Keep `next-themes` state in `next-themes`. Keep filter/sort state in the existing localStorage pattern. The toggle component has its own `mounted` guard independent of `preferencesLoaded`.
**Warning signs:** Toggle renders wrong initial icon (Moon when theme is light). Preferences briefly reset on navigation.

### Pitfall 3: Toaster Outside ThemeProvider Scope

**What goes wrong:** `<Toaster />` currently lives in layout.tsx outside any ThemeProvider. After ThemeProvider is added, if Toaster stays outside, it cannot call `useTheme()` and will always render in light mode.
**Why it happens:** ThemeProvider is added as an inner wrapper — Toaster ends up outside it.
**How to avoid:** Move `<Toaster />` (or a ThemedToaster wrapper) inside `<Providers>` in layout.tsx.
**Warning signs:** Toast notifications appear with white background in dark mode.

### Pitfall 4: Shadcn Dropdown Portal Not Receiving Dark Class

**What goes wrong:** Shadcn dropdowns render in a portal appended to `document.body`. If `.dark` on `<html>` doesn't propagate to portal elements, dropdowns render with light background in dark mode.
**Why it happens:** The `@custom-variant dark (&:is(.dark *))` selector should propagate since `body` is a child of `html.dark`. In practice, verify after implementation.
**How to avoid:** Test store filter and sort dropdowns in dark mode after wiring. If they fail, pass `className="dark"` to the portal container prop on the dropdown component.
**Warning signs:** Dropdown popup appears white/light while the rest of the page is dark.

---

## Code Examples

### ThemeProvider Setup (verified pattern)

```tsx
// src/app/providers.tsx
'use client'
import { ThemeProvider } from 'next-themes'

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      {children}
    </ThemeProvider>
  )
}
```

Source: `.planning/research/STACK.md` — v1.1 Dark Mode setup, Step 2.

### layout.tsx Changes (two modifications)

```tsx
// src/app/layout.tsx
<html lang="en" suppressHydrationWarning>   {/* ADD suppressHydrationWarning */}
  <body ...>
    <Providers>          {/* WRAP children */}
      {children}
      <ThemedToaster />  {/* Toaster inside Providers scope */}
    </Providers>
  </body>
</html>
```

Source: `.planning/research/STACK.md` — Step 3; `.planning/research/PITFALLS.md` — Pitfall 1.

### Transition CSS (globals.css addition)

```css
html {
  transition: background-color 150ms ease, color 150ms ease;
}
```

Source: `04-UI-SPEC.md` — DarkModeToggle Transition specification.

### useTheme() API (next-themes v0.4.6)

```tsx
const { theme, resolvedTheme, setTheme } = useTheme()
// theme: 'system' | 'light' | 'dark' — what the user explicitly set
// resolvedTheme: 'light' | 'dark' — the actual resolved theme (system → resolved)
// Use resolvedTheme for icon rendering; use theme for the cycling logic
```

Source: `.planning/research/STACK.md` — Step 4 annotation.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `darkMode: 'class'` in tailwind.config.js | `@custom-variant dark (&:is(.dark *))` in globals.css | Tailwind v4 | Config file approach does nothing in v4; CSS approach already in place |
| Auth.js / NextAuth | Better Auth | Sept 2025 | Not relevant to this phase but documents ecosystem shift |

**Deprecated/outdated:**
- `darkMode: 'class'` config key: removed in Tailwind v4. Already using correct `@custom-variant` approach.

---

## Open Questions

1. **Shadcn dropdown portal dark propagation**
   - What we know: `@custom-variant dark (&:is(.dark *))` should work since portals append to `document.body` which is a descendant of `html.dark`
   - What's unclear: Whether the existing store filter / sort dropdowns work correctly in dark mode without explicit portal class
   - Recommendation: Implement and verify; fix reactively if needed (low effort — add `className="dark"` to portal container)

2. **Toaster theme prop type safety**
   - What we know: `theme` prop on Sonner `<Toaster>` accepts `'light' | 'dark' | 'system'`; `resolvedTheme` from next-themes is `string | undefined`
   - What's unclear: Whether `resolvedTheme` can be undefined after mount (it should not be, but TypeScript may require a cast)
   - Recommendation: Cast `resolvedTheme as 'light' | 'dark' | 'system'` with a fallback to `'system'`

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Playwright (detected: `src/app/(app)/__tests__/`) |
| Config file | Wave 0 — check for playwright.config.ts |
| Quick run command | `npx playwright test --grep "dark-mode"` |
| Full suite command | `npx playwright test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DARK-01 | Toggle cycles System → Light → Dark on each click; icon changes | e2e | `npx playwright test --grep "DARK-01"` | ❌ Wave 0 |
| DARK-02 | Theme preference persists after tab close/reopen | e2e (storage state) | `npx playwright test --grep "DARK-02"` | ❌ Wave 0 |
| DARK-03 | No FOUC on hard refresh in dark mode | e2e (screenshot/paint timing) | `npx playwright test --grep "DARK-03"` | ❌ Wave 0 |
| DARK-04 | Toggle appears on dashboard, settings, and onboarding pages | e2e (selector present) | `npx playwright test --grep "DARK-04"` | ❌ Wave 0 |
| VIS-03 | No hardcoded `bg-white`/`bg-gray-*` in source; pages render correct dark surfaces | lint + e2e screenshot | `npx playwright test --grep "VIS-03"` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `npx playwright test --grep "dark-mode" --reporter=dot`
- **Per wave merge:** `npx playwright test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `src/app/(app)/__tests__/dark-mode.spec.ts` — covers DARK-01, DARK-02, DARK-03, DARK-04, VIS-03
- [ ] Playwright config detection — verify `playwright.config.ts` exists; create if absent

---

## Sources

### Primary (HIGH confidence)

- `.planning/research/STACK.md` — next-themes v0.4.6 setup steps, ThemeProvider config, suppressHydrationWarning, Tailwind v4 @custom-variant pattern (codebase-examined, 2026-03-18)
- `.planning/research/PITFALLS.md` — FOUC prevention, mount guard pattern, Sonner integration, dropdown portal gotcha (codebase-examined, 2026-03-18)
- `src/app/globals.css` — direct verification: `.dark {}` block complete, `@custom-variant dark` declared, `body { @apply bg-background text-foreground }` correct
- `src/app/layout.tsx` — direct verification: no ThemeProvider, no suppressHydrationWarning — these are the two gaps to fix
- `04-UI-SPEC.md` — copywriting contract, component specifications, interaction states (project-generated, 2026-03-18)
- `04-CONTEXT.md` — locked implementation decisions (project-generated, 2026-03-18)

### Secondary (MEDIUM confidence)

- [next-themes GitHub — pacocoursey/next-themes](https://github.com/pacocoursey/next-themes) — ThemeProvider API, localStorage persistence, flash prevention
- [Tailwind CSS Dark Mode docs](https://tailwindcss.com/docs/dark-mode) — v4 @custom-variant strategy

### Tertiary (LOW confidence)

- None required — all critical claims verified from codebase or official sources.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — next-themes v0.4.6 confirmed installed in package.json; API verified in STACK.md
- Architecture: HIGH — ThemeProvider pattern verified; gaps in layout.tsx confirmed by direct read
- Pitfalls: HIGH — FOUC and mount guard patterns verified against PITFALLS.md which cites direct codebase examination
- Color audit scope: HIGH — grep confirmed zero hardcoded color classes currently; audit is a verification pass

**Research date:** 2026-03-18
**Valid until:** 2026-04-18 (next-themes is stable; Tailwind v4 dark mode pattern is locked)
