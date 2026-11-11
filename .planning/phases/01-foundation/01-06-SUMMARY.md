---
phase: 01-foundation
plan: 06
subsystem: auth
tags: [better-auth, drizzle-orm, next-js, join-links, organization-plugin, tdd]

# Dependency graph
requires:
  - phase: 01-04
    provides: sign-up page with sessionStorage token pattern, onboarding page
  - phase: 01-05
    provides: invite flow pattern (sessionStorage, redirect after sign-up)

provides:
  - POST /api/households/join-links: admin generates 64-char hex token join URL, replaces any existing link
  - POST /api/households/join: validates token, adds caller as member, multi-use (token not deleted)
  - /join page: auto-joins logged-in users, preserves token through sign-up for new users

affects:
  - 02-* (household members join via shareable link; active org set after join)
  - 03-* (HouseholdSwitcher shows newly joined households)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Join link flow: /join page stores token to sessionStorage before redirecting to sign-up; sign-up redirects back to /join after successful registration"
    - "Multi-use join tokens: POST /api/households/join never deletes the token after use"
    - "Join link regeneration: delete-then-insert pattern in join-links route ensures only one active link per org"
    - "BETTER_AUTH_URL used as base URL for join links — fallback to NEXT_PUBLIC_APP_URL then localhost:3000"

key-files:
  created:
    - src/app/api/households/join-links/route.ts
    - src/app/api/households/join/route.ts
    - src/app/(auth)/join/page.tsx
  modified:
    - src/app/(auth)/sign-up/page.tsx
    - src/app/api/households/join-links/route.test.ts
    - src/app/api/households/join/route.test.ts

key-decisions:
  - "Join link flow redirects new users to /join (not /onboarding) after sign-up — user arrives already authenticated so /join auto-joins them into the existing household"
  - "sign-up page reads joinToken from URL and stores to sessionStorage (matching invitationId pattern) — redirects to /join?token=xxx after sign-up if pendingJoinToken is set"
  - "Token is never deleted after use — multi-use design allows entire household to join via one shared link"

patterns-established:
  - "Join link pattern: /join page checks session; logged-in → POST /api/households/join; logged-out → sessionStorage + redirect to sign-up"
  - "sessionStorage.pendingJoinToken mirrors sessionStorage.pendingInvitationId pattern from Plan 05"

requirements-completed: [HSHD-03, HSHD-04]

# Metrics
duration: 7min
completed: 2026-03-12
---

# Phase 1 Plan 06: Join Link Flow Summary

**Multi-use household join links: POST /api/households/join-links generates 64-char hex token with 7-day expiry and atomic replace; POST /api/households/join validates token (multi-use, no delete); /join page auto-joins logged-in users and preserves token through sign-up for new users**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-12T15:54:11Z
- **Completed:** 2026-03-12T16:01:25Z
- **Tasks:** 2
- **Files modified:** 6 (3 created + 2 test files updated + 1 sign-up update)

## Accomplishments

- `POST /api/households/join-links`: authenticated endpoint, deletes existing link for org, inserts new with 64-char hex token and 7-day expiry, returns `{ url }` using `BETTER_AUTH_URL` as base
- `POST /api/households/join`: validates token (404 if missing, 410 if expired), calls `auth.api.addMember`, returns `{ success, organizationId }` — token NOT deleted (multi-use)
- `/join` page: three states — loading (auto-join in progress), success (sets active org, redirects /dashboard after 1.5s), expired/error (Card with sign-in button)
- `/join` page: logged-out users get redirected to `/sign-up?joinToken=xxx` with token stored in sessionStorage
- Sign-up page updated: reads `joinToken` from URL on mount, stores to sessionStorage; after sign-up redirects to `/join?token=xxx` if `pendingJoinToken` set
- 11 unit tests covering all API routes (401/400/404/410/200/multi-use/regenerate)

## Task Commits

Each task was committed atomically:

1. **Task 1 RED: Failing tests for join-links and join API routes** - `fe72f65` (test)
2. **Task 1 GREEN: Implement join-links and join API routes** - `1ea5882` (feat)
3. **Task 2: /join page and join-token handling in sign-up** - `652a964` (feat)

## Files Created/Modified

- `src/app/api/households/join-links/route.ts` - POST endpoint: auth check, delete existing link for org, insert 64-char hex token with 7-day expiry, return URL
- `src/app/api/households/join/route.ts` - POST endpoint: auth check, token lookup (404/410), addMember call, return success + organizationId
- `src/app/(auth)/join/page.tsx` - Client page: session check → auto-join or redirect to sign-up with token preserved; loading/success/expired/error states
- `src/app/(auth)/sign-up/page.tsx` - Added joinToken URL param reading on mount + post-signup redirect to /join if pendingJoinToken set
- `src/app/api/households/join-links/route.test.ts` - 5 unit tests (upgraded from todo stubs): 401/400/200+64-char-token/delete-on-regenerate/BETTER_AUTH_URL
- `src/app/api/households/join/route.test.ts` - 6 unit tests (upgraded from todo stubs): 401/400/404/410/200+addMember/no-delete

## Decisions Made

- Redirecting new users to `/join?token=xxx` (not `/onboarding`) after sign-up when `pendingJoinToken` exists — the user arrived to join an existing household, so the correct post-signup destination is `/join` where they'll be auto-joined now that they're authenticated
- Sign-up reads `joinToken` from URL params and persists to sessionStorage — matches the `invitationId` pattern from Plan 05; consistent approach for token-based flows across both invite and join paths
- Token is never deleted after consumption — `POST /api/households/join` is multi-use by design (per must_haves truth #5), allowing a shared link to be used by all household members

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] sign-up page needed joinToken URL param handling**
- **Found during:** Task 2 (join page implementation)
- **Issue:** The plan's Task 2 action said to update onboarding/page.tsx for the post-signup join-token case, but the cleaner flow is to redirect from sign-up directly to /join (not create a new household first). Without sign-up reading the `joinToken` param from the URL, the token would be lost if the user arrived at /sign-up?joinToken=xxx directly (e.g., browser back navigation).
- **Fix:** Added `joinToken` URL param reading in sign-up's useEffect (stores to sessionStorage) and added redirect to `/join?token=xxx` in the post-signup flow when `pendingJoinToken` is set. This mirrors the `invitationId` pattern exactly.
- **Files modified:** `src/app/(auth)/sign-up/page.tsx`
- **Verification:** TypeScript compiles, flow consistent with join page behavior
- **Committed in:** `652a964` (Task 2 commit)

---

**Total deviations:** 1 auto-added (Rule 2 - Missing critical functionality)
**Impact on plan:** Sign-up page handles join token from URL instead of relying solely on sessionStorage, making the flow robust against URL-based arrivals. The onboarding page already had `sessionStorage.removeItem("pendingJoinToken")` as a stub — the actual token consumption now happens via the /join page redirect rather than inside onboarding.

## Issues Encountered

None beyond the deviation above.

## User Setup Required

None — join links use `BETTER_AUTH_URL` already documented in `.env.local.example`.

## Next Phase Readiness

- Phase 1 Foundation complete: all auth, invite, and join link features implemented
- `/join` page is at `src/app/(auth)/join/page.tsx` — uses auth layout (centered card)
- Sign-up page handles both `invitationId` and `joinToken` URL params — both invite and join link flows are complete
- Phase 2 feature development can proceed with full auth + household membership foundation in place

---
*Phase: 01-foundation*
*Completed: 2026-03-12*

## Self-Check: PASSED

All 4 implementation files verified present on disk. All 3 task commits (fe72f65, 1ea5882, 652a964) verified in git log.
