# Stack Research

**Domain:** Household shared shopping list web app (multi-user, mobile-first browser)
**Researched:** 2026-03-10 (v1.0) / 2026-03-18 (v1.1 Design Polish additions)
**Confidence:** HIGH (all versions verified via npm, official docs confirmed)

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Next.js | 16.1.6 | Full-stack React framework | App Router provides server components, server actions, and file-based routing — eliminates a separate backend. Pages Router is legacy; App Router is the current standard. Server Actions replace REST endpoints for simple mutations like adding/checking items. |
| TypeScript | 5.x (bundled) | Type safety across the full stack | Types flow from DB schema → ORM → server actions → React components with no extra glue. Shopping list CRUD is simple; TypeScript catches shape mismatches early and is now the default in `create-next-app`. |
| Tailwind CSS | 4.2.1 | Utility-first styling | Mobile-first by default — critical since users are on phone at the store. Pairs with shadcn/ui. Tailwind v4 drops the config file in favor of CSS-native config. |
| shadcn/ui | latest (copy-paste) | Accessible UI component primitives | Not a dependency — components are copied into your codebase. Radix UI primitives underneath, so keyboard navigation and ARIA come for free. Dominant in the Next.js ecosystem. Only include components you need (keeps bundle small). |
| Drizzle ORM | 0.45.1 | Database access layer | Smaller bundle than Prisma (critical for serverless/Vercel). Schema is TypeScript — no code generation step, types update instantly on edit. Native Neon serverless driver support. SQL-like queries are readable and debuggable. |
| Neon | managed | Serverless PostgreSQL | Best Postgres choice for Vercel deployments. Scale-to-zero billing is ideal for household-scale usage (no traffic at 3am = $0 compute). Native HTTP driver works in Vercel's serverless functions. Free tier is generous for a private household app. |
| Better Auth | 1.5.4 | Authentication | The Auth.js team joined Better Auth in September 2025 — it is the forward-looking choice. TypeScript-first, plugin architecture, Drizzle adapter built-in, email+password + social providers. Auth.js v5 receives security patches only. |
| TanStack Query | 5.90.21 | Server state / data fetching / cache | Handles cache invalidation after mutations (e.g., after checking off an item). Pairs naturally with Next.js Server Actions as mutation triggers. Built-in `refetchInterval` for lightweight polling (replaces real-time for this project). |
| Zustand | 5.0.11 | Client UI state | Manages ephemeral UI state: active store filter, sort preference, items pending check-off. Lightweight (< 1kb). Does not duplicate server state — TanStack Query owns that. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Zod | 3.x | Schema validation | Validate Server Action inputs before writing to DB. Prevents malformed data from client submissions. Use everywhere a user submits data (add item, edit item, auth forms). |
| React Hook Form | 7.x | Form state management | Add-item and edit-item forms. Integrates with Zod via `@hookform/resolvers`. Avoids uncontrolled input pitfalls in React. |
| @neondatabase/serverless | 1.x | Neon HTTP driver | Required for Drizzle + Neon in Vercel serverless. Use instead of `pg` to avoid TCP connection issues in serverless runtimes. |
| drizzle-kit | 0.31.9 | DB migrations and introspection | Run `drizzle-kit generate` and `drizzle-kit migrate` for schema migrations. Keep in devDependencies. |
| nuqs | 2.x | URL search params as state | Persist filter/sort state in URL so sharing a link shows the same view. Use for active store filter and sort order. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| create-next-app | Project scaffolding | Run `npx create-next-app@latest` — selects App Router, TypeScript, Tailwind by default in 2026. |
| Turbopack | Dev bundler | Enabled by default in Next.js 16 dev. Turbopack builds are in beta (15.5+) — use `--turbopack` flag for builds too. Significantly faster than Webpack for HMR. |
| ESLint | Linting | Use standalone `eslint` config (not `next lint` — deprecated in 15.5, removed in 16). `npx create-next-app` generates `eslint.config.mjs` automatically. |
| Biome | Fast linting + formatting alternative | Alternative to ESLint + Prettier combined. Now supported in `create-next-app` setup flow. Choose at project init. |

## Installation

