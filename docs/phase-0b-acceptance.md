# The acceptance of Phase 0b

The lead's acceptance of the merged Phase 0b: what the plan asked for, where
each answer is, and what is still open.

**The instance:** the Supabase project `eaawnwfrkvjbdigyasbk`, PostgreSQL
17.11. **The merged result:** `main` at the time of writing.

## What is merged

Sixty-eight pull requests, from #30 to #97. The phase's own tasks are on the
board (P0S-T01 to P0S-T59); the plan's tasks are the table at the end.

## The checks on the merged main

| Check | Result |
| --- | --- |
| `lint, type-check, unit tests, build` (the required one) | green |
| `supabase local stack, migrations, fixture, RLS` | green |
| `playwright, reporting only` | the suite runs on the runner: the four-worker run finished in **25.5 minutes** (the job 27.7, its budget 45), **127 passed and 42 failed**, and the job concluded **failure**. A run that does not finish is now a failure both reporters see (P0S-T50): the suite's budget is the `timeout` command and not the step's own, so a step that runs out of time fails, the job carries on to the report and to the issue, and the issue says **"The browser suite did not finish: it was stopped before the last test ran."** The journey-failure issue carries both: the killed run's comment says "did not finish", the finished run's says "failed". |

## The browser suite, measured

The suite has never had a green run before this phase, and the phase's own
runs are what made the numbers exist:

| Run | What it was | Result |
| --- | --- | --- |
| The chromium project against the **local stack**, on merged main | the lead's run, one worker | 44 tests in **5.8 minutes**: 36 passed, 5 failed |
| The same, with the guard's file in `src/` | the same run after P0S-T57 | **41 passed, 2 failed** |
| The whole suite **on the CI runner**, four workers | the first run that finished | 169 tests in **25.5 minutes**: **127 passed, 42 failed** — and the 42 are the form race, which P0S-T60 fixed |
| The whole suite against the **development instance** | the lead's run, one worker | 169 tests in 1.7 hours: 83 passed, 79 failed, 7 did not run — the numbers and the causes are in [`docs/e2e-against-the-instance.md`](./e2e-against-the-instance.md) |

The failures were never mysterious, and they were not the suite's fault:

- **The edge guard was absent in development** (P0S-T57). The guard's file
  was at the project root, and the *development server* does not run a file
  there - only the built application does. The suite runs against the
  development server, so it had been measuring an application without the
  guard, while the deployment runs one with it. Two specs failed because the
  destination was never carried, and one spec pinned the *absence* of the
  guard - it asserted the sign-in page's whole URL, which the guard's own URL
  breaks.
- **Playwright's defaults were too tight for a loaded machine** (P0S-T50). A
  test had thirty seconds and an expectation five; the specs that create a
  user and a household need more than that once the workers share the CPU
  with the application. The budgets are now two minutes and fifteen seconds.
- **The transitional sign-in's failure path needs the service-role key**,
  which the run does not carry. The route answers 500 instead of 401 on that
  path, and the specs do not notice, because the page shows the same message
  either way. The log says so: "SUPABASE_SERVICE_ROLE_KEY is not configured".

## The instance is the repository's schema

- **The ledger holds sixteen rows and names the same sixteen migrations the
  repository carries** - `0000_init` to `0015_lock_invitation_on_accept`,
  `0005a` included, `0011` absent because the invitation lock landed as
  `0015` (the runner applies the files in name order, and `0014` recreates the
  same function, so a file called `0011` would have been undone by it).
