---
phase: 01-foundation
plan: "01"
subsystem: testing
tags: [vitest, playwright, testing-library, jsdom, test-stubs, e2e]

# Dependency graph
requires: []
provides:
  - Vitest configuration with jsdom environment, path aliases, and @testing-library/jest-dom setup
  - Playwright configuration with webServer, storageState auth, and 3-browser projects (chromium/firefox/webkit)
  - E2E auth setup fixture (creates test user + household, saves storageState)
  - 7 E2E spec files covering AUTH-01 through HSHD-04 as fixme stubs
  - 3 Vitest integration stub files for household API routes (invite, join-links, join)
  - .env.test with test credentials placeholders
affects: [01-02, 01-03, 01-04, 01-05, 01-06]

# Tech tracking
tech-stack:
  added:
    - vitest 4.1.0 (unit/integration test runner)
    - "@vitejs/plugin-react (vitest React support)"
    - jsdom (browser simulation environment)
    - "@testing-library/react + @testing-library/jest-dom + @testing-library/user-event"
    - vite-tsconfig-paths (path alias resolution in vitest)
    - "@playwright/test 1.58.2 (E2E test runner)"
  patterns:
    - E2E stubs use test.fixme(title, async () => {}) — Playwright has no test.todo(title) API
    - Vitest integration stubs use test.todo(title) — Vitest supports this natively
    - Playwright storageState pattern for authenticated test sessions (e2e/auth.setup.ts)
    - webServer in playwright.config.ts auto-starts Next.js dev server during E2E runs

key-files:
  created:
    - vitest.config.ts
    - src/test/setup.ts
    - playwright.config.ts
    - e2e/auth.setup.ts
    - e2e/auth/signup.spec.ts
    - e2e/auth/login.spec.ts
    - e2e/auth/session-persistence.spec.ts
    - e2e/auth/logout.spec.ts
    - e2e/household/onboarding.spec.ts
    - e2e/household/invite-join.spec.ts
    - e2e/household/join-link.spec.ts
    - src/app/api/households/invite/route.test.ts
    - src/app/api/households/join-links/route.test.ts
    - src/app/api/households/join/route.test.ts
    - .env.test
  modified:
    - .gitignore (added playwright/.auth/ entry)
    - package.json (added test devDependencies)

key-decisions:
  - "Used test.fixme(title, async () => {}) for Playwright stubs — test.todo(title) does not exist in Playwright API; fixme marks tests as known-broken/pending and shows them in --list output"
  - "playwright/.auth/ is gitignored — auth state JSON contains session tokens and must never be committed"
  - ".env.test is tracked in git — contains only placeholder values (no real secrets), serves as documentation for required test env vars"

patterns-established:
  - "Playwright E2E stubs: test.fixme(title, async () => {}) — not test.todo()"
  - "Vitest integration stubs: test.todo(title) — native Vitest support"
  - "Auth sessions reused via storageState in playwright.config.ts projects"
  - "E2E setup project (auth.setup.ts) runs before chromium/firefox/webkit projects"

requirements-completed: [AUTH-01, AUTH-02, AUTH-03, AUTH-04, HSHD-01, HSHD-02, HSHD-03, HSHD-04]

# Metrics
duration: 31min
completed: 2026-03-12
---

# Phase 1 Plan 01: Test Infrastructure Scaffold Summary

**Vitest + Playwright test harness with 7 E2E spec files and 3 API integration stubs covering all 8 phase requirements as skipped/fixme stubs**

## Performance

- **Duration:** 31 min
- **Started:** 2026-03-12T14:18:11Z
- **Completed:** 2026-03-12T14:49:55Z
- **Tasks:** 2
- **Files modified:** 16

## Accomplishments
- Bootstrapped Next.js 16 project with TypeScript, Tailwind, App Router in existing git repo
- Configured Vitest with jsdom, React plugin, path aliases, and @testing-library/jest-dom — exits 0 with 3 stub files found
- Configured Playwright with webServer (auto-starts Next.js dev), storageState auth pattern, 3 browser projects
- Created 7 E2E spec files with test.fixme() stubs covering all 8 phase requirements (34 stubs across auth + household flows)
- Created 3 Vitest integration stubs for POST /api/households/{invite,join-links,join} (16 todo stubs)
- All test runners operational: `npx vitest run` exits 0, `npx playwright test --list` shows 103 tests in 8 files

## Task Commits

Each task was committed atomically:

1. **Task 1: Install test dependencies and configure Vitest** - `d5b4ba9` (chore/feat — initial project + vitest setup)
2. **Task 2: Configure Playwright and create all test stubs** - `a0eedcf` (test — E2E stubs + Playwright config)

