---
phase: 1
slug: foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-11
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.x + React Testing Library 16.x (unit/integration); Playwright (E2E) |
| **Config file** | `vitest.config.ts` — does not exist yet (Wave 0 gap) |
| **Quick run command** | `npx vitest run` |
| **Full suite command** | `npx vitest run && npx playwright test` |
| **Estimated runtime** | ~60 seconds (unit: ~5s, E2E: ~55s) |

> **Note:** Async Server Components cannot be unit-tested with Vitest (React ecosystem limitation). Use Playwright E2E for Server Component behavior and auth flows.

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run`
- **After every plan wave:** Run `npx vitest run && npx playwright test --project=chromium`
- **Before `/gsd:verify-work`:** Full suite must be green (`npx playwright test` all browsers)
- **Max feedback latency:** 30 seconds (unit/integration), 60 seconds (E2E per wave)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 1-01-01 | 01 | 0 | AUTH-01 | E2E stub | `npx playwright test e2e/auth/signup.spec.ts` | ❌ W0 | ⬜ pending |
| 1-01-02 | 01 | 0 | AUTH-02 | E2E stub | `npx playwright test e2e/auth/login.spec.ts` | ❌ W0 | ⬜ pending |
| 1-01-03 | 01 | 0 | AUTH-03 | E2E stub | `npx playwright test e2e/auth/session-persistence.spec.ts` | ❌ W0 | ⬜ pending |
| 1-01-04 | 01 | 0 | AUTH-04 | E2E stub | `npx playwright test e2e/auth/logout.spec.ts` | ❌ W0 | ⬜ pending |
| 1-02-01 | 02 | 0 | HSHD-01 | E2E stub | `npx playwright test e2e/household/onboarding.spec.ts` | ❌ W0 | ⬜ pending |
| 1-02-02 | 02 | 0 | HSHD-02 | Integration stub | `npx vitest run src/app/api/households` | ❌ W0 | ⬜ pending |
| 1-02-03 | 02 | 0 | HSHD-03 | Integration stub | `npx vitest run src/app/api/households/join-links` | ❌ W0 | ⬜ pending |
| 1-02-04 | 02 | 0 | HSHD-04 | E2E stub | `npx playwright test e2e/household/invite-join.spec.ts` | ❌ W0 | ⬜ pending |
| 1-02-05 | 02 | 0 | HSHD-04 | E2E stub | `npx playwright test e2e/household/join-link.spec.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `vitest.config.ts` — Vitest config with jsdom, path aliases, setup file
- [ ] `src/test/setup.ts` — RTL cleanup, jest-dom matchers
- [ ] `playwright.config.ts` — webServer, projects (setup + chromium + firefox + webkit), storageState
- [ ] `e2e/auth.setup.ts` — Playwright auth setup that creates test user + household
- [ ] `e2e/auth/signup.spec.ts` — AUTH-01 scenarios (stubs)
- [ ] `e2e/auth/login.spec.ts` — AUTH-02 scenarios (stubs)
- [ ] `e2e/auth/session-persistence.spec.ts` — AUTH-03 scenarios (stubs)
- [ ] `e2e/auth/logout.spec.ts` — AUTH-04 scenarios (stubs)
- [ ] `e2e/household/onboarding.spec.ts` — HSHD-01 scenarios (stubs)
- [ ] `e2e/household/invite-join.spec.ts` — HSHD-02 + HSHD-04 email invite path (stubs)
- [ ] `e2e/household/join-link.spec.ts` — HSHD-03 + HSHD-04 join link path (stubs)
- [ ] Install: `npm install -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event vite-tsconfig-paths`
- [ ] Install: `npm install -D @playwright/test && npx playwright install`
- [ ] `.env.test` with `TEST_EMAIL`, `TEST_PASSWORD`, `DATABASE_URL` (test Neon branch)
- [ ] `.gitignore` entry: `playwright/.auth/`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Invited email received by recipient | HSHD-02 | Resend delivery cannot be verified in automated tests without a test inbox service | Send invite to a real email address; verify delivery within 2 minutes |
| Session persists on real iOS Safari | AUTH-03 | DevTools simulation is not sufficient for Safari ITP (see research pitfalls) | Test on physical iOS device with custom domain (not *.vercel.app) |
| Join link works across different devices | HSHD-03 | Simulated in E2E but real-device cross-session behavior differs | Generate join link on desktop; use it on a mobile browser |

---

## Key Test Scenarios

**SC1 — Sign up + persist across refresh:**
1. Navigate to /sign-up → fill email, password → submit
2. Complete onboarding (household name)
3. Verify redirect to /dashboard
4. Reload page → verify still on /dashboard (not redirected to /sign-in)
5. Open new tab to /dashboard → verify authenticated

**SC2 — Logout from any page:**
1. Authenticate via storageState
2. Navigate to /dashboard → click logout
3. Verify redirect to /sign-in
4. Navigate to /dashboard directly → verify redirect to /sign-in

**SC3 — Household creation during onboarding:**
1. Complete signup with new email
2. Verify redirect to /onboarding (not /dashboard)
3. Enter household name → submit
4. Verify redirect to /dashboard
5. Verify household switcher shows the created household name

**SC4 — Email invite → member joins:**
1. Admin logs in → navigates to household settings → enters email → sends invite
2. Verify invitation record in DB (integration test)
3. New user arrives at /accept-invite?invitationId=xxx
4. Sign up with same email → verify auto-join (no extra accept step)
5. Verify member appears in household member list

**SC5 — Shareable join link:**
1. Admin generates join link → copy URL
2. New user navigates to /join?token=xxx → redirected to /sign-up?joinToken=xxx
3. Completes signup → verify auto-join to household
4. Same link works for a second new user (multi-use)
5. Set expiresAt to past in DB → verify expired link shows error page

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
