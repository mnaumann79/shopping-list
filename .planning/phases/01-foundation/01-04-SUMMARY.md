---
phase: 01-foundation
plan: 04
subsystem: auth
tags: [better-auth, react-hook-form, zod, shadcn-ui, next-js, organization-plugin]

# Dependency graph
requires:
  - phase: 01-03
    provides: better-auth server instance (auth.ts), auth client (auth-client.ts) with organizationClient plugin, API route at /api/auth/[...all], middleware with returnTo support

provides:
  - Sign-up page with name/email/password Zod validation, authClient.signUp.email(), redirect to /onboarding
  - Sign-in page with email/password Zod validation, authClient.signIn.email(), returnTo redirect support
  - Auth layout (centered card, no app chrome)
  - Protected app layout with server-side session validation via auth.api.getSession
  - Onboarding page: creates household via organization.create + setActive, redirects to /dashboard
  - Dashboard page (placeholder): Welcome header with HouseholdSwitcher and LogoutButton
  - HouseholdSwitcher component: shows current household, dropdown to switch via setActive + router.refresh
  - LogoutButton component: signOut then redirect to /sign-in

affects:
  - 01-05 (invite email: sign-up page reads invitationId from sessionStorage set by invite flow)
  - 01-06 (join link flow: sign-up reads pendingJoinToken from sessionStorage)
  - 02-* (all Phase 2 routes within (app) layout which performs server-side session check)
  - 03-* (HouseholdSwitcher and LogoutButton will be reused in future app layouts)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Email inputs use inputMode=email + autoComplete=email instead of type=email — JSDOM intercepts native browser validation on type=email, blocking form submission in Vitest tests"
    - "vi.mock factory must not reference outer-scope variables — vitest hoists vi.mock to top of file; declare vi.fn() inside factory, then import module after mock"
    - "DropdownMenuTrigger (base-ui) does not support asChild — apply button styles directly via className on DropdownMenuTrigger"

key-files:
  created:
    - src/app/(auth)/layout.tsx
    - src/app/(auth)/sign-up/page.tsx
    - src/app/(auth)/sign-in/page.tsx
    - src/app/(app)/layout.tsx
    - src/app/(app)/dashboard/page.tsx
    - src/app/(app)/onboarding/page.tsx
    - src/components/household-switcher.tsx
    - src/components/logout-button.tsx
    - src/app/(auth)/__tests__/sign-up.test.tsx
    - src/app/(auth)/__tests__/sign-in.test.tsx
    - src/app/(app)/__tests__/onboarding.test.tsx
    - src/components/__tests__/logout-button.test.tsx
  modified: []

key-decisions:
  - "Email inputs use inputMode=email + autoComplete=email instead of type=email — JSDOM native browser validation on type=email inputs blocks form submission before React/Zod validation runs"
  - "vi.mock factory must use vi.fn() inline (not reference outer variables) — vitest hoists vi.mock calls to before variable declarations"
  - "DropdownMenuTrigger is base-ui-based and does not accept asChild prop — inline className applied directly to trigger"
  - "Sign-up page persists invitationId from searchParams to sessionStorage via useEffect — supports invite flow arriving at sign-up from an invite email link"
  - "Onboarding page auto-redirects to /dashboard if session.activeOrganizationId already set — prevents re-creating household on accidental revisit"
  - "App layout redirects to /sign-in server-side (defense-in-depth per CVE-2025-29927) — middleware optimistic guard alone is insufficient"

patterns-established:
  - "Server Component session check: const session = await auth.api.getSession({ headers: await headers() }); if (!session) redirect()"
  - "Client form pattern: useForm + zodResolver + shadcn Form/FormField/FormMessage with root error display"
  - "Org switch pattern: await authClient.organization.setActive({ organizationId }); router.refresh()"
  - "Invite token persistence: sessionStorage.setItem('pendingInvitationId', id) on arrival, cleared after onboarding"

requirements-completed: [AUTH-01, AUTH-02, AUTH-03, AUTH-04, HSHD-01]

