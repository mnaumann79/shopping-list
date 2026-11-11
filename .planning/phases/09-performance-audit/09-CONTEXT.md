# Phase 9: Performance Audit - Context

**Gathered:** 2026-03-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Measure and identify performance bottlenecks in the existing app. No code changes — only analysis and documentation of findings. Outputs feed into Phase 10 (Performance Optimizations).

</domain>

<decisions>
## Implementation Decisions

### Audit Tooling
- **Bundle analysis**: `@next/bundle-analyzer` or `npx webpack-bundle-analyzer`
- **React render profiling**: React DevTools Profiler (browser extension)
- **Core Web Vitals**: Google Lighthouse via Chrome DevTools or `npx lighthouse`
- **Data fetching analysis**: Network tab + TanStack Query dev tools (if applicable)

### Metrics Baseline
- Capture baseline metrics BEFORE any optimizations
- Document: bundle size (KB), LCP (ms), FID/INP (ms), CLS score
- Compare against Lighthouse performance score as baseline

### Hotspot Prioritization
Issues ranked by impact:
1. High impact + easy fix → top priority
2. High impact + hard fix → plan carefully in Phase 10
3. Low impact → document but defer

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` — PERF-01, PERF-02, PERF-03 define the audit scope

### Project Context
- `.planning/PROJECT.md` — Core value, tech stack (Next.js 16, React 19, Tailwind v4)
- `.planning/PROJECT.md` — Constraint: client-side performance focus

### Prior Phase Context
- `.planning/phases/04-dark-mode-foundation/04-CONTEXT.md` — Post-mount preference restore pattern
- `.planning/phases/08-theme-preview/08-CONTEXT.md` — Google Fonts added (audit: are these slow?)

</canonical_refs>

<code_context>
## Existing Code Insights

### Tech Stack
- Next.js 16.1.6 with React 19.2.3
- Tailwind CSS v4 (utility classes, no runtime CSS-in-JS)
- Zustand for state management
- TanStack Query (React Query) for data fetching
- shadcn/ui components (Radix-based)

### Key Components to Audit
- `ShoppingList.tsx` — main list rendering, likely re-render hotspot
- `ItemRow.tsx` — per-item rendering, memo opportunities
- `QuickAddBar.tsx` — form input, potential re-render on each keystroke
- `AppHeader.tsx` / `MinimalHeader.tsx` — header components

### Established Patterns
- Post-mount preference restore via useEffect (Phase 4)
- CSS class overrides for theming (Phase 8)
- Semantic tokens via Tailwind — should already be tree-shakeable

</code_context>

<specifics>
## Specific Ideas

- Bundle size concern: Google Fonts (Fraunces + Nunito) added in Phase 8 — audit if these are blocking or can be preloaded
- next-themes package was flagged as needing `--legacy-peer-deps` — may have duplicate theme provider

</specifics>

<deferred>
## Deferred Ideas

None — this phase is purely diagnostic.

</deferred>

---

*Phase: 09-performance-audit*
*Context gathered: 2026-03-24*