**Plan metadata:** (docs commit — created after)

## Files Created/Modified
- `vitest.config.ts` - Vitest config with jsdom, React plugin, vite-tsconfig-paths, excludes e2e/.next
- `src/test/setup.ts` - Imports @testing-library/jest-dom for jest matchers
- `playwright.config.ts` - Playwright config with webServer, 4 projects, storageState auth
- `e2e/auth.setup.ts` - Auth setup fixture: signs up test user, creates household, saves storageState
- `e2e/auth/signup.spec.ts` - AUTH-01 stubs (5 fixme tests)
- `e2e/auth/login.spec.ts` - AUTH-02 stubs (5 fixme tests)
- `e2e/auth/session-persistence.spec.ts` - AUTH-03 stubs (3 fixme tests)
- `e2e/auth/logout.spec.ts` - AUTH-04 stubs (3 fixme tests)
- `e2e/household/onboarding.spec.ts` - HSHD-01 stubs (4 fixme tests)
- `e2e/household/invite-join.spec.ts` - HSHD-02 + HSHD-04 email path stubs (6 fixme tests)
- `e2e/household/join-link.spec.ts` - HSHD-03 + HSHD-04 join link stubs (8 fixme tests)
- `src/app/api/households/invite/route.test.ts` - HSHD-02 Vitest stubs (5 todo stubs)
- `src/app/api/households/join-links/route.test.ts` - HSHD-03 Vitest stubs (5 todo stubs)
- `src/app/api/households/join/route.test.ts` - HSHD-04 Vitest stubs (6 todo stubs)
- `.env.test` - Test credential placeholders (tracked, no real secrets)
- `.gitignore` - Added playwright/.auth/ entry

## Decisions Made
- Used `test.fixme(title, async () => {})` for Playwright stubs instead of `test.todo(title)` — Playwright's API does not include `test.todo(title)` (only `test.todo()` as a no-arg variant marking a test block itself). `test.fixme()` achieves the same visual result in `--list` output and marks tests as pending/known-broken.
- `.env.test` tracked in git with placeholder values only — serves as documentation of required environment variables for test environment setup.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Replaced test.todo() with test.fixme() in all E2E spec files**
- **Found during:** Task 2 (Configure Playwright and create all test stubs)
- **Issue:** Plan specified `test.todo(title)` pattern for Playwright E2E stubs. Playwright's `test` object has no `test.todo(title, callback)` method — only Vitest supports this API. Running `npx playwright test --list` threw `TypeError: _test.test.todo is not a function`.
- **Fix:** Replaced all `test.todo("title")` with `test.fixme("title", async () => {})` in all 7 E2E spec files. Fixme marks tests as known-pending, still shows them in `--list`, and causes them to be skipped (not fail) during test runs.
- **Files modified:** e2e/auth/signup.spec.ts, e2e/auth/login.spec.ts, e2e/auth/session-persistence.spec.ts, e2e/auth/logout.spec.ts, e2e/household/onboarding.spec.ts, e2e/household/invite-join.spec.ts, e2e/household/join-link.spec.ts
- **Verification:** `npx playwright test --list` shows Total: 103 tests in 8 files with no errors
- **Committed in:** a0eedcf (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug — Playwright API incompatibility)
**Impact on plan:** Required fix for correct Playwright stub behavior. The `test.fixme()` pattern is semantically identical to the intended `test.todo()` for Playwright — both mark tests as pending without executing them.

## Issues Encountered
- `create-next-app` refused to run in the existing directory containing `.claude/` and `.planning/` subdirectories. Resolved by manually creating `package.json` and running `npm install` directly.

## User Setup Required
None - no external service configuration required for test infrastructure. `.env.test` contains only placeholder values. Real credentials for `.env.local` are documented in `.env.local.example`.

## Next Phase Readiness
- Test harness is fully operational. All subsequent plans can reference `npx vitest run` and `npx playwright test --list` as verification commands.
- E2E stubs will become real tests as implementation plans ship their features.
- Vitest integration stubs for `/api/households/*` are ready for implementation in Plans 01-05 and 01-06.
- `e2e/auth.setup.ts` will need real routes (`/sign-up`, `/onboarding`, `/dashboard`) to function — these are implemented in Plans 01-02 through 01-04.

## Self-Check: PASSED

- All 15 key files verified present on disk
- Task 1 commit `d5b4ba9` verified in git log
- Task 2 commit `a0eedcf` verified in git log
- `npx vitest run` exits 0 (3 files, 16 todo stubs)
- `npx playwright test --list` shows 103 tests in 8 files

---
*Phase: 01-foundation*
*Completed: 2026-03-12*
