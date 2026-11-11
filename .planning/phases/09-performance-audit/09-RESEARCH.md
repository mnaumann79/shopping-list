# Phase 9: Performance Audit - Research

**Researched:** 2026-03-24
**Domain:** Client-side performance auditing for Next.js 16 + React 19 app
**Confidence:** MEDIUM

## Summary

Phase 9 is purely diagnostic — measure and document performance bottlenecks with no code changes. The app is a Next.js 16.1.6 + React 19.2.3 shopping list with Tailwind CSS v4. State is managed via local React useState/useEffect (NOT Zustand or TanStack Query — the context incorrectly listed these). Data flows server-to-client via RSC initial props, with client mutations via fetch to API routes.

**Primary recommendation:** Use @next/bundle-analyzer (bundled with Next.js) for bundle analysis, React DevTools Profiler browser extension for render audits, and npx lighthouse for Core Web Vitals baseline.

## Standard Stack

### Core Tools (Pre-installed)
| Tool | Version | Purpose | Why Standard |
|------|---------|---------|--------------|
| @next/bundle-analyzer | bundled with Next.js 16 | Bundle size analysis | Built-in, no extra install |
| React DevTools Profiler | browser extension | Render hotspot detection | Official React team tool |
| Lighthouse CLI | npx lighthouse | Core Web Vitals measurement | Google-owned, industry standard |

### Supporting Tools
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @next/bundle-analyzer | (bundled) | Generate HTML bundle reports | PERF-01 bundle audit |
| react-devtools | standalone | Safari/mobile profiling | If browser extension insufficient |
| next build --profile | (built-in) | Build-time performance data | Deep Next.js-specific analysis |

**Installation:** No new packages needed — all tools are either bundled with Next.js or browser-based.

**Version verification:**
- Next.js: 16.1.6 (installed) / 16.2.1 (current registry)
- React: 19.2.3 (installed) / 19.2.4 (current registry)

## Architecture Patterns

### Recommended Project Structure
```
.planning/phases/09-performance-audit/
├── 09-AUDIT-BUNDLE.md      # Bundle analysis report
├── 09-AUDIT-RENDER.md      # React Profiler trace notes
├── 09-AUDIT-WEBVITALS.md   # Lighthouse baseline metrics
└── 09-AUDIT-DATA.md        # Data fetching analysis
```

### Pattern 1: Bundle Analysis with @next/bundle-analyzer
**What:** Visual HTML report showing all modules and their sizes
**When to use:** PERF-01 — identify large dependencies and unused code
**Configuration in next.config.ts:**
```typescript
const withBundleAnalyzer = (await import("@next/bundle-analyzer")).({
  enabled: process.env.ANALYZE === "true",
});
```
**Run command:** `ANALYZE=true npm run build`
**Output:** `.next/analyze/client.html` and `.next/analyze/server.html`

### Pattern 2: React DevTools Profiler Recording
**What:** Records component render times, frequencies, and reasons
**When to use:** PERF-02 — identify unnecessary re-renders
**Steps:**
1. Install React DevTools browser extension (Chrome/Firefox/Edge)
2. Run app in dev mode: `npm run dev`
3. Open DevTools > Profiler tab
4. Click Record, interact with app, stop
5. Analyze commit chart for render hotspots

### Pattern 3: Lighthouse CLI Baseline
**What:** Automated Core Web Vitals measurement
**When to use:** Establish baseline metrics before optimizations
**Run command:** `npx lighthouse http://localhost:3000 --output=json --output-path=./lighthouse-baseline.json`
**Key metrics captured:** LCP, FID/INP, CLS, FCP, TTFB, Bundle size

### Anti-Patterns to Avoid
- **Measuring in production mode without baseline:** Always capture before/after in same environment
- **Analyzing bundle during dev build:** Use `npm run build` (production) for accurate sizes
- **Ignoring server components:** RSC data fetching patterns matter for TTFB

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Bundle analysis | Custom webpack plugin | @next/bundle-analyzer | Handles Next.js bundling correctly |
| Render profiling | console.time logs | React DevTools Profiler | Full component tree visibility |
| Core Web Vitals | Manual measurement | Lighthouse | Standardized, comparable metrics |