- **The §10.8 fixture runs against the instance as the application role**:
  44 scenarios, 270 assertions, **ALL PASSED**, exit 0. (The fixture's README
  claims 45 and 271; the difference is a counting convention - one FIELD
  scenario's assertions run inside FIELD 3.)
- **The version is 17.11**, and the local stack's pin is 17 - the
  integration job asserts the match (`scripts/ci/assert-postgres-version.mjs`),
  so the policies are verified against the major version the instance runs.

## The deployment's environment

The checklist's environment section is the operator's document, and it now
describes what the deployment actually needs:

- **The eight variables** the application reads, and nothing it does not:
  `DATABASE_URL`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
  `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `ADMIN_EMAIL`. The three
  `NEXT_PUBLIC_*` are inlined at build time, so they belong in the build
  environment as well.
- **A connection string that verifies the pooler**, not merely encrypts to
  it: `?sslmode=verify-full` with `NODE_EXTRA_CA_CERTS` pointing at
  Supabase's root certificate, which is in the repository at
  `deploy/prod-ca-2021.crt`. Measured: with the certificate supplied the
  connection is made as `app` and the chain is verified; without it, it is
  refused with "self-signed certificate in certificate chain". The
  certificate in the repository is byte-identical to the root the pooler's
  certificate chains to.
- **A password of the deployment's own.** The cutover sets the application
  role's password afresh, through the flow that re-syncs the pooler, and the
  deployment's `DATABASE_URL` carries the new one (P0S-T56). The password
  the rehearsal used is not carried across - it is short, it was set for a
  rehearsal, and it is already in this project's environment.
- **The check at the door**: the application refuses to serve when the role
  `DATABASE_URL` names is privileged, and - since P0S-T47 - when it cannot
  reach the database at all, on a host that is not provably local.

## The guard: where it lives, and what each runtime does with it

The phase's one finding about the framework, and it is the kind that only
shows up when both runtimes are measured against each other:

| the guard's file | `next dev` | `next build` + `next start` |
| --- | --- | --- |
| `<root>/middleware.ts` (before P0S-T57) | **does not run** | runs |
| `<root>/src/middleware.ts` (now) | runs | runs |

The build honours a file in the project root; the development server looks
for it in `src/`, where the application lives, and never sees it. The
repository's §12.1b had recorded - from the build's artifacts - that the root
file runs, and that was true, and it was not the whole truth: the browser
suite, which runs against the development server, was exercising an
application without the guard. The guard's file is now in `src/`, and both
runtimes run the same guard, so the suite measures the application the
deployment runs.

## The plan's thirteen tasks

| Plan task | Answer |
| --- | --- |
| 0b.1 the specification is amended | done (P0S-T12): §9.1a, §9.2, §9.2b, §10.1, §10.8, §12, §13.2a-c, §16.5, ADR-11/12/14 amended, ADR-16/17 added |
| 0b.2 the instance is re-verified | done: the fixture against the instance (above), the version recorded, the backup restore-tested (P0S-T13, P0S-T20) |
| 0b.3 the `pg` driver, and the pooling decided | done: the standard `pg` driver, and the **session pooler** on 5432 - the driver's named prepared statements are not compatible with transaction-mode pooling, and the advisory lock is transaction-scoped |
| 0b.4 the tables, additively | done (P0S-T03): `households`, `household_members`, `household_invitations` and the five sync tables |
| 0b.5 row-level security, the `app` role, the scope helper | done (P0S-T04): the policies key on `auth.uid()`, the role owns no table, and `src/db/scope.ts` is the one sanctioned path |
| 0b.6 every household-scoped query through the helper | done (P0S-T05) |
| 0b.7 Better Auth to Supabase Auth | done (P0S-T06): `@supabase/ssr`, the sign-up/sign-in/sign-out, the session helpers; the guard that replaced the root middleware is P0S-T32, and its file moved into `src/` in P0S-T57 |
| 0b.8 the membership and invitation flows | done (P0S-T07): S-1 to S-4 closed - by the role check, not by the deletion the specification used to describe (P0S-T54) |
| 0b.9 the household switcher, mounted | done (P0R-T13) |
| 0b.10 the transitional sign-in | done (P0S-T09): the legacy tables and the route stay until the rollback window closes; the removal date is in the checklist |
| 0b.11 CI runs the local stack | done (P0S-T10, P0S-T15): the stack, the version pin and the integration job |
| 0b.12 the cutover rehearsed | done (P0S-T11, P0S-T42): the runbook, and the dry run against a scratch database **on the instance** - which wrote nothing to the instance and left it as it was |
| 0b.13 the rename | done (P0S-T14): one pull request, `organization_id` to `household_id` throughout |

## What is open

- **The cutover itself**, and the operator's window: the checklist's T−7 and
  T−1 steps need dates, and the rollback window is fourteen days.
- **The deployment's environment**: the service-role key, the domain, and the
  Resend key if the invitation email is wanted.
- **The form's race** (P0S-T61): a visitor who types before the page has
  hydrated loses the text. The suite found it; the specs no longer depend on
  it (P0S-T60), but the product still has it.
- **The application's patience** (P0S-T63): a request that cannot reach the
  database waits for ever instead of answering. The pool has no connection
  timeout, and the second run against the instance is what showed it.
- **A third run against the instance**, with the pool's timeouts in place,
  is the one that would close the loop. The instance is as it was: the run's
  rows and accounts were removed and the counts are back to the ones that
  predate the run.

## What the release needs from the product owner

- The **cutover window** and the **rollback window** (fourteen days), and the
  decision to decommission the legacy tables at the end of it.
- The **service-role key** in the deployment's environment (dashboard ->
  Project Settings -> API -> `service_role`); it must never reach a browser.
- The **domain**, in `NEXT_PUBLIC_APP_URL` and `RESEND_FROM_EMAIL`.
- The **Resend key**, if the invitation email is wanted; without it the
  invitation is still written to the database and only the email does not
  go out.
