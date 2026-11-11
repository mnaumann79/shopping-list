---
phase: 01-foundation
plan: 02
subsystem: database
tags: [nextjs, drizzle-orm, neon, better-auth, shadcn, zod, react-hook-form, resend]

# Dependency graph
requires:
  - phase: 01-01
    provides: Test infrastructure (Vitest, Playwright), project git init

provides:
  - Next.js 15 project with all production and dev dependencies installed
  - Complete Drizzle schema covering all three phases (auth, household, items)
  - Neon + Drizzle client singleton (src/db/index.ts)
  - Drizzle Kit config pointing to schema/index.ts
  - shadcn/ui component set (button, input, form, card, dialog, dropdown-menu, avatar, separator, sonner, label)
  - .env.local.example with all required environment variables

affects:
  - 01-03 (better-auth config references schema tables)
  - 01-04 (auth UI imports shadcn components)
  - 01-05 (email invite uses items schema and resend)
  - 01-06 (join links uses householdJoinLinks table)
  - 02-* (all Phase 2 plans use categories, stores, items tables)
  - 03-* (all Phase 3 plans use itemStores junction table)

# Tech tracking
tech-stack:
  added:
    - better-auth@1.5.5
    - drizzle-orm@0.45.1
    - "@neondatabase/serverless@1.0.2"
    - resend@6.9.3
    - "@react-email/components@1.0.9"
    - react-hook-form@7.71.2
    - "@hookform/resolvers"
    - zod@4.3.6
    - drizzle-zod@0.8.3
    - drizzle-kit (dev)
    - dotenv (dev)
    - shadcn/ui (via CLI)
  patterns:
    - "Drizzle schema split by domain: auth.ts, households.ts, items.ts — re-exported via schema/index.ts"
    - "Neon serverless + drizzle/neon-http for Edge-compatible DB client"
    - "Soft-delete via is_active boolean — implemented from day one on items table"
    - "better-auth org plugin requires activeOrganizationId on session table"

key-files:
  created:
    - src/db/schema/auth.ts
    - src/db/schema/households.ts
    - src/db/schema/items.ts
    - src/db/schema/index.ts
    - src/db/index.ts
    - drizzle.config.ts
    - .env.local.example
    - src/components/ui/avatar.tsx
    - src/components/ui/card.tsx
    - src/components/ui/dialog.tsx
    - src/components/ui/dropdown-menu.tsx
    - src/components/ui/form.tsx
    - src/components/ui/input.tsx
    - src/components/ui/label.tsx
    - src/components/ui/separator.tsx
    - src/components/ui/sonner.tsx
  modified:
    - package.json
    - package-lock.json

key-decisions:
  - "Drizzle schema split by domain (auth/households/items) with barrel re-export to keep files manageable and enable targeted imports"
  - "better-auth tables written manually (not via npx auth generate) since auth.ts config doesn't exist yet — Plan 03 handles auth instance setup"
  - "householdJoinLinks uses uuid PK (not text) for join tokens — tokens are application-generated, not auth-system IDs"
  - "itemStores junction table included now since items schema is written — avoids a migration later when Phase 3 implements store filtering"

patterns-established:
  - "Schema per domain: Each logical domain (auth, households, items) has its own schema file"
  - "Central re-export: All schemas flow through src/db/schema/index.ts"
  - "Soft-delete from day one: is_active boolean on items and categories"
  - "Neon Edge client: Use drizzle/neon-http (not neon-serverless) for Edge runtime compatibility"

requirements-completed: [AUTH-01, AUTH-02, AUTH-03, HSHD-01, HSHD-02, HSHD-03, HSHD-04]

# Metrics
duration: 33min
completed: 2026-03-12
---

# Phase 1 Plan 02: Project Bootstrap Summary

**Next.js 15 with full dependency set, Drizzle ORM schema covering all 3 phases (12 tables: 7 auth, 1 household, 4 items), Neon/Edge-compatible DB client, and shadcn/ui component library**

## Performance

- **Duration:** 33 min
- **Started:** 2026-03-12T14:17:45Z
- **Completed:** 2026-03-12T14:50:03Z
- **Tasks:** 2
- **Files modified:** 18

## Accomplishments

