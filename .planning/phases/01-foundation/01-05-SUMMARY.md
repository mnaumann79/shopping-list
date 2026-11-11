---
phase: 01-foundation
plan: 05
subsystem: auth
tags: [better-auth, react-email, resend, organization-plugin, next-js, invite-flow]

# Dependency graph
requires:
  - phase: 01-03
    provides: better-auth server instance with organization plugin and sendInvitationEmail hook (dynamic import of invite-template)
  - phase: 01-04
    provides: sign-up page that receives invitationId URL param and stores to sessionStorage

provides:
  - React Email template (InviteEmailTemplate) for household invitation emails via Resend
  - POST /api/households/invite endpoint using auth.api.createInvitation
  - /accept-invite page: auto-joins if logged in, redirects to sign-up with context preserved if not
  - Sign-up page updated to read invitationId from URL and redirect to accept-invite after successful registration

affects:
  - 01-06 (join link flow uses same sessionStorage pattern)
  - 02-* (invite flow is the primary onboarding path for new household members)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "better-auth organization plugin uses auth.api.createInvitation not auth.api.inviteMember"
    - "Invite flow persists invitationId to sessionStorage before sign-up redirect; accept-invite page clears it after acceptInvitation"
    - "accept-invite page: session check determines auto-accept vs redirect-to-sign-up path"
    - "Dynamic import of InviteEmailTemplate in sendInvitationEmail hook avoids bundling Resend/email at startup"

key-files:
  created:
    - src/lib/email/invite-template.tsx
    - src/app/api/households/invite/route.ts
    - src/app/(auth)/accept-invite/page.tsx
  modified:
    - src/lib/auth.ts
    - src/app/(auth)/sign-up/page.tsx

key-decisions:
  - "auth.api.createInvitation is the correct better-auth organization plugin API — plan referenced auth.api.inviteMember which does not exist"
  - "403 detection via error message substring matching (not authorized / permission) — better-auth does not throw typed errors from createInvitation"
  - "Logged-out user accepts invite by: sessionStorage -> sign-up -> accept-invite page auto-accepts on return (no double redirect)"

patterns-established:
  - "Invite accept flow: /accept-invite?invitationId=X checks session; logged-in users call acceptInvitation directly; logged-out users go to sign-up with ID preserved"
  - "sessionStorage.pendingInvitationId carries invite context across the sign-up redirect boundary"

requirements-completed: [HSHD-02, HSHD-04]

# Metrics
duration: 24min
completed: 2026-03-12
---

# Phase 1 Plan 05: Email Invite Flow Summary

**React Email invite template, POST /api/households/invite endpoint using better-auth createInvitation, and accept-invite page handling both logged-in auto-accept and logged-out redirect-to-sign-up flows**

## Performance

- **Duration:** 24 min
- **Started:** 2026-03-12T15:15:29Z
- **Completed:** 2026-03-12T15:40:11Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- InviteEmailTemplate React Email component with inviterName, householdName, inviteUrl props — used by better-auth sendInvitationEmail hook via dynamic import
- POST /api/households/invite endpoint: 401 without session, 400 for missing fields, 403 for non-admin, 200 with invitation on success
- /accept-invite page handles two paths: logged-in users get auto-accepted and redirected to /dashboard; logged-out users get redirected to /sign-up with invitationId preserved in sessionStorage
- Sign-up page reads invitationId from URL on mount (stores to sessionStorage) and after successful sign-up redirects to /accept-invite instead of /onboarding when invitation is pending

## Task Commits

Each task was committed atomically:

1. **Task 1: React Email template** - `71e0273` (feat)
   - RED (tests): `d552602`
2. **Task 2: Invite API + accept-invite page** - `8a41913` (feat)

**Plan metadata:** (this commit)

_Note: Task 2 was TDD — failing tests committed first (d552602), then implementation (8a41913)_

## Files Created/Modified

- `src/lib/email/invite-template.tsx` - React Email component: InviteEmailTemplate with inviterName/householdName/inviteUrl props
- `src/app/api/households/invite/route.ts` - POST endpoint: session check, field validation, auth.api.createInvitation call, 403 for non-admin
- `src/app/api/households/invite/route.test.ts` - 5 unit tests: 401/400x2/403/200 scenarios
- `src/app/(auth)/accept-invite/page.tsx` - Client page: session check -> auto-accept or sessionStorage + redirect to sign-up
- `src/lib/auth.ts` - Removed @ts-expect-error (invite-template now exists; directive became invalid)
- `src/app/(auth)/sign-up/page.tsx` - Added invitationId URL param reading on mount + post-signup redirect to accept-invite

## Decisions Made

- `auth.api.createInvitation` not `auth.api.inviteMember` — the plan specification used a method name that doesn't exist in better-auth v1.5.5; the organization plugin exposes `createInvitation` via the `/organization/invite-member` endpoint
- 403 detection uses error message substring matching — better-auth's createInvitation throws generic Error objects; checking for "not authorized"/"permission" in the message is the only way to distinguish auth errors from other failures
- Logged-out invite path uses two-step flow: store ID to sessionStorage on accept-invite, redirect to sign-up, then accept-invite page auto-calls acceptInvitation when user returns — avoids needing to pass ID through sign-up form

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Plan referenced non-existent auth.api.inviteMember**
- **Found during:** Task 2 (Invite API endpoint implementation)
- **Issue:** Plan specified `auth.api.inviteMember({ body: { ... }, headers })` which causes TypeScript error TS2339 — Property 'inviteMember' does not exist on the better-auth API type. The correct method in better-auth organization plugin is `auth.api.createInvitation`.
- **Fix:** Updated route.ts to call `auth.api.createInvitation` with same body shape. Updated test mock to mock `createInvitation` instead of `inviteMember`.
- **Files modified:** `src/app/api/households/invite/route.ts`, `src/app/api/households/invite/route.test.ts`
- **Verification:** `npx tsc --noEmit` passes with zero errors for Plan 05 files; all 5 tests pass
- **Committed in:** `8a41913` (Task 2 commit)

**2. [Rule 1 - Bug] @ts-expect-error in auth.ts became invalid once invite-template.tsx was created**
- **Found during:** Task 1 (TypeScript verification)
- **Issue:** Plan 03 added `@ts-expect-error` to suppress the missing-file error for the dynamic import. Once `invite-template.tsx` was created, TypeScript raised TS2578 "Unused '@ts-expect-error' directive" — turning it into an error itself.
- **Fix:** Removed the `@ts-expect-error` and its accompanying comments from auth.ts
- **Files modified:** `src/lib/auth.ts`
- **Verification:** `npx tsc --noEmit` passes with zero errors
- **Committed in:** `71e0273` (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 1 - Bug)
**Impact on plan:** Both fixes were necessary for TypeScript correctness. The inviteMember → createInvitation fix is a functionally equivalent rename using the correct API. No scope creep.

## Issues Encountered

None beyond the auto-fixed deviations above.

## User Setup Required

None — invite email delivery requires RESEND_API_KEY and RESEND_FROM_EMAIL already documented in `.env.local.example` from Plan 03. No new env vars introduced.

## Next Phase Readiness

- Plan 06 (Join Link flow) can use the same sessionStorage pattern established here
- /accept-invite page is operational for both logged-in and logged-out users
- Invite email sends via better-auth's sendInvitationEmail hook (Resend integration) — requires valid RESEND_API_KEY in production

---
*Phase: 01-foundation*
*Completed: 2026-03-12*

## Self-Check: PASSED

All 3 key files verified present on disk. All 3 task commits (71e0273, d552602, 8a41913) verified in git log.
