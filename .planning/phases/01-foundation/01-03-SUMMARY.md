---
phase: 01-foundation
plan: 03
subsystem: auth
tags: [better-auth, drizzle, organization-plugin, middleware, resend, next-js]

# Dependency graph
requires:
  - phase: 01-02
    provides: Drizzle schema (user, session, account, verification, organization, member, invitation), db client singleton, shadcn/ui components

provides:
  - better-auth server instance with email/password + organization plugin + 30-day sliding sessions
  - API route handler at /api/auth/[...all] via toNextJsHandler
  - Auth client for React components with organizationClient plugin
  - Middleware for optimistic route protection with returnTo support

affects:
  - 01-04 (auth UI imports authClient, uses session from auth)
  - 01-05 (invite email template referenced by sendInvitationEmail hook)
  - 01-06 (join link flow uses same auth session infrastructure)
  - 02-* (all Phase 2 plans authenticate via this auth instance)
  - 03-* (all Phase 3 plans use the same session/org context)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "better-auth drizzleAdapter receives full schema import (Record<string, any>) — not individual tables"
    - "Organization plugin schema option is for field-name overrides only — tables are handled by drizzleAdapter"
    - "Invite URL constructed from BETTER_AUTH_URL + invitation id — better-auth does not provide data.url in sendInvitationEmail"
    - "Middleware uses getSessionCookie() (cookie read only, no DB hit) for edge-fast optimistic guard"
    - "sendInvitationEmail uses dynamic imports to avoid bundling Resend/email template at module load time"

key-files:
  created:
    - src/lib/auth.ts
    - src/lib/auth-client.ts
    - src/app/api/auth/[...all]/route.ts
    - middleware.ts
  modified:
    - .env.local.example

key-decisions:
  - "drizzleAdapter receives full schema object (import * as schema) not individual tables — individual table approach causes TypeScript overload errors"
  - "Organization plugin schema option omitted — it is for field-name overrides only; table mapping is handled by drizzleAdapter"
  - "Invite URL built from BETTER_AUTH_URL env var + data.id — better-auth v1.5.5 sendInvitationEmail does not include a url field in callback data"
  - "Dynamic import for InviteEmailTemplate suppressed via @ts-expect-error — file created in Plan 05, safe at runtime"
  - "Middleware provides defense-in-depth only (CVE-2025-29927) — Server Components must also validate sessions"

patterns-established:
  - "Auth server singleton: export const auth = betterAuth(...) from src/lib/auth.ts (server-only)"
  - "Auth client singleton: export const authClient = createAuthClient(...) from src/lib/auth-client.ts (client-only)"
  - "returnTo pattern: middleware sets ?returnTo=<pathname> on redirect so login can bounce back"

requirements-completed: [AUTH-01, AUTH-02, AUTH-03, AUTH-04]

# Metrics
duration: 8min
completed: 2026-03-12
---

# Phase 1 Plan 03: Auth Configuration Summary

**better-auth fully configured: server instance with 30-day sessions, organization plugin with 7-day invite expiry, Resend hook, API route at /api/auth/[...all], edge-fast middleware with returnTo support, and React auth client with organizationClient plugin**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-12T14:59:47Z
- **Completed:** 2026-03-12T15:08:03Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- better-auth server instance configured with email/password auth, 30-day sliding sessions (daily updateAge, 5-min cookie cache), and organization plugin with 7-day invitation expiry
- Resend invite email hook with dynamic imports to avoid bundling at module load; URL constructed from BETTER_AUTH_URL + invitation id
- API catch-all route mounts the auth handler at `/api/auth/[...all]` via `toNextJsHandler`
- Middleware protects `/dashboard`, `/household`, `/settings` with cookie-only session check (no DB hit) and `returnTo` redirect param
- Auth client configured for React components with `organizationClient` plugin

## Task Commits

Each task was committed atomically:

1. **Task 1: Configure better-auth server instance** - `26fdee1` (feat)
2. **Task 2: Create auth client, API handler, and middleware** - `78c1ce8` (feat)

## Files Created/Modified

- `src/lib/auth.ts` - better-auth server instance: emailAndPassword, 30-day sessions, organization plugin with sendInvitationEmail
- `src/lib/auth-client.ts` - createAuthClient with organizationClient plugin for React components
- `src/app/api/auth/[...all]/route.ts` - catch-all API route via toNextJsHandler(auth)
- `middleware.ts` - optimistic route protection with getSessionCookie, returnTo redirect, CVE-2025-29927 defense note
- `.env.local.example` - added NEXT_PUBLIC_APP_URL

## Decisions Made

- `drizzleAdapter` receives full `schema` import (not individual tables) — passing individual tables as `schema` option causes TypeScript overload errors in v1.5.5
- Organization plugin's `schema` option is for field-name overrides only — omitted since table names match better-auth defaults
- Invite URL constructed manually from `process.env.BETTER_AUTH_URL` + `data.id` — better-auth v1.5.5 does not include `url` in `sendInvitationEmail` callback data
- `@ts-expect-error` used for `InviteEmailTemplate` dynamic import — file is created in Plan 05; dynamic import is safe at runtime, only TS resolution fails at compile time

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Incorrect drizzleAdapter schema option and wrong sendInvitationEmail data shape**

- **Found during:** Task 1 (Configure better-auth server instance)
- **Issue:** Plan specified individual tables in `drizzleAdapter({ schema: { user, session, account, verification } })` which causes TypeScript overload errors (Type 'PgTableWithColumns<...>' not assignable). Plan also specified `organization({ schema: { organization, member, invitation } })` which is invalid — the org plugin schema option accepts field-name override objects, not tables. Additionally `data.url` referenced in `sendInvitationEmail` does not exist in the actual callback type.
- **Fix 1:** Changed `drizzleAdapter` to receive `schema` (full `import * as schema`) as `Record<string, any>` which is the correct API
- **Fix 2:** Removed the invalid `schema` option from `organization()` call
- **Fix 3:** Replaced `data.url` with a constructed URL: `${BETTER_AUTH_URL}/accept-invitation?id=${data.id}`
- **Fix 4:** Added `@ts-expect-error` for the `InviteEmailTemplate` dynamic import (file created in Plan 05)
- **Files modified:** `src/lib/auth.ts`
- **Verification:** `npx tsc --noEmit` passes with zero errors
- **Committed in:** `26fdee1` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - Bug)
**Impact on plan:** Required fix — plan API usage was based on an older/incorrect better-auth pattern. Result is functionally equivalent and TypeScript-clean.

## Issues Encountered

None beyond the auto-fixed deviation above.

## User Setup Required

None at this stage. The Resend invite email only fires when an invitation is actually sent (after Plan 05 creates the email template). Required env vars are documented in `.env.local.example`.

## Next Phase Readiness

- Plan 04 (Auth UI) can use `authClient` from `src/lib/auth-client.ts` for sign-in/sign-up forms
- Plan 05 (Invite Email) must create `src/lib/email/invite-template.ts` exporting `InviteEmailTemplate` — the `sendInvitationEmail` hook dynamically imports it
- Middleware is active and will protect routes once pages are created in Plan 04
- Session type (`Session`) and auth client type (`AuthSession`) are exported and ready for use in Server Components and client hooks

---
*Phase: 01-foundation*
*Completed: 2026-03-12*

## Self-Check: PASSED

All 4 key files verified present on disk. Both task commits (26fdee1, 78c1ce8) verified in git log.