- All production and dev dependencies installed (better-auth, drizzle-orm, neon, resend, react-hook-form, zod, drizzle-kit, shadcn)
- Complete Drizzle schema written for all three phases: auth tables (user, session, account, verification, organization, member, invitation), household tables (householdJoinLinks), and item tables (categories, stores, items, itemStores)
- Session table includes activeOrganizationId for better-auth organization plugin
- Items table has is_active soft-delete from day one as required
- Drizzle client singleton + config ready for migrations in Plan 03

## Task Commits

Each task was committed atomically:

1. **Task 1: Install all dependencies and add shadcn components** - `1be87dc` (feat)
2. **Task 2: Write complete Drizzle schema for all phases** - `331e7b3` (feat)

## Files Created/Modified

- `src/db/schema/auth.ts` - better-auth tables: user, session (with activeOrganizationId), account, verification, organization, member, invitation
- `src/db/schema/households.ts` - householdJoinLinks table with token, expiry, org and user FKs
- `src/db/schema/items.ts` - categories (isDefault for seeding), stores, items (is_active soft-delete, isChecked), itemStores junction
- `src/db/schema/index.ts` - barrel re-export of all 12 tables
- `src/db/index.ts` - neon() + drizzle() singleton with schema import, exports `db`
- `drizzle.config.ts` - dialect postgresql, schema points to src/db/schema/index.ts
- `.env.local.example` - DATABASE_URL, BETTER_AUTH_SECRET, BETTER_AUTH_URL, RESEND_API_KEY, RESEND_FROM_EMAIL
- `package.json` - 8 new production deps + 2 dev deps
- `src/components/ui/*.tsx` - avatar, card, dialog, dropdown-menu, form, input, label, separator, sonner

## Decisions Made

- Drizzle schema split by domain (auth/households/items) with barrel re-export to keep files manageable and enable targeted imports
- better-auth tables written manually (not via `npx auth generate`) since auth.ts config doesn't exist yet — Plan 03 handles auth instance setup
- householdJoinLinks uses uuid PK (not text) for join tokens — tokens are application-generated, not auth-system IDs
- itemStores junction table included now since items schema is written — avoids a migration later when Phase 3 implements store filtering

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] create-next-app refused to initialize in non-empty directory**

- **Found during:** Task 1 (Next.js project initialization)
- **Issue:** `create-next-app` exits with error when target directory contains existing files (`.claude/`, `.planning/`)
- **Fix:** Created Next.js project in `/tmp/nextjs-temp`, then copied all generated files (package.json, tsconfig.json, next.config.ts, src/, public/, node_modules/) to project root
- **Files modified:** All Next.js scaffold files (package.json, tsconfig.json, next.config.ts, next-env.d.ts, postcss.config.mjs, eslint.config.mjs, src/app/*, public/*)
- **Verification:** TypeScript compiles cleanly with `npx tsc --noEmit`
- **Committed in:** `1be87dc` (Task 1 commit)

**2. [Rule 3 - Blocking] shadcn `form` component not created by CLI**

- **Issue:** `npx shadcn@latest add form` ran but did not create the form.tsx file (appeared to hang on "Checking registry")
- **Fix:** Wrote form.tsx manually following the shadcn v4 pattern with react-hook-form Controller, FormField, FormItem, FormLabel, FormControl, FormDescription, FormMessage; also created label.tsx; installed @radix-ui/react-label and @radix-ui/react-slot
- **Files modified:** src/components/ui/form.tsx, src/components/ui/label.tsx, package.json
- **Verification:** TypeScript compiles cleanly
- **Committed in:** `1be87dc` (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** Both auto-fixes necessary to complete task. No scope creep — result is identical to plan spec.

## Issues Encountered

- `@react-email/tailwind` has a peer dependency conflict with `@react-email/body` version. npm warns but installs successfully with `ERESOLVE override`. No functional impact — email components install and type-check correctly.

## User Setup Required

None — no external service configuration required at this stage. See `.env.local.example` for environment variables needed before running the app.

## Next Phase Readiness

- Plan 03 (better-auth config) can reference schema tables: `user`, `session`, `account`, `verification`, `organization`, `member`, `invitation` from `@/db/schema`
- Plan 04 (Auth UI) can import shadcn components from `@/components/ui/*`
- Plan 05+ (Email invite, join links) have their DB tables ready
- All Phase 2 and Phase 3 tables are defined — no mid-project migrations needed

---
*Phase: 01-foundation*
*Completed: 2026-03-12*

## Self-Check: PASSED

All 8 key files verified present on disk. Both task commits (1be87dc, 331e7b3) verified in git log.
