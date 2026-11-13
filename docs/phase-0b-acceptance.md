# The acceptance of Phase 0b

The lead's acceptance of the merged Phase 0b: what the plan asked for, where
each answer is, and what is still open.

**The instance:** the Supabase project `eaawnwfrkvjbdigyasbk`, PostgreSQL
17.11. **The merged result:** `main` at the time of writing.

## What is merged

Forty-nine pull requests, from #30 to #80. The phase's own tasks are on the
board (P0S-T01 to P0S-T48); the plan's tasks are the table at the end.

## The checks on the merged main

| Check | Result |
| --- | --- |
| `lint, type-check, unit tests, build` (the required one) | green |
| `supabase local stack, migrations, fixture, RLS` | green |
| `playwright, reporting only` | the job is no longer cancelled **while it runs**: P0S-T45 keeps a run on main from being cancelled by the next merge, and the newest run survives while superseded pending ones are dropped. **No run has completed under the new rule yet** - the first is still waiting for a runner - and the job's **specs have still never run**: the last completed run failed in the setup, and Playwright reported "168 did not run". Open: P0S-T43, P0S-T45 |

## The instance is the repository's schema

- **The ledger holds sixteen rows and names the same sixteen migrations the
  repository carries** - `0000_init` to `0015_lock_invitation_on_accept`,
  `0005a` included, `0011` absent because the invitation lock landed as
  `0015` (the runner applies the files in name order, and `0014` recreates
  the same function, so a file called `0011` would have been undone by it).
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
- **The check at the door**: the application refuses to serve when the role
  `DATABASE_URL` names is privileged, and - since P0S-T47 - when it cannot
  reach the database at all, on a host that is not provably local.

## The plan's thirteen tasks

| Plan task | Answer |
| --- | --- |
| 0b.1 the specification is amended | done (P0S-T12): §9.1a, §9.2, §9.2b, §10.1, §10.8, §12, §13.2a-c, §16.5, ADR-11/12/14 amended, ADR-16/17 added |
| 0b.2 the instance is re-verified | done: the fixture against the instance (above), the version recorded, the backup restore-tested (P0S-T13, P0S-T20) |
| 0b.3 the `pg` driver, and the pooling decided | done: the standard `pg` driver, and the **session pooler** on 5432 - the driver's named prepared statements are not compatible with transaction-mode pooling, and the advisory lock is transaction-scoped |
| 0b.4 the tables, additively | done (P0S-T03): `households`, `household_members`, `household_invitations` and the five sync tables |
| 0b.5 row-level security, the `app` role, the scope helper | done (P0S-T04): the policies key on `auth.uid()`, the role owns no table, and `src/db/scope.ts` is the one sanctioned path |
| 0b.6 every household-scoped query through the helper | done (P0S-T05) |
| 0b.7 Better Auth to Supabase Auth | done (P0S-T06): `@supabase/ssr`, the sign-up/sign-in/sign-out, the session helpers; the root `middleware.ts` **runs** (P0S-T22) and is being replaced by a guard that validates the session (P0S-T32, open) |
| 0b.8 the membership and invitation flows | done (P0S-T07): S-1 to S-4 closed |
| 0b.9 the household switcher, mounted | done (P0R-T13) |
| 0b.10 the transitional sign-in | done (P0S-T09): the legacy tables and the route stay until the rollback window closes; the removal date is in the checklist |
| 0b.11 CI runs the local stack | done (P0S-T10, P0S-T15): the stack, the version pin and the integration job |
| 0b.12 the cutover rehearsed | **half**: the runbook is written and the rehearsal runs locally (P0S-T11); the dry run against a scratch database **on the instance** is P0S-T42, open |
| 0b.13 the rename | done (P0S-T14): one pull request, `organization_id` to `household_id` throughout |

## What is open

- **The browser suite has never executed a spec.** The job is no longer
  cancelled while it runs (P0S-T45), but no run has completed under the new
  rule yet, and a merge to main still cancels a run that is waiting for a
  runner - so the first completed run needs a quiet main, or a run started by
  hand. The specs themselves have not run: the setup fails, and the helpers
  read the tables directly as the application role with no claims (so they
  see nothing), call two endpoints that the auth swap removed, and poll a
  legacy table the application stopped writing. P0S-T43, P0S-T45.
- **The cutover has not been rehearsed against the instance** (P0S-T42).
- **The root `middleware.ts` is being replaced** by a guard that validates
  the session and carries the destination (P0S-T32).
- **The phase's nine-check verification** (P0S-T16) is running.
- **After the cutover window**: the rollback window, the decommission of the
  seven legacy tables, and the removal of the transitional sign-in. These are
  the operator's decisions and the checklist's steps, not the phase's work.

## What the release needs from the product owner

- The **cutover window** and the **rollback window** (fourteen days), and the
  decision to decommission the legacy tables at the end of it.
- The **service-role key** in the deployment's environment (dashboard ->
  Project Settings -> API -> `service_role`); it must never reach a browser.
- The **domain**, in `NEXT_PUBLIC_APP_URL` and `RESEND_FROM_EMAIL`.
- The **Resend key**, if the invitation email is wanted; without it the
  invitation is still written to the database and only the email does not
  go out.