**Key insight:** Performance auditing is well-served by existing tools. The goal is measurement, not building measurement tools.

## Common Pitfalls

### Pitfall 1: Measuring Wrong Build Mode
**What goes wrong:** Bundle sizes look small in dev mode, misguiding priorities
**Why it happens:** Dev mode skips tree-shaking, minification, and compression
**How to avoid:** Always use `npm run build` + `npm start` for production measurements
**Warning signs:** Bundle report shows files in node_modules that should be tree-shaken

### Pitfall 2: Forgetting to Capture Baseline
**What goes wrong:** Cannot prove optimization impact
**Why it happens:** Skipping baseline "to save time" makes comparison impossible
**How to avoid:** Document all metrics in phase 9 artifacts before any changes
**Warning signs:** No Lighthouse baseline JSON, no bundle analyzer report

### Pitfall 3: React DevTools Shows Renders But Not Why
**What goes wrong:** Seeing that a component re-renders without understanding cause
**Why it happens:** Profiler shows commits but not always the specific state/prop change
**How to avoid:** Use "Highlight updates" feature + "Record why" for context
**Warning signs:** ShoppingList re-renders on every ItemRow interaction despite no shared state change

### Pitfall 4: Missing Invisible Re-renders
**What goes wrong:** Only looking at visible DOM changes, missing "wasted" renders
**Why it happens:** React can re-render without DOM changes (same output)
**How to avoid:** Enable "Highlight updates" in React DevTools during interaction
**Warning signs:** Blue highlights flash on components that should not have changed

## Code Examples

### Key Observation: ShoppingList State Management (Verified from source)
```typescript
// ShoppingList.tsx — multiple independent useState calls
const [items, setItems] = useState(initialItems);
const [categoryList, setCategoryList] = useState(categories);
const [selectedStoreId, setSelectedStoreId] = useState(ALL_STORES_FILTER);
const [organizationMode, setOrganizationMode] = useState<OrganizationMode>(DEFAULT_ORGANIZATION_MODE);
const [lastClearedItems, setLastClearedItems] = useState<Item[]>([]);
const [preferencesLoaded, setPreferencesLoaded] = useState(false);

// Three separate useEffect hooks for localStorage
// Each reads from localStorage independently
useEffect(() => {
  const storedFilter = readStoreFilter();
  // ...
}, [stores]);

useEffect(() => {
  window.localStorage.setItem(TRIP_STORE_FILTER_KEY, selectedStoreId);
}, [preferencesLoaded, selectedStoreId, organizationMode]);

useEffect(() => {
  // store filter reset logic
}, [items, selectedStoreId]);
```

**Audit finding:** No React.memo on ItemRow despite being rendered in a list with stable callbacks from ShoppingList. ItemRow uses useEffect to sync local state with props (lines 65-71), which runs on every parent re-render.

### Key Observation: ItemRow Local State (Verified from source)
```typescript
// ItemRow.tsx — local state synced via useEffect on every prop change
useEffect(() => {
  setName(item.name);
  setQuantity(item.quantity ?? "");
  setNote(item.note ?? "");
  setCategoryId(item.categoryId ?? "");
  setSelectedStoreIds(item.storeIds ?? []);
}, [item]); // Re-runs when item prop changes
```

**Audit finding:** This is a classic "lifted state" pattern issue. If ShoppingList re-renders and passes the same item objects (reference equality), this effect still runs unnecessarily.

### Key Observation: Font Loading (Verified from layout.tsx)
```typescript
// next/font/google — self-hosted at build time, should be optimal
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  display: "swap",
});
const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin"],
  display: "swap",
});
```

**Audit finding:** Fonts are loaded via next/font/google which handles preloading and display:swap automatically. However, Phase 8 added Nunito + Fraunces as primary fonts — worth auditing if both are needed vs. one paired with Geist.