# Metrics
duration: 31min
completed: 2026-03-12
---

# Phase 1 Plan 04: Auth UI Summary

**Sign-up, sign-in, onboarding, protected app layout, household switcher, and logout button — complete auth + onboarding UI with server-side session guards and Zod validation**

## Performance

- **Duration:** 31 min
- **Started:** 2026-03-12T15:15:28Z
- **Completed:** 2026-03-12T15:46:40Z
- **Tasks:** 2
- **Files modified:** 12 (8 created + 4 test files)

## Accomplishments

- Auth pages (sign-up, sign-in) with react-hook-form + Zod validation, shadcn Card/Form components, authClient integration
- Protected app layout with server-side `auth.api.getSession` guard (defense-in-depth against CVE-2025-29927)
- Onboarding page creates household via `authClient.organization.create + setActive`, redirects to /dashboard; auto-redirects if user already has active org
- HouseholdSwitcher dropdown (base-ui DropdownMenu) loads org list, switches active org via `setActive + router.refresh`
- LogoutButton calls `signOut` and redirects to `/sign-in`
- Sign-up persists `invitationId` from URL to sessionStorage for invite flow (Plan 05/06 integration point)
- 26 unit tests passing across all auth and onboarding components

## Task Commits

Each task was committed atomically:

1. **Task 1 RED: Failing tests for sign-up and sign-in** - `0af7c60` (test)
2. **Task 1 GREEN: Auth pages — sign-up and sign-in with Zod validation** - `437059c` (feat)
3. **Task 2 RED: Failing tests for onboarding and logout button** - `5a23085` (test)
4. **Task 2 GREEN: Onboarding, app layout, household switcher, logout button** - `c6d69d9` (feat)

## Files Created/Modified

- `src/app/(auth)/layout.tsx` - Centered auth layout, no app chrome
- `src/app/(auth)/sign-up/page.tsx` - Sign-up form: name/email/password, Zod validation, authClient.signUp.email(), redirect to /onboarding; persists invitationId to sessionStorage
- `src/app/(auth)/sign-in/page.tsx` - Sign-in form: email/password, Zod validation, authClient.signIn.email(), returnTo redirect support
- `src/app/(app)/layout.tsx` - Server-side session check via auth.api.getSession, redirects unauthenticated to /sign-in
- `src/app/(app)/dashboard/page.tsx` - Placeholder dashboard: Welcome message with HouseholdSwitcher and LogoutButton in header
- `src/app/(app)/onboarding/page.tsx` - Household creation form, organization.create + setActive, slugify helper, auto-redirect if already has org
- `src/components/household-switcher.tsx` - DropdownMenu showing current household, org list loaded via authClient.organization.list()
- `src/components/logout-button.tsx` - Ghost button calling signOut and redirecting to /sign-in
- `src/app/(auth)/__tests__/sign-up.test.tsx` - 7 unit tests covering form validation and auth flows
- `src/app/(auth)/__tests__/sign-in.test.tsx` - 5 unit tests covering form validation and auth flows
- `src/app/(app)/__tests__/onboarding.test.tsx` - 6 unit tests covering household creation and redirect
- `src/components/__tests__/logout-button.test.tsx` - 2 unit tests covering signOut and redirect

## Decisions Made

