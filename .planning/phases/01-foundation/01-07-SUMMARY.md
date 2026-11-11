---
phase: 01-foundation
plan: 07
subsystem: ui
tags: [next-js, better-auth, organization-plugin, sonner, shadcn, household-settings]

# Dependency graph
requires:
  - phase: 01-05
    provides: POST /api/households/invite endpoint, accept-invite page
  - phase: 01-06
    provides: POST /api/households/join-links endpoint, POST /api/households/join endpoint

provides:
  - DELETE /api/households/members endpoint using better-auth removeMember
  - /household/settings page: email invite form, join link generator with copy, member list with remove/leave
  - Toaster in root layout for sonner toast notifications
  - Settings link in dashboard header

affects:
  - 02-* (household members access settings page; member management UI is complete)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Settings page uses authClient.useActiveOrganization() + authClient.useSession() for role-based UI visibility"
    - "listMembers() returns { members, total } object — extract .members array (not direct array cast)"
    - "isAdmin computed from members array matching session.user.id to determine role"
    - "Copy button uses navigator.clipboard.writeText with 2-second 'Copied!' state toggle"

key-files:
  created:
    - src/app/(app)/household/settings/page.tsx
  modified:
    - src/app/(app)/dashboard/page.tsx
    - src/app/layout.tsx

key-decisions:
  - "listMembers() data shape is { members, total } not a flat array — cast via unknown to handle both array and object shapes defensively"
  - "Member.createdAt typed as Date | string to match better-auth's actual return type (Date) vs original interface (string)"
  - "Toaster added to root layout (not app layout) so it covers all pages including auth flows"

patterns-established:
  - "Settings page pattern: useActiveOrganization() for org ID, useSession() for current user, listMembers() for member list"
  - "Role gate pattern: isAdmin computed from members list, used to conditionally render invite/remove controls"

requirements-completed: [HSHD-02, HSHD-03, HSHD-04]

# Metrics
duration: 15min
completed: 2026-03-12
---

# Phase 1 Plan 07: Household Settings Page Summary

**Household settings page with email invite form (HSHD-02), shareable join link generator with copy button (HSHD-03), member list with admin remove/leave controls (HSHD-04), and DELETE /api/households/members endpoint wired to better-auth removeMember**

## Performance

- **Duration:** 15 min
- **Started:** 2026-03-12T16:10:00Z
- **Completed:** 2026-03-12T16:25:00Z
- **Tasks:** 2
- **Files modified:** 3 (1 created + 2 modified)

## Accomplishments

- DELETE /api/households/members endpoint: 401 without session, 400 for missing fields, 403/500 from better-auth errors; uses `memberIdOrEmail` field (correct better-auth API shape)
- /household/settings page: three Card sections — invite by email, shareable join link with copy, member list with remove/leave buttons; admin controls hidden from non-admin members
- Toaster added to root layout for sonner notifications across all pages
- Settings link added to dashboard header

## Task Commits

Each task was committed atomically:

1. **Task 1: DELETE /api/households/members endpoint** - `b6e21ac` (feat) — committed in prior session
2. **Task 2: Household settings page** - `8fed5ff` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified

- `src/app/(app)/household/settings/page.tsx` - Client page: three Card sections (email invite, join link generator, member list); admin-only controls; navigator.clipboard.writeText for copy; sonner toasts
- `src/app/(app)/dashboard/page.tsx` - Added Settings link in header pointing to /household/settings
- `src/app/layout.tsx` - Added Toaster from sonner for toast notifications

## Decisions Made

- `listMembers()` returns `{ members, total }` not a flat array — used `unknown` intermediate cast to extract `.members` array defensively (supports both array and object shapes in case API shape changes)
- `Member.createdAt` typed as `Date | string` to match better-auth's actual return type (the original `string` type caused TS2352 due to `Date` being incompatible with `string`)
- Toaster placed in root `layout.tsx` (not the `(app)` layout) so toast notifications work on auth pages too (e.g., if invite accept triggers a toast)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] listMembers() data shape mismatch caused TS2352**
- **Found during:** Task 2 (TypeScript verification)
- **Issue:** The plan specified `result.data as Member[]` but better-auth's `listMembers()` returns `{ members: [...], total: number }` not a flat array. TypeScript raised TS2352 "neither type sufficiently overlaps".
- **Fix:** Updated fetchMembers to extract `result.data.members` via `unknown` intermediate cast. Also updated `Member.createdAt` type from `string` to `Date | string` to match better-auth's actual `Date` type.
- **Files modified:** `src/app/(app)/household/settings/page.tsx`
- **Verification:** `npx tsc --noEmit` passes with zero errors
- **Committed in:** `8fed5ff` (Task 2 commit)

**2. [Rule 2 - Missing critical functionality] Toaster missing from root layout**
- **Found during:** Task 2 (reviewing plan verification checklist)
- **Issue:** The plan specified "Ensure `<Toaster />` is in the root layout" but the root `src/app/layout.tsx` had no Toaster. Without it, all `toast.success()` / `toast.error()` calls in the settings page would silently fail.
- **Fix:** Added `import { Toaster } from "@/components/ui/sonner"` and `<Toaster />` to root layout.
- **Files modified:** `src/app/layout.tsx`
- **Verification:** TypeScript compiles, Toaster renders in body
- **Committed in:** `8fed5ff` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 Rule 1 - Bug, 1 Rule 2 - Missing critical functionality)
**Impact on plan:** Both fixes were necessary for correctness. The listMembers fix is a data shape correction; the Toaster fix is required for toast notifications to display. No scope creep.

## Issues Encountered

None beyond the auto-fixed deviations above.

## User Setup Required

None — all features use existing API routes and auth infrastructure. No new env vars introduced.

## Next Phase Readiness

- All Phase 1 foundation requirements are complete: auth (plans 01-04), email invite (plan 05), join link (plan 06), settings UI (plan 07)
- Phase 2 feature development can proceed with full auth + household membership + settings UI foundation
- /household/settings is protected by middleware (/household prefix in PROTECTED_PREFIXES)
- Dashboard provides navigation to settings via header link

---
*Phase: 01-foundation*
*Completed: 2026-03-12*

## Self-Check: PASSED
