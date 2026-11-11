# Bundle Size Audit (PERF-01)

**Date:** 2026-03-24
**Build:** Production with ANALYZE=true npm run build -- --webpack
**Analyzer:** @next/bundle-analyzer (webpack mode, Turbopack incompatible)

## Top 5 Largest Client Modules

| Rank | Module | Size (raw) | Size (gzipped) | Contains | Assessment |
|------|--------|------------|-----------------|----------|------------|
| 1 | static/chunks/4bd1b696-*.js | 193.8 KB | 60.9 KB | App runtime code | Necessary - Next.js app runtime |
| 2 | react-dom (next/dist/compiled) | 193.8 KB | 60.8 KB | React DOM client | Necessary - React core |
| 3 | static/chunks/framework-75892d61b920805f.js | 185.2 KB | 58.3 KB | React/Next.js framework | Necessary - framework bundle |
| 4 | static/chunks/794-37dad9bbc14b04b8.js | 183.7 KB | 49.8 KB | Chunked module 794 | Likely shared library code |
| 5 | node_modules (aggregate) | 170.5 KB | 53.6 KB | All node_modules | Large - see breakdown below |

**Note on client bundle:** The largest identified specific modules are all Next.js/React framework internals. Third-party library impact is relatively small compared to framework overhead.

### Top Third-Party Client Libraries

| Library | Size (raw) | Size (gzipped) | Assessment |
|---------|------------|----------------|------------|
| @base-ui/react (floating-ui) | 8.3 KB | 3.1 KB | Low - only floating UI components used |
| sonner (toast) | 32.7 KB | 9.0 KB | Medium - entire library, consider tree-shaking |
| react-hook-form | 29.4 KB | 7.4 KB | Medium - full library imported |
| lucide-react | ~547 KB chunk | ~1.4 KB actual | Low - only few icons used |

## Total Bundle Sizes

| Metric | Raw Size | Gzipped Size |
|--------|----------|--------------|
| Initial JS (client) | 6.71 MB | 2.21 MB |
| Total (server/nodejs) | 16.01 MB | 4.54 MB |
| Edge runtime | ~0 MB | ~0 MB |

## Server Bundle Analysis (Node.js)

The server bundle is large (16 MB raw) but mostly static server-side code that does not impact client performance.

### Largest Server Modules

| Module | Size (raw) | Size (gzipped) | Contains |
|--------|------------|----------------|----------|
| 443.js | 1169.0 KB | 296.0 KB | Server-side module |
| 471.js | 257.5 KB | 69.1 KB | Server-side module |
| zod/v4/classic | 223.6 KB | 48.4 KB | Zod validation (entire library) |
| @neondatabase/serverless | 126.1 KB | 23.7 KB | Neon database adapter |
| kysely-adapter | 58.0 KB | 14.6 KB | Kysely ORM adapter |

### Server-Only Dependencies (Not in Client Bundle)

| Library | Size (raw) | Impact |
|---------|------------|--------|
| better-auth | Bundled in server chunks | Not measurable separately |
| drizzle-orm | Bundled in server chunks | Not measurable separately |
| resend | 76.9 KB | 24.6 KB gzipped - email sending |

## Opportunities for Optimization

### High Priority (Easy Wins)

1. **Sonner toast library (9.0 KB gzipped)**
   - Only a few toast notifications used in the app
   - Consider replacing with a lighter alternative or tree-shaking
   - Current impact: ~9 KB gzipped

2. **React Hook Form (7.4 KB gzipped)**
   - Used in forms (sign-in, sign-up, household settings)
   - Consider if all of it is needed or if lighter alternative possible
   - Current impact: ~7.4 KB gzipped

3. **Lucide React (~1.4 KB gzipped for icons used)**
   - Many icons may be imported but not used
   - Verify tree-shaking is working correctly
   - Current impact appears low due to tree-shaking

### Medium Priority

1. **Google Fonts (Fraunces + Nunito)**
   - Loaded via next/font/google (optimal loading)
   - Both fonts are variable fonts
   - Assessment: Already optimized via next/font

2. **@base-ui/react floating-ui components (3.1 KB gzipped)**
   - Only popup/dialog components used
   - Minimal impact, no action needed

3. **Zod v4 (48.4 KB gzipped on server)**
   - Full Zod library on server
   - Consider if all schema validation is necessary
   - Server-side only, does not affect client

## Recommendations for Phase 10

Based on bundle analysis, top 3 optimization actions:

1. **Audit and tree-shake Sonner and react-hook-form**
   - These have moderate impact relative to their usage
   - Run `ANALYZE=true` build after optimization to verify size reduction
   - Expected savings: 5-15 KB gzipped

2. **Verify Lucide React tree-shaking**
   - Ensure only used icons are bundled
   - Current chunk appears large but actual usage is small
   - Use `ctx.matchImport` or explicit icon imports

3. **Consider font subset optimization**
   - Fraunces and Nunito are already loaded optimally via next/font
   - If bundle size critical, could switch to system fonts for non-heading text
   - Low priority - current implementation is already good

## Build Notes

- Bundle analyzer requires `--webpack` flag in Next.js 16 (Turbopack incompatible)
- @next/bundle-analyzer installed as dev dependency
- Server bundle labeled as `nodejs.html` instead of `server.html` in webpack mode