- `type="email"` removed from email inputs, replaced with `inputMode="email" autoComplete="email"` — JSDOM's native browser validation on `type=email` intercepts form submission before React/Zod validation runs, causing `handleSubmit` to never fire in unit tests
- `vi.mock` factory functions must not reference outer scope variables — vitest hoists `vi.mock` calls to the top of the file, before `const mockFn = vi.fn()` declarations; `vi.fn()` must be inline in the factory, with the module imported after
- `DropdownMenuTrigger` from the project's base-ui-based shadcn component does not accept `asChild` — button styles applied directly via `className` on the trigger
- Sign-up page uses `useSearchParams` + `useEffect` to persist `invitationId` to sessionStorage — handles users arriving from invite email links before they have an account
- Onboarding redirects to `/dashboard` via `router.replace()` (not `push`) when user already has `activeOrganizationId` — avoids polluting browser history with onboarding entries

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Email inputs: type="email" breaks form submission in JSDOM tests**
- **Found during:** Task 1 (sign-up tests GREEN phase)
- **Issue:** `type="email"` inputs trigger JSDOM native HTML5 validation on form submit, preventing `handleSubmit` from firing when email is invalid. Zod never runs. Test for "shows error for invalid email format" was failing because no error appeared.
- **Fix:** Changed email `Input` to use `inputMode="email" autoComplete="email"` without `type="email"`. Zod schema `z.string().email()` handles all format validation.
- **Files modified:** `src/app/(auth)/sign-up/page.tsx`, `src/app/(auth)/sign-in/page.tsx`
- **Verification:** Test "shows error for invalid email format" passes. All 26 unit tests pass.
- **Committed in:** `437059c` (Task 1 commit)

**2. [Rule 1 - Bug] vi.mock hoisting: Cannot access variable before initialization**
- **Found during:** Task 1 and Task 2 (both test files)
- **Issue:** `vi.mock("@/lib/auth-client", () => ({ authClient: { signUp: { email: mockSignUp } } }))` — `mockSignUp` is a `const` declared before `vi.mock` in source, but `vi.mock` is hoisted to file top, so `mockSignUp` is accessed before initialization. Results in `ReferenceError`.
- **Fix:** Changed factory to use `vi.fn()` inline: `{ email: vi.fn() }`. Added `import { authClient } from "@/lib/auth-client"` after the mock declaration. Used `vi.mocked(authClient.signUp.email).mockResolvedValueOnce(...)` in tests.
- **Files modified:** `src/app/(auth)/__tests__/sign-up.test.tsx`, `src/app/(auth)/__tests__/sign-in.test.tsx`, `src/app/(app)/__tests__/onboarding.test.tsx`, `src/components/__tests__/logout-button.test.tsx`
- **Verification:** All mock tests pass correctly.
- **Committed in:** `437059c` (Task 1), `c6d69d9` (Task 2)

**3. [Rule 1 - Bug] DropdownMenuTrigger does not support asChild prop**
- **Found during:** Task 2 TypeScript check
- **Issue:** `DropdownMenuTrigger` wraps `@base-ui/react/menu` `MenuPrimitive.Trigger` which does not have an `asChild` prop. TypeScript error: `Property 'asChild' does not exist on type '...'`
- **Fix:** Removed `asChild` and the `<Button>` wrapper, applied button-equivalent styles directly via `className` on `DropdownMenuTrigger`
- **Files modified:** `src/components/household-switcher.tsx`
- **Verification:** TypeScript reports zero errors. Visually equivalent trigger.
- **Committed in:** `c6d69d9` (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (all Rule 1 - Bug)
**Impact on plan:** All three fixes required for correctness/testability. No scope creep. Functionality is equivalent to plan spec.

## Issues Encountered

None beyond the auto-fixed deviations above.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Plan 05 (Invite Email Template): `sendInvitationEmail` in `auth.ts` imports `InviteEmailTemplate` via dynamic import — needs `src/lib/email/invite-template.ts` created
- Plan 05/06 (Invite/Join Flow): Sign-up page reads `invitationId` from URL and persists to sessionStorage. After successful org creation in onboarding, sessionStorage is cleared. Full invite/join flow must implement the accept/join logic.
- Plan 06 (Join Link Flow): Sign-up persists `pendingJoinToken` from sessionStorage (same pattern as invitationId)
- Middleware is active and will redirect unauthenticated users to `/sign-in?returnTo=<path>` — sign-in page reads and uses `returnTo`
- All auth pages and app shell complete — Phase 2 feature development can proceed

---
*Phase: 01-foundation*
*Completed: 2026-03-12*

## Self-Check: PASSED

All 8 implementation files verified present on disk. All 4 task commits (0af7c60, 437059c, 5a23085, c6d69d9) verified in git log.