```bash
# Scaffold the project (choose TypeScript, Tailwind, App Router, no src/ dir is fine)
npx create-next-app@latest shopping-list

# ORM + database
npm install drizzle-orm @neondatabase/serverless
npm install -D drizzle-kit

# Auth
npm install better-auth

# Server state / client state
npm install @tanstack/react-query zustand

# Forms + validation
npm install zod react-hook-form @hookform/resolvers

# URL state
npm install nuqs

# shadcn/ui init (copies components into /components/ui/)
npx shadcn@latest init
# Then add components as needed:
npx shadcn@latest add button input checkbox sheet dialog

# v1.1 Design Polish — dark mode
npm install next-themes --legacy-peer-deps
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Next.js 16 App Router | Remix v2 | Remix is a solid choice with better progressive enhancement and more explicit data loading patterns; use it if your team prefers loader/action conventions over Server Actions. |
| Drizzle ORM | Prisma 6 | Prisma if your team is new to databases and wants automated migrations + Prisma Studio GUI. Prisma's larger bundle (Rust binary) is a non-issue on Node.js servers but matters on edge/serverless. |
| Neon | Supabase | Supabase if you want auth + realtime + storage in one platform. For this project, Better Auth + Neon is cleaner because Supabase's auth becomes redundant. Use Supabase if real-time sync is added later (it has Realtime built-in). |
| Better Auth | Clerk | Clerk if you want zero-code auth UI components and don't mind vendor lock-in at ~$25/month. Overkill for a household app with a handful of users. |
| TanStack Query | SWR | SWR is simpler but has less sophisticated cache invalidation and no built-in mutation helpers. TanStack Query is preferred for any app doing writes. |
| Tailwind v4 + shadcn/ui | Mantine or Chakra UI | Mantine/Chakra if you want a larger pre-built component set without copy-paste. shadcn/ui is preferred because you own the code and bundle only what you use. |
| next-themes | Manual inline script | next-themes is a thin, well-tested wrapper around exactly the inline script approach needed to prevent FOUC. No value in duplicating it. |
| next-themes | CSS-only `prefers-color-scheme` (no toggle) | Does not satisfy the requirement for a user-controlled manual override. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Next.js Pages Router | Legacy routing system, no Server Components, no Server Actions. Active development is on App Router. | App Router (default in Next.js 13+) |
| NextAuth.js / Auth.js v4 | Maintenance-only — the team moved to Better Auth in Sept 2025. Starting new projects on v4 means migrating soon. | Better Auth 1.x |
| WebSockets / Supabase Realtime | Out of scope per PROJECT.md. Complexity vs. value unclear for household scale. TanStack Query polling covers the use case. | TanStack Query `refetchInterval` polling |
| Redux / Redux Toolkit | Heavyweight global state for a problem that doesn't need it. Shopping list state is server state (owned by TanStack Query) + minimal UI state (owned by Zustand). | TanStack Query + Zustand |
| TypeORM | Active development has stalled; TypeScript-first experience is poor compared to Drizzle. Decorators-based schema is non-standard. | Drizzle ORM |
| `pg` (node-postgres) directly | TCP connections don't work reliably in Vercel serverless functions. Requires connection pooling workarounds. | `@neondatabase/serverless` HTTP driver |
| Separate Express/Fastify API server | Unnecessary complexity for this scale. Next.js Server Actions and Route Handlers cover all API needs. | Server Actions + Route Handlers |
| `darkMode: 'class'` in tailwind.config.js | Tailwind v4 removed this config key entirely. Setting it does nothing or throws. | `@custom-variant dark (&:where(.dark, .dark *))` in globals.css |
| Reading `localStorage` directly for dark mode | Causes FOUC in SSR — server cannot know theme preference. Requires manual flash-prevention inline script. | next-themes (handles flash prevention internally) |

## Stack Patterns by Variant

**If real-time sync is added later (revisit per PROJECT.md):**
- Migrate DB to Supabase (swap Neon + replace `@neondatabase/serverless` with Supabase client)
- Use Supabase Realtime subscriptions in client components
- Better Auth remains; configure it to use the Supabase Postgres connection
- TanStack Query subscription can be replaced with `useEffect` + Supabase channel

**If native mobile app is needed later:**
- Expose Server Actions as proper REST endpoints via Route Handlers for the mobile client
- Or use tRPC with the existing data layer — Drizzle + Better Auth stay unchanged
- The DB schema requires no changes

**If household scales to a SaaS (multi-household):**
- Neon's branching and scale-out covers this without migration
- Add organization/team plugin to Better Auth (built-in plugin)
- No stack changes required

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| next@16.x | react@19.x, react-dom@19.x | React 19 is required for Next.js 16. `create-next-app` installs the right React version automatically. |
| drizzle-orm@0.45.x | drizzle-kit@0.31.x | Keep drizzle-orm and drizzle-kit in sync — mismatches cause migration generation errors. |
| better-auth@1.x | drizzle-orm@0.45.x | Use `better-auth/adapters/drizzle` — the Drizzle adapter is bundled and maintained by the Better Auth team. |
| @tanstack/react-query@5.x | react@18+ or @19 | v5 supports React 19. Use `QueryClientProvider` in a client component at the root layout. |
| tailwindcss@4.x | postcss@8.x | Tailwind v4 uses CSS `@import` instead of `tailwind.config.js`. The v4 setup differs from v3 — use `@tailwindcss/vite` or `@tailwindcss/postcss`. |
| shadcn/ui (latest) | tailwindcss@4.x | shadcn/ui added Tailwind v4 support in early 2025. Run `npx shadcn@latest init` and it detects your Tailwind version. |
| next-themes@0.4.6 | next@16.x, react@19.x, tailwindcss@4.x | Peer deps declare React ^16.8\|^17\|^18 (not 19). Functionally compatible. Install with `--legacy-peer-deps`. Use `attribute="class"` to match Tailwind v4 `@custom-variant` pattern. |

---

## v1.1 Design Polish: Integration Details

### Dark Mode — next-themes Setup

**Why next-themes is required:** The server cannot know the user's stored theme preference. Without an inline script that runs before browser paint, the HTML renders with the wrong theme and then corrects itself — producing a visible flash. next-themes injects this script automatically. Rolling it by hand produces the same result but with more code to maintain.

**Step 1 — globals.css: declare the dark variant for Tailwind v4**

```css
@import "tailwindcss";