### Key Observation: Data Flow (Verified from page.tsx)
```typescript
// Server Component — fetches all data at request time
async function fetchItems(orgId: string) {
  // Drizzle ORM query
}
export default async function DashboardPage() {
  // ...
  const [categories, initialItems, storeList] = await Promise.all([
    fetchCategories(orgId),
    fetchItems(orgId),
    fetchStores(orgId),
  ]);
  return <ShoppingList initialItems={initialItems} categories={categories} stores={storeList} />;
}
```

**Audit finding:** No client-side caching library (TanStack Query not installed). All data is server-fetched once, then managed via local state. Mutations go directly to API routes with no request deduplication.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| bundle-visualizer | @next/bundle-analyzer | Next.js 13+ | Native Next.js support |
| react-addons-perf | React DevTools Profiler | React 16+ | Modern React 19 compatible |
| WebPageTest | Lighthouse CLI | Industry standard | Automated, CI-friendly |

**Deprecated/outdated:**
- `react-addons-perf`: Removed in React 19 — use React DevTools Profiler instead
- Webpack Bundle Analyzer (standalone): Use @next/bundle-analyzer for tighter Next.js integration

## Open Questions

1. **Is TanStack Query actually used?**
   - What we know: Not in package.json dependencies
   - What's unclear: Context mentioned TanStack Query dev tools for data fetching analysis
   - Recommendation: Verify if any client-side caching exists — if not, PERF-03 data fetching audit will show no redundant queries

2. **Is Zustand actually used?**
   - What we know: Not in package.json dependencies
   - What's unclear: Context listed Zustand as state management
   - Recommendation: Verify — app appears to use only local useState

3. **Google Fonts audit scope**
   - What we know: Fraunces + Nunito added in Phase 8 via next/font/google
   - What's unclear: Are both fonts actually used on all pages?
   - Recommendation: Check CSS variables usage frequency — if Nunito/Fraunces only on specific pages, audit if both are needed

## Validation Architecture

> Skip this section entirely if workflow.nyquist_validation is explicitly set to false in .planning/config.json.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None — Phase 9 is diagnostic only, no code changes |
| Config file | N/A |
| Quick run command | N/A |
| Full suite command | N/A |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists |
|--------|----------|-----------|-------------------|-------------|
| PERF-01 | Bundle size audit | Manual | `ANALYZE=true npm run build` | Bundle analyzer HTML report |
| PERF-02 | React render audit | Manual | React DevTools Profiler browser extension | Profiler trace screenshot/notes |
| PERF-03 | Data fetching audit | Manual | Network tab + source review | Audit notes document |

### Wave 0 Gaps
None — Phase 9 requires no code changes, only analysis and documentation.

## Sources

### Primary (HIGH confidence)
- Next.js 16.1.6 source (verified via project package.json)
- React 19.2.3 source (verified via project package.json)
- Project source: src/app/(app)/dashboard/_components/ShoppingList.tsx — verified state management pattern
- Project source: src/app/(app)/dashboard/_components/ItemRow.tsx — verified local useEffect pattern
- Project source: src/app/layout.tsx — verified font loading approach

### Secondary (MEDIUM confidence)
- React DevTools Profiler documentation — WebFetch result, official React docs
- Lighthouse CLI documentation — WebFetch result, Google-owned

### Tertiary (LOW confidence)
- @next/bundle-analyzer npm page — WebFetch returned 403, used general knowledge
- Tailwind CSS v4 — Training data may be stale; verified Tailwind v4 in package.json

## Metadata

**Confidence breakdown:**
- Standard stack: MEDIUM — bundle analyzer bundled with Next.js, but specific API may vary by version
- Architecture: HIGH — project structure verified from source
- Pitfalls: MEDIUM — common patterns, but specific behavior depends on Next.js 16.1.6 specifics

**Research date:** 2026-03-24
**Valid until:** 2026-04-07 (30 days for stable, tool APIs rarely change rapidly)