@custom-variant dark (&:where(.dark, .dark *));

@theme {
  --color-background: #ffffff;
  --color-foreground: #111827;
  --color-primary: #3b82f6;
  /* add all semantic color tokens here */
}

/* Dark mode token overrides — CSS variable swap when .dark is on <html> */
.dark {
  --color-background: #111827;
  --color-foreground: #f9fafb;
  --color-primary: #60a5fa;
}
```

**Step 2 — ThemeProvider wrapper (client component)**

```tsx
// app/providers.tsx
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

- `attribute="class"` — adds/removes `.dark` on `<html>`, matching the `@custom-variant` declaration
- `defaultTheme="system"` — first-time visitors follow OS preference
- `enableSystem` — activates `prefers-color-scheme` media query listener for live OS changes

**Step 3 — Root layout: suppressHydrationWarning**

```tsx
// app/layout.tsx
<html lang="en" suppressHydrationWarning>
```

Required because next-themes modifies `class` on `<html>` before React hydration completes. Without this attribute, React logs a hydration mismatch warning on every page load.

**Step 4 — Toggle component**

```tsx
'use client'
import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'

export function ThemeToggle() {
  const [mounted, setMounted] = useState(false)
  const { resolvedTheme, setTheme } = useTheme()

  useEffect(() => setMounted(true), [])

  // Render nothing (or a placeholder) until mounted — avoids hydration mismatch on the toggle icon
  if (!mounted) return <div className="w-8 h-8" />

  return (
    <button onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}>
      {resolvedTheme === 'dark' ? 'Light' : 'Dark'}
    </button>
  )
}
```

- `resolvedTheme` — the actual active theme after resolving `'system'`; use this for the icon, not `theme`
- The `mounted` guard is the "Post-mount preference restore" pattern already validated in this project (see PROJECT.md)

### Unified Color Theming — Tailwind v4 @theme

No new library needed. Tailwind v4's `@theme` block is the single source of truth. Define semantic color tokens once; they become both Tailwind utility classes (`bg-background`, `text-foreground`) and CSS custom properties (`--color-background`). When `.dark` is toggled, the CSS variable values change and all components update — no component changes needed.

**Action:** Audit all current hardcoded color classes (`bg-white`, `text-gray-900`, etc.) across the codebase and replace with semantic `@theme` tokens. This is the bulk of the unified theming work.

### UI Density — No Library Needed

One item per line with inline name/quantity/store/notes-preview is a markup restructure. Replace the current card/block layout with a compact row. Tailwind utility classes handle the density. No new library required.

### Store-Default-on-Add — No Library Needed

Persist the last-selected store ID in `localStorage` (or in Zustand store state if already tracking UI state there). Read it as the default value when the add-item form mounts. No library required.

---

## Sources

- [next-themes GitHub](https://github.com/pacocoursey/next-themes) — ThemeProvider config, suppressHydrationWarning, localStorage persistence, flash prevention mechanism
- [Tailwind CSS Dark Mode docs](https://tailwindcss.com/docs/dark-mode) — v4 @custom-variant strategy, confirmation that `darkMode` config key is removed
- [Tailwind CSS Theme Variables docs](https://tailwindcss.com/docs/theme) — @theme block, CSS custom property generation
- [React 19 peer dep issue — next-themes #296](https://github.com/pacocoursey/next-themes/issues/296) — confirmed `--legacy-peer-deps` workaround; functional compatibility with React 19
- [Dark Mode Next.js 15 + Tailwind v4 guide](https://www.sujalvanjare.com/blog/dark-mode-nextjs15-tailwind-v4) — verified integration pattern (MEDIUM confidence, community source)
- [Theme colors with Tailwind v4 and Next Themes](https://medium.com/@kevstrosky/theme-colors-with-tailwind-css-v4-0-and-next-themes-dark-light-custom-mode-36dca1e20419) — CSS variable dark override pattern (MEDIUM confidence, community source)
- npm registry (verified 2026-03-10) — drizzle-orm@0.45.1, drizzle-kit@0.31.9, next@16.1.6, better-auth@1.5.4, @tanstack/react-query@5.90.21, zustand@5.0.11, tailwindcss@4.2.1

---
*Stack research for: Household shopping list web app*
*v1.0 researched: 2026-03-10*
*v1.1 Design Polish additions researched: 2026-03-18*
