# Shopping List — Phased Implementation & Recovery Roadmap

**Status:** Proposed — pending product-owner approval
**Strategy:** **Partial rebuild** (see `docs/project.md` §2, ADR-01)
**Primary outcome:** the application works reliably in a grocery store with no
internet connection, then converges correctly across household devices when
connectivity returns.
**Companion document:** `docs/project.md` — the product specification and
architecture this plan implements.

---

## 0. How this plan is organised

### 0.1 Team and roles

| Role in this plan | Responsibility | Scope boundary |
| --- | --- | --- |
| **Lead Engineer** | Planning, architectural decisions, API contract coordination, cross-component integration, quality acceptance | Owns `docs/`, `src/shared/**` (contracts), and the release boundary. Does not write application code. |
| **Frontend Designer** | UI, accessibility, mobile behaviour, browser-local persistence integration, offline UX | Owns `src/client/**`, `src/app/**` components, `src/components/**`, `public/**` |
| **Backend Engineer** | API design, business logic, authentication, sync endpoints, backend tests | Owns `src/server/**`, `src/app/api/**`, `src/lib/**` (auth) |
| **Database Expert** | PostgreSQL schema, migrations, data integrity, sync storage, security, database performance | Owns `src/db/**`, `db/**`, migration SQL |

> On the current roster these map to: Lead → Michael; Backend → Backend Engineer
> role; Database → Database Expert role; Frontend → Frontend Designer role.

**Rule from the team charter, applied throughout:** one task = one branch = one
PR = one owner = one set of files. Two concurrently active tasks never share a
writable path. The product owner merges; the lead recommends the merge order.

### 0.2 Phase dependency graph

```
Phase 0  Reliable Baseline
   │
   ▼
Phase 0b Supabase Migration (hosting, database, auth)
   │
   ▼
Phase 1  Security & Data-Integrity Repairs
   │
   ▼
Phase 2  Architecture Contracts (spike — no production code)
   │
   ├──────────────────────────────┐
   ▼                              ▼
Phase 3  Server Sync Core      Phase 4  Client Local-First Core
   │                              │
   └──────────────┬───────────────┘
                  ▼
         Phase 5  Sync Engine & Convergence
                  │
                  ▼
         Phase 6  Offline UX, PWA & Household Scenarios
                  │
                  ▼
         Phase 7  Hardening & Release Readiness
```

Phases 3 and 4 run **in parallel** after Phase 2, because Phase 2 freezes the
contracts they both depend on. They touch disjoint file sets (§0.3).

### 0.3 File-ownership matrix

Each column is owned exclusively by that role. A task in one column may not
edit a file in another column. The Lead owns the contract column and **freezes
it at the end of Phase 2** — after that it is read-only for everyone.

| Owned exclusively by | Paths |
| --- | --- |
| **Lead** | `docs/**`, `src/shared/**` (contract types), `ARCHITECTURE/**` (ADRs) |
| **Backend** | `src/server/**`, `src/app/api/**`, `src/lib/auth.ts`, `src/lib/request-auth.ts`, `src/lib/auth-client.ts`, `src/lib/categories.ts` |
| **Database** | `src/db/**`, `db/**` |
| **Frontend** | `src/client/**`, `src/app/**` (non-`api`), `src/components/**`, `src/lib/toast.ts`, `src/lib/utils.ts`, `public/**` |
| **Shared CI / scripts** | `.github/workflows/**`, `scripts/**`, `playwright.config.ts`, `vitest.config.ts`, `package.json`, `e2e/**` — **one owner per task**, named explicitly in each phase |

**A schema change ships in two files.** The migration goes in `db/migrations/`,
and the flat snapshot `db/init.sql` is regenerated to match it: the runner's
invariant is that a database bootstrapped from `db/init.sql` and a database
built by `pnpm db:migrate` end up with the same schema, constraint names
included. `src/db/migrations/` is drizzle-kit's output folder — a hand-written
migration placed there is overwritten by the next `drizzle-kit generate`.

`package.json` and the CI configuration are touched in several phases. To avoid
conflicts, **each phase's CI/scripts work is a single task with a single owner**,
and the owner is named in the phase.

### 0.4 Definition of "done" — applies to every phase

A phase is done when **all** of the following hold:

1. Every task in the phase has an approved PR, and the PRs have been merged in
   the recommended order.
2. `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and
   `pnpm test:e2e` all pass **on the merged result** — not merely on
   individual branches.
3. `pnpm test:integration` passes **from Phase 0b onward**. The integration
   suite is introduced by task 0b.11, which runs the **Supabase local stack**
   in CI — the row-level security policies key on `auth.uid()`, and only
   GoTrue provides it, so a bare PostgreSQL container cannot evaluate them.
   Phase 0 does not require it: the suite does not exist there yet.
3. The phase's **verification commands** have been executed and their output
   attached. An unrun check is reported as a gap, never as a pass.
4. The phase's **demonstration** (a scripted, repeatable run) succeeds.
5. No invariant from `docs/project.md` §4.1 is weakened without a recorded ADR.
6. The Lead has confirmed the integrated feature works end to end — not merely
   that the individual PRs pass.

### 0.5 Effort summary

| Phase | Duration (4-person team) | Primary risk |
| --- | --- | --- |
| 0 — Reliable Baseline | 1 week | Low |
| 0b — Supabase Migration | 2 weeks | High (a cutover touches live data) |
| 1 — Security & Data-Integrity Repairs | 1 week | Low |
| 2 — Architecture Contracts | 1 week | Low (spike; resolves uncertainty) |
| 3 — Server Sync Core | 2 weeks | Medium (atomicity of the apply transaction) |
| 4 — Client Local-First Core | 2 weeks | Medium (hydration/rendering regressions) |
| 5 — Sync Engine & Convergence | 2 weeks | Medium (conflict-rule correctness) |
| 6 — Offline UX, PWA & Household Scenarios | 2 weeks | Medium (iOS Safari specifics) |
| 7 — Hardening & Release Readiness | 1 week | Low |
| **Total** | **≈ 14 weeks** | |

---

## Phase 0 — Reliable Baseline

### Objective

Establish a trustworthy green baseline before changing the architecture. Right
nothing can be verified, because the test suite fails, the type-check fails,
and CI runs neither.

### Scope

| # | Task | Owner | Files |
| --- | --- | --- | --- |
| 0.1 | Add `typecheck` script (`tsc --noEmit`) and a `ci.yml` workflow running lint, typecheck, unit, build on every PR | Lead | `package.json`, `.github/workflows/ci.yml` |
| 0.2 | Fix the 6 failing `onboarding.test.tsx` tests (wrap in `ThemeProvider`) | Frontend | `src/app/(app)/__tests__/onboarding.test.tsx` |
| 0.2b | Fix the 9 `tsc` errors in the route test files — `src/app/api/**` is Backend's, so this task sits with Backend | Backend | `src/app/api/households/join-links/route.test.ts`, `src/app/api/items/clear-completed/route.test.ts` |
| 0.3 | Make the DB client lazy so a missing `DATABASE_URL` fails at request time, not at import time | Database | `src/db/index.ts` |
| 0.4 | Fix the `db/init.sql` drift (constraint-name mismatch vs. the Drizzle migration) and add a `db:migrate` script that runs the real migrations | Database | `db/init.sql`, `db/migrations/**`, `package.json` |
| 0.5 | Load `.env.test` in Vitest and Playwright (the `dotenv` dependency is installed but unused) | Lead | `vitest.config.ts`, `playwright.config.ts` |
| 0.6 | Fix `e2e/auth.setup.ts` so the E2E suite can actually sign up (the retrospective records this as broken) | Frontend | `e2e/auth.setup.ts`, `e2e/auth/**` |
| 0.7 | Decide the fate of the `test.fixme` placeholder specs: implement them or delete them. **Decision: implement the AUTH-01…04 and HSHD-01…04 matrix.** | Frontend | `e2e/auth/**`, `e2e/household/**` |

### Deliverables

- A `ci.yml` that blocks merges on lint, type-check, unit tests, and build.
- `pnpm test` green (0 failures).
- `pnpm typecheck` green.
- A working `pnpm db:migrate` that applies the real Drizzle migrations.
- The E2E suite able to sign up and create a household unaided.

### Dependencies

None. This phase starts immediately.

### Files / architectural areas affected

CI configuration, test configuration, the DB bootstrap, and the E2E harness.
**No production behaviour changes** — this phase makes the existing system
verifiable, nothing more.

### Risks

| Risk | Likelihood | Mitigation |
| --- | --- | --- |
| New CI is red on the first run because of pre-existing failures | High | Expected — the phase's own work is to make it green. Sequence 0.1's workflow addition *after* 0.2/0.3 land, or open the PR with the workflow but expect a red first run. |
| `db:migrate` surfaces drift between `db/init.sql` and the Drizzle migrations | Medium | That is the point of the task. Task 0.4 reconciles them and adds a check. |
| `pnpm db:migrate` is run against production by mistake | Low | The script refuses to run against anything that is not a development host: an allowlist of `localhost`, `127.0.0.1`, `::1` and anything ending in `.local` or `.localhost`, with an explicit `DB_MIGRATE_ALLOW_ANY_HOST=1` opt-in. It checks the host the driver would really connect to, not the one the URL appears to name. |

### Verification approach

```
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm db:migrate            # against the dev database only
pnpm exec playwright test  # full suite
```

Plus: push a deliberately broken PR and confirm CI goes red (proves the gate
works).

### Definition of done

- All six commands pass on `main`.
- CI runs on `pull_request` and is a required check.
- Every `test.fixme` placeholder under `e2e/` is implemented (not deleted) and passing.
- The Lead confirms the CI gate blocks a bad PR.

---

## Phase 0b — Supabase Migration (hosting, database, authentication)

### Objective

Move the **hosting** to the self-hosted Supabase instance, move
**authentication** from Better Auth to Supabase Auth, and turn tenant
isolation into a database-enforced second layer — **before any feature work
begins**. The offline-first rebuild is the product's defining risk; it should
not be built on a platform the product owner has already decided to leave, and
the authentication rewrite is cheaper now than after Phase 4 has built a client
on top of it.

This phase changes the **stack**, not the product. No feature is added, and
nothing the user sees changes — except that their passwords keep working
(§13.2c), which is the whole point of doing the auth change before the
cutover rather than after.

### Scope

| # | Task | Owner | Files |
| --- | --- | --- | --- |
| 0b.1 | Amend the specification for the new stack: §9.1a (identity types), §9.2 (household tables), §9.2b (RLS), §10.1/§10.8 (`household_id` rename, the interactive transaction), §12 (Supabase Auth), §13.2a–c (the cutover), §16.5 (CI), ADR-11/12/14 (amended), ADR-16/17 (new) | Lead | `docs/project.md` |
| 0b.2 | **Re-verify the target instance.** §16.4 already records PostgreSQL 17.11 and the fixture's pass: re-run the fixture against the instance and record the version and the outcome; confirm `pg_advisory_xact_lock`, `hashtextextended`, `jsonb_to_recordset` and the data-modifying CTEs behave as expected; confirm the `auth` schema is present and `auth.uid()` resolves; take and **restore-test** a backup | Database | `src/db/fixture/**` (scratch and evidence) |
| 0b.3 | Replace the driver with the standard `pg` driver and add `pg` and `@supabase/ssr` to `package.json` — there is one driver, so there is nothing to switch (ADR-16). Decide the pooling: direct connection to the instance, or the Supavisor pooler with `?pgbouncer=true` (the `pg` driver's named prepared statements are not compatible with transaction-mode pooling). **The advisory lock is transaction-scoped, so it is safe under a transaction-mode pooler** | Database | `src/db/index.ts`, `package.json`, `.env.local.example` |
| 0b.4 | Create `households`, `household_members`, `household_invitations` and the five sync tables of §9.2, additively, with the Drizzle schema for them | Database | `src/db/schema/**`, `db/migrations/**`, `db/init.sql` |
| 0b.5 | Enable RLS on every household-scoped table with policies keyed on `auth.uid()` (§9.2b), create the non-owner `app` role the application connects as, and add the `household_members` policy that stops the recursion; add the scope helper `src/db/scope.ts`: one `db.transaction()` that sets `request.jwt.claims` **locally** and runs the caller's query on the transaction's client | Database | `db/migrations/**`, `src/db/scope.ts` |
| 0b.6 | Route every household-scoped query through the scope helper from task 0b.5, which is the only sanctioned path (it **is** Phase 1's task 1.4, now with RLS behind it). The household membership and invitation services move in task 0b.8 | Backend | `src/server/services/items.ts` |
| 0b.7 | Replace Better Auth with Supabase Auth: `@supabase/ssr` server and browser clients, sign-up/sign-in/sign-out, the `sb-household` cookie, and the session helpers in `request-auth.ts` (13 API route files import them; 11 of them call `requireActiveOrganization`). **The middleware half of today's auth story is dead code**: the repository's root `middleware.ts` does not run — the app lives under `src/`, and there is no `src/middleware.ts` - while the guard that does run is `redirect("/sign-in")` in `src/app/(app)/layout.tsx`, without a `returnTo` (`docs/project.md` §12.1b). Whether that file moves to `src/`, is replaced, or is deleted is decided with the cutover, not here | Backend | `src/lib/auth.ts`, `src/lib/request-auth.ts`, `src/lib/auth-client.ts`, `src/app/api/auth/[...all]/route.ts` |
| 0b.8 | Replace the household membership and invitation flows with the new tables: `requireHouseholdRole`, invite by email, list and cancel invitations, add and remove members. This also closes **S-1** (a plain member can mint a join link), **S-2** (a plain member invalidates the admin's link), **S-3** (403 returned as 500) and **S-4** (the unauthenticated invitation-email endpoint) | Backend | `src/server/services/households.ts`, `src/app/api/households/**`, `src/app/api/invitation-email/route.ts` |
| 0b.9 | Mount the household switcher in the app header for the first time, and update it, the header, onboarding and the sign-in/sign-up/join/accept-invite pages against the renamed contract (task 0b.4). Add the lint rule that forbids direct access to the household-scoped tables outside the scope helper, with its protected-table list derived from the Drizzle schema | Frontend | `src/components/household-switcher.tsx`, `src/components/AppHeader.tsx`, `src/app/onboarding/page.tsx`, `src/app/(auth)/**`, `eslint.config.mjs` |
| 0b.10 | The **transitional sign-in** that carries existing passwords across (§13.2c). Better Auth's scrypt hashes cannot be converted to GoTrue's bcrypt, so the old password is verified once and re-provisioned. Better Auth stays a dependency until the rollback window closes, and this task records its removal date. The transitional sign-in must not assume the middleware's `returnTo` behaviour: the guard that runs redirects to `/sign-in` without it (§12.1b) | Backend | `src/app/api/auth/legacy-signin/route.ts` |
| 0b.11 | CI runs the **Supabase local stack**, not a bare PostgreSQL container — the RLS policies need `auth.uid()`, which only GoTrue provides. The local stack's PostgreSQL major version must match the production instance's, and the integration job asserts it | Lead | `.github/workflows/**`, `supabase/config.toml` |
| 0b.12 | Rehearse the cutover runbook (§13.2a of `docs/project.md`, written in task 0b.1) and correct it where the rehearsal finds a gap: the dump, the restore, the identity mapping, the verification queries, and the rollback. **The rehearsal is a full dry run against a scratch database on the instance**, and its output is attached to the pull request | Lead | `docs/project.md` (§13.2a), `scripts/**` |
| 0b.13 | Rename `organization_id` → `household_id` on `items`, `categories`, `stores` and `household_join_links` and retype it to `uuid`; retype `created_by_id`, `updated_by_id` and `actor_id` to `uuid` referencing `auth.users(id)`; rename the wire contract's `organizationId` → `householdId` — **76 occurrences across 28 files under `src/`**, measured on `main` at `0f8dd29`. **This is one pull request, and it is exclusive**: the type-check is repository-wide, so the moment the Drizzle schema says `householdId`, every call site that still says `organizationId` is a compile error — and those call sites are spread across three ownership columns, which may not be written at the same time. A rename split by owner leaves `main` broken for the length of the merge window, and the required type-check check does not allow that. It lands **before** 0b.5, 0b.6, 0b.7 and 0b.9, which are written against the renamed contract | Database | `src/db/schema/**`, `db/migrations/**`, `db/init.sql`, `src/server/services/**`, `src/lib/**`, `src/app/api/**`, `src/app/(app)/**`, `src/app/(auth)/**`, `src/app/onboarding/**`, `src/components/**` |

**Two paths are written by two tasks in this phase**: `docs/project.md`
(0b.1 writes the specification and the runbook, 0b.12 rehearses the runbook
and corrects it) and `db/migrations/**` (0b.4 creates the tables, 0b.13
renames the columns, 0b.5 adds the RLS policies). Each path has one owner
and the tasks run in sequence, so no two tasks write the same path at the
same time (§0.1). The same rule governs task 0b.13, which is **exclusive
while it is open**: it writes every path the rename touches, in one pull
request, so the tasks that would otherwise share them wait for it.

### Deliverables

- The instance is verified: PostgreSQL version recorded, the fixture passes against
  it — 45 scenarios in 11 groups, 271 assertions — and a backup has been restored
  and read back.
- The application runs on the standard `pg` driver with one connection path.
- The schema carries `households`, `household_members`, `household_invitations`,
  and every identity and household id is a `uuid`.
- Every household-scoped table is protected by RLS, and the application connects
  as a non-owner role so the policies apply.
- Supabase Auth issues the session; the household model is three application
  tables; the active household is the `sb-household` cookie validated against
  membership.
- **No user has to reset their password** (§13.2c).
- The cutover runbook is written **and rehearsed**.

### Dependencies

Phase 0 (the baseline must be green before a platform change is measured
against it). Nothing in this phase depends on Phase 1 — but **Phase 1's task
1.4 is absorbed into tasks 0b.5 and 0b.6**, and Phase 1's tasks 1.1–1.3 are
closed by task 0b.8, so those three are dropped from Phase 1 rather than
repeated.

### Files / architectural areas affected

The auth stack (`src/lib/auth.ts`, `src/lib/request-auth.ts`,
`src/lib/auth-client.ts`, `src/app/api/auth/**`, `src/app/(auth)/**`,
`src/app/(app)/**`), the schema and its migrations (`src/db/schema/**`,
`db/migrations/**`, `db/init.sql`), row-level security and the scope helper
(`src/db/scope.ts`), the household-scoped queries and services
(`src/server/services/**`, `src/app/api/**`, `src/lib/categories.ts`), the
client components that read the session (`src/components/**`,
`src/app/onboarding/**`), the E2E harness (`e2e/auth/**`,
`e2e/household/**`), the CI configuration (`.github/workflows/**`,
`supabase/config.toml`, `scripts/**`) and this phase's own documents
(`docs/project.md`, `docs/audit-summary.md`).

### Risks

| Risk | Likelihood | Mitigation |
| --- | --- | --- |
| **The cutover loses data.** | Medium | The rollback is a configuration change for fourteen days (§13.2a step 7), because the old host is not modified during the window. The dry run (task 0b.12) compares row counts table by table before anything is switched. |
| **Existing users cannot sign in** — the scrypt/bcrypt wall (§13.2c). | High | The transitional sign-in (task 0b.10) carries the password across at first sign-in. The rehearsal must include a real migrated account, not a synthetic one. |
| **RLS silently does not apply** — the application connects as the table owner, or the claims are not set, and the policies are bypassed. | Medium | The application connects as the non-owner `app` role, and the integration test asserts a cross-household read returns **zero rows** with the application predicate deliberately removed (§9.2b). A policy that is bypassed fails that test. |
| The instance's PostgreSQL version drifts from 17.11, the version the fixture was verified against. | Medium | Task 0b.2 re-runs the fixture against the instance and records the version; CI pins the local stack's version to match (§16.5). |
| The `pg` driver's prepared statements break under a transaction-mode pooler. | Medium | Task 0b.3 decides the connection path explicitly and records it; `?pgbouncer=true` is the documented fix. |
| The 76-occurrence rename touches more than the count suggests, and a missed call site becomes a silent tenant-isolation bug. | Medium | The rename is mechanical and the lint rule from task 0b.9 forbids direct access to household-scoped tables; RLS is the backstop behind it, so a missed predicate yields zero rows rather than another household's data. |
| The identity mapping loses a household or a membership. | Medium | The mapping is done with `UPDATE … FROM map` inside the migration transaction, and the verification queries assert that every `household_id` resolves to a `households` row and every `created_by_id` to an `auth.users` row. |

### Decisions needed before this phase starts

| # | Decision | Note |
| --- | --- | --- |
| D-8 | **Does Supabase require email confirmation?** Recommendation: **no**, initially — an unconfirmed account can reach no data, because every household-scoped table is protected by RLS and a membership row is required. Turning it on later costs one click in the instance's configuration. | The instance's current setting wins if it is already configured; this decision only matters if it is not. |
| D-9 | **The rollback window's length.** Recommendation: **14 days**, which covers a realistic "the user did not notice until next week". | Longer means Better Auth stays a dependency longer. |
| D-10 | **Whether the legacy Better Auth tables are dropped, or left in place.** Recommendation: **dropped** at the end of the window — a table named `user` next to `auth.users` is a trap for the next developer. | Dropping is irreversible; the data is redundant once every account has been migrated. |
| D-11 | **What happens to the repository's root `middleware.ts`** — does it move to `src/middleware.ts`, get replaced, or get deleted? The file does not run today: the app lives under `src/` and there is no `src/middleware.ts`, so the guard that runs is the server-side one in `src/app/(app)/layout.tsx`, which redirects to `/sign-in` without a `returnTo` (`docs/project.md` §12.1b). It looks authoritative and is dead code, so the cutover has to say what it is for. | Blocks task 0b.7 and the cutover (§13.2). The product decision is recorded as backlog item B1-T01. |

### Verification approach

- The fixture is green against the instance: 45 scenarios in 11 groups, 271
  assertions.
- The RLS cross-household test returns **zero rows** (§9.2b).
- The migration rehearsal runs against a scratch database on the instance.
- `pnpm typecheck && pnpm lint && pnpm test && pnpm build` pass.

### Definition of done

- The backup is restored and read back.
- The fixture is green against the instance.
- RLS is proven: the cross-household read returns **zero rows**.
- The runbook is rehearsed against a scratch database.

---

## Phase 1 — Security & Data-Integrity Repairs

### Objective

Close the verified security defects and the data-integrity defects **on the
current architecture**, before the rebuild lands. These are cheap to fix now and
would otherwise be carried into the new system as latent risk. This phase also
builds the authorization helper that Phase 3 reuses.

### Scope

| # | Task | Owner | Files |
| --- | --- | --- | --- |
| 1.1 | ~~Add `requireHouseholdRole(orgId, userId, roles)` and enforce it on every household-scoped route~~ — **absorbed into Phase 0b, task 0b.8**, which builds it against the new household tables and closes S-1, S-2, S-3 and S-4 in the same pass | Backend | — |
| 1.2 | ~~Make authorization failures return **403** with a stable error code~~ — **absorbed into Phase 0b, task 0b.8**: the raw Better Auth message no longer exists once Better Auth does | Backend | — |
| 1.3 | ~~Remove or authenticate `GET /api/invitation-email`~~ — **absorbed into Phase 0b, task 0b.8** (closes S-4) | Backend | — |
| 1.4 | ~~Introduce a shared household-scope helper that is the **only** sanctioned access path to the household-scoped tables, plus a lint rule forbidding direct access to those tables outside it — `db.select()`, `db.insert()`, `db.update()`, `db.delete()` and `db.execute()` alike. A rule that covered only `db.select()` would leave the write paths unguarded~~ — **absorbed into Phase 0b, tasks 0b.5, 0b.6 and 0b.9**, which build the same helper with row-level security behind it (closes S-5 at the database as well as the application). The lint rule's protected-table list must still be derived from the Drizzle schema, not hardcoded, or the new tables escape it silently | Backend | — |
| 1.5 | Fix the quantity input: accept free-form text end to end (closes B-6) | Frontend | `src/lib/utils.ts`, `src/app/(app)/dashboard/_components/QuickAddBar.tsx`, `src/app/(app)/dashboard/_components/ItemDialogs.tsx` |
| 1.6 | Separate *delete* (tombstone) from *clear completed* (archive) in the **schema and migration**: add `deleted_at`, stop relying on `is_active`, backfill `is_active = false` rows as tombstones (closes B-11) | Database | `src/db/schema/items.ts`, `db/migrations/**` |
| 1.6b | Carry the same separation through the **service and route layer**: `deleteItem` writes a tombstone, "clear completed" writes an archive mark, and both are recoverable from History (closes B-11) | Backend | `src/server/services/items.ts`, `src/app/api/items/**` |
| 1.7 | Make the item-store replacement atomic using `db.transaction()` (closes B-13); make the bulk "clear completed" skip items changed since the request began (closes B-12) | Backend | `src/server/services/items.ts` |
| 1.8 | ~~Replace the optimistic-update rollback with a per-item update that cannot clobber a concurrent edit (closes B-14, B-15)~~ — **superseded by Phase 4, task 4.4**, which rewrites `ShoppingList.tsx` and `ItemRow.tsx` wholesale. Do not implement this here; Phase 4's replacement covers it | Frontend | — |
| 1.9 | Add integration tests against a **real PostgreSQL** that assert the tenant-isolation predicates, the authorization matrix, and the idempotency of a repeated create | Backend | `src/server/services/__tests__/**`, `src/test/**` |
| 1.10 | ~~Replace `window.confirm` with the existing `AlertDialog` component (AC-30)~~ — **superseded by Phase 4, task 4.4**, which rewrites `ShoppingList.tsx` wholesale. Do not implement this here | Frontend | — |

> Tasks 1.6 and 1.7 both touch `src/server/services/items.ts`. They are executed
> **sequentially by the same owner**, not concurrently.

### Deliverables

- The join-link endpoint returns 403 for a plain member.
- Every authorization failure returns 403 with a stable error code.
- `quantity` accepts `2.5 kg` and stores it verbatim.
- Deleting an item is recoverable and distinguishable from clearing it.
- Store-tag replacement is atomic.
- A real-database integration suite exists and runs in CI.

### Dependencies

Phase 0 (CI must exist for the new tests to be gated).

### Files / architectural areas affected

`src/server/**`, `src/app/api/**`, `src/db/**`, the dashboard components, and the
new integration test suite.

### Risks

| Risk | Likelihood | Mitigation |
| --- | --- | --- |
| The scope helper is bypassed by a direct query, leaking across households | Medium | The helper is the only sanctioned path; a lint rule fails the build on a direct household-table query; an integration test against a real database asserts a cross-household read, update, and delete all return 404. **RLS was rejected as unreliable on the HTTP driver of the previous host (ADR-12) — that blocker no longer exists**, and Phase 0b puts RLS behind the helper as a second layer, so a bypassed predicate yields zero rows rather than another household's data (§9.2b). |
| The tombstone change affects the History page, which currently relies on `archived_at` semantics | Medium | Task 1.6 updates the History query in the same PR and adds an explicit test for both behaviours. |
| The real-database integration suite is slow in CI | Low | Use the Supabase local stack and run the suite against a schema applied once per job, not per test. |
| The quantity change lets arbitrary text through, weakening the schema | Low | The column is already `text`; validation is length-bounded (≤ 50 chars), not format-bounded. |

### Verification approach

```
pnpm test:integration       # real PostgreSQL
pnpm test                   # unit
pnpm test:e2e
```

Plus explicit probes (the same ones used in the assessment):

- Plain member → `POST /api/households/join-links` → **403**.
- Plain member → `POST /api/households/invite` → **403** (not 500).
- Unauthenticated → `GET /api/invitation-email` → **401** or 404.
- Household B → `PATCH /api/items/{A's item}` → **404**, A's row unchanged.
- Type `2.5 kg` into Quantity → the server stores `2.5 kg`.

### Definition of done

- Every S-1 … S-7 and B-6, B-11 … B-13 finding is closed and covered by a test.
- **B-14 and B-15 are closed in Phase 4, task 4.4**, not here — they are the
  optimistic-update rollback and the premature toast, and Phase 4 replaces the
  whole path rather than patching it. They are therefore *not* part of this
  phase's gate.
- The integration suite runs in CI against a real database and passes.
- The quantity probe stores the string verbatim.
- The Lead confirms the authorization matrix by direct probe.

---

## Phase 2 — Architecture Contracts

### Objective

Resolve the remaining architectural uncertainty **before** parallel
implementation begins, and freeze the interface contracts that Phases 3, 4, 5,
and 6 will all build against. This phase writes no production application code
beyond the contract types themselves.

### Scope

| # | Task | Owner | Files |
| --- | --- | --- | --- |
| 2.1 | Write the ADR set from `docs/project.md` §18 into the repository, recording the decisions, the rejected alternatives, and the consequences | Lead | `ARCHITECTURE/0001…0017-*.md` |
| 2.2 | Define the shared contract types: `SyncOperation`, `SyncRequest`, `SyncResponse`, `SyncChange`, `Conflict`, `LocalItem`, `OutboxOp`, error codes, and **`SyncOperationType` — the single authoritative operation-type union** (§10.1a). The local outbox must use these same namespaced values; a second, shorter local union is what let the vocabulary drift apart in the first place | Lead | `src/shared/sync.ts` |
| 2.3 | Define the local IndexedDB schema and the Dexie version/migration plan | Frontend | `src/client/db/schema.ts` (design only) |
| 2.4 | Verify the apply design on the **production driver** (ADR-14). By this phase the driver is the standard `pg` driver, so the questions are: (a) `db.transaction()` gives an all-or-nothing multi-statement write; (b) the **compare-and-swap** form (`UPDATE … WHERE id = ? AND version = ?`) correctly detects a concurrent modification — a transaction callback executes pre-built statements, so the read that conflict resolution depends on cannot sit inside it; (c) the **data-modifying CTE** form makes the change-log insert conditional on the compare-and-swap having matched; (d) a per-household `pg_advisory_xact_lock` as the first statement makes `seq` allocation order equal commit order (ADR-05), proven by two concurrent applies whose commits would otherwise invert. **Much of this is already proven** — §10.8's 45 scenarios in 11 groups are executed against the §9 DDL and their outcomes verified — so this task confirms the same behaviour on the *production* instance rather than rediscovering it | Database | `src/db/**` (scratch), ADR-14 |
| 2.5 | Verify the conflict-resolution matrix as a **pure function** before it is wired to the server, with a table-driven test covering every row of `docs/project.md` §11 | Backend | `src/server/sync/conflict-resolution.ts`, `src/server/sync/__tests__/conflict-resolution.test.ts` |
| 2.6 | Prove the client-side generation of UUIDv7 ids and the Lamport clock implementation | Frontend | `src/client/db/ids.ts` (design only) |

### Deliverables

- The ADR set from `docs/project.md` §18, including ADR-16 (hosting) and ADR-17 (authentication).
- `src/shared/sync.ts` — the frozen contract types.
- A table-driven test proving the conflict-resolution matrix behaves as specified.
- A working proof that the server can apply an operation atomically on the
  production driver.

### Dependencies

Phase 1. The conflict-resolution prototype must not contradict the authorization
model established there.

### Files / architectural areas affected

`ARCHITECTURE/**` and `src/shared/**` (Lead). Two scratch areas for the
prototypes, which are **merged into their owning phases** rather than left
dangling.

### Risks

| Risk | Likelihood | Mitigation |
| --- | --- | --- |
| The contract types are too rigid and Phases 3–5 need to change them, causing churn | Medium | The spike deliberately exercises the *awkward* cases — conflict records, bulk archive, tombstones, resync — before freezing. |
| The apply transaction is not sufficient for the apply path | Low | Task 2.4 proves it on the production driver. The interactive-transaction fallback that ADR-14 used to reserve for the HTTP driver is no longer a contingency — the standard `pg` driver *is* the interactive path (ADR-16). |
| The conflict matrix proves wrong when implemented | Medium | That is the purpose of the spike. A wrong rule found in Phase 2 costs days; the same rule found in Phase 5 costs weeks. |

### Verification approach

```
pnpm test -- src/server/sync/__tests__/conflict-resolution.test.ts
```

plus a script that applies an operation + change-log entry + idempotency record
against the development database and proves that an induced failure leaves
**zero** partial writes.

### Definition of done

- Every ADR is reviewed and accepted.
- `src/shared/sync.ts` is merged and marked frozen; a comment states that
  changes require a Lead-approved ADR amendment.
- The conflict-resolution table-driven test passes for every row of §11.
- The atomicity proof is green on the production driver configuration.

> **Gate:** Phases 3 and 4 may not begin until this phase is complete.

---

## Phase 3 — Server Sync Core

### Objective

Build the server half of the sync protocol: the change log, the idempotency
ledger, the apply logic with conflict resolution, and the `/api/sync` endpoint —
proven against a real PostgreSQL.

### Scope

| # | Task | Owner | Files |
| --- | --- | --- | --- |
| 3.0 | **De-duplicate the `item_stores` rows before the primary key is added.** The table has no primary key today, so a legacy database may hold duplicate tag rows; adding `PRIMARY KEY (item_id, store_id)` over them **fails and blocks the migration**. The de-duplication must be deterministic — keep the lowest `ctid` per `(item_id, store_id)` — and the legacy migration test must seed duplicate tags and assert the migration applies and the surviving row is the expected one | Database | `db/migrations/**`, `src/db/__tests__/migrations.test.ts` |
| 3.1 | Additive migrations: `items.deleted_at`, `items.version`, `items.field_meta`, `items.updated_by`, `items.lamport`, `items.last_op_id`; the same set plus `deleted_at` for `stores` and `categories`; version the `item_stores` rows — add `PRIMARY KEY (item_id, store_id)` (the table has **no primary key today**, so duplicate tag rows are possible), plus `version`, `lamport`, `device_id`, and **`deleted_at`** — the *pair tombstone*, without which a removal's ordering key is lost and a long-offline device can resurrect a removed tag (§9.1, §10.8.3); create `household_sync_state`; the `is_active → deleted_at` backfill as a separate migration | Database | `src/db/schema/**`, `db/migrations/**` |
| 3.2 | Create the `sync_changes`, `sync_operations`, `devices`, and `entity_conflicts` tables with their indexes | Database | `db/migrations/**` |
| 3.3 | Implement the apply engine (ADR-14): deduplicate on `opId`; resolve the conflict per §11; then apply the request in **one HTTP request and one transaction** — the advisory lock (`pg_advisory_xact_lock(hashtextextended($household_id::text, 0))`) followed by one statement per operation, each a data-modifying CTE that performs the compare-and-swap and inserts the change-log row **only if the update matched**, plus the idempotency record. No statement in the batch may raise: validation, authorization, and duplicate-name checks run before it, a failed compare-and-swap updates zero rows, the ledger insert uses `ON CONFLICT (op_id) DO NOTHING` so it cannot raise on a replay or on a bulk operation's shared `opId`, and creates use `ON CONFLICT DO NOTHING` — so one duplicate name cannot abort its neighbours. **A zero-row compare-and-swap is not an abort and must not leave a partial record**: an `UPDATE` that matches zero rows does not fail the transaction, so the change-log insert and the ledger write are both gated on the update having matched — the change-log insert selects `FROM applied`, and the request writes no ledger row for an operation the compare-and-swap lost (§10.8.4). **Implement §10.8's three statements as written** — the item-row statement (§10.8.1), the create statement (§10.8.2) and the ledger statement (§10.8.3). They are the normative form and have been executed against PostgreSQL 17 (§10.8); they are not a sketch to be re-derived. Three details are load-bearing and easy to get wrong: the `$op_base_version` / `$cas_version` split (§10.8), the quoted `"storeId"` alias in `jsonb_to_recordset` (§10.8.3), and the `flags.row_changed` gate that lets an operation win nothing, write no change-log row, and **still** be acknowledged in the idempotency ledger | Backend | `src/server/sync/apply.ts` |
| 3.3b | **Route the legacy REST writes through the same apply engine.** The legacy item endpoints stay reachable during the transition (§13.2), and a write that commits without a `sync_changes` row leaves the change log incomplete — the log is the source of truth (INV-12), so a client that pulls from it never learns of that edit. The shared functions in `src/server/services/items.ts` that the legacy routes call must increment the row's `version`, stamp its `field_meta` and `lamport`, and append the `sync_changes` row **in the same transaction**. A legacy write that does none of those leaves the compare-and-swap unable to detect it, so a concurrent sync operation would overwrite it from stale state | Backend | `src/server/services/items.ts`, `src/app/api/items/**` |
| 3.3c | Implement the **same-request dependency contract**: an operation that targets an entity created earlier in the same request resolves against it, because the batch's statements run in order on one connection in one transaction (§10.8.4). An operation whose target does not exist — because the create was rejected — is rejected with `ENTITY_NOT_FOUND` and surfaced, not silently dropped. The client must not reorder its outbox | Backend | `src/server/sync/apply.ts` |
| 3.4 | Implement `POST /api/sync` per the frozen contract: push + pull in one round trip, batched, with `fullResyncRequired` detection | Backend | `src/app/api/sync/route.ts`, `src/server/sync/**` |
| 3.5 | Implement the incremental pull query and the full-snapshot path; prune **only** the change log (90 days). Tombstoned item rows are never hard-deleted, and a full resync discards the client's local tombstones because the snapshot is authoritative (FR-31, §9.3) | Backend + Database | `src/server/sync/pull.ts`, `src/db/**` |
| 3.6 | Enforce the authorization matrix on `/api/sync` and on every entity it touches | Backend | `src/app/api/sync/route.ts` |
| 3.7 | Server-side integration tests: idempotency (repeat an op 10×), conflict resolution per §11, cross-household rejection, atomicity under induced failure, resync detection; **the 45 scenarios in 11 groups of `docs/project.md` §16.4 replayed against the implementation**; **a bulk operation sharing one `opId` across two items** (two change-log rows, one ledger row, no abort); **a replay of an operation that won nothing** (no raise, no second conflict row); **a create-then-edit and a create-then-delete in one request**; and **a legacy REST write racing a sync operation on the same entity** | Backend | `src/server/sync/__tests__/**`, `src/app/api/sync/route.test.ts` |
| 3.8 | Migration tests: apply to an empty DB; apply to a DB seeded with legacy rows; assert legacy content is unchanged and `is_active = false` rows became tombstones | Database | `src/db/__tests__/migrations.test.ts` |

### Deliverables

- `POST /api/sync` implements the frozen contract.
- An operation applied 10 times changes the row once.
- Every conflict rule from §11 behaves as specified against a real database.
- An induced failure mid-apply leaves zero partial writes.
- Legacy data survives the migration unchanged.

### Dependencies

Phase 2 (frozen contracts, proven atomicity approach).

### Files / architectural areas affected

`src/db/**`, `src/server/sync/**`, `src/app/api/sync/**`.

### Risks

| Risk | Likelihood | Mitigation |
| --- | --- | --- |
| The apply engine's read-modify-write is not atomic under concurrency | Medium | Per ADR-14, the entity write is a **compare-and-swap** — `UPDATE … WHERE id = ? AND version = ?` — inside a data-modifying CTE. Zero rows updated means another device won the race, so the operation is retried against fresh state and the CTE leaves no orphan change-log entry. |
| `sync_changes.seq` is allocated in one order and committed in the opposite, so a pulling client skips a change forever | Medium | Per ADR-05, the apply path takes a **per-household** `pg_advisory_xact_lock` as the first statement of the batch, which makes allocation order equal commit order. The granularity is **per household**, not per entity: the `seq` order is per household, so a per-entity lock would not prevent the inversion. The lock is transaction-scoped, so it is released automatically at commit and needs no cleanup path. |
| `field_meta` grows unbounded | Low | Only one entry per mutable field per entity; bounded by the field count. |
| The change log grows large | Medium | Pruning by age (Phase 3.5) plus an index on `(household_id, seq)`. |
| Legacy `is_active` rows are double-counted during the transition | Low | The backfill is a separate migration, and the active-list query filters on `deleted_at IS NULL` only after the backfill lands. |

### Verification approach

```
pnpm test:integration -- src/server/sync
pnpm test:integration -- src/db/__tests__/migrations.test.ts
```

plus explicit probes:

- Submit the same `opId` 10 times → the row changed once, and responses 2–10
  carry `duplicate: true` with an identical `result`.
- Two concurrent updates to different fields of one item → both applied.
- Two concurrent updates to the same field → the §11 rule applied, and a
  conflict record exists.
- An induced failure between the entity write and the change-log write → the
  entity write is rolled back.
- **The 45 scenarios in 11 groups §10.8's statements were verified against,
  replayed against the implementation.** They are the fixture, not a summary: a
  normal update, a field lost to a concurrent write, a check that loses by
  check-wins, a write to a tombstoned row, an undelete that is too old, a lost
  compare-and-swap, **both arrival orders of an archive racing an uncheck and
  the assertion that they converge**, nine store-tag outcomes, a bulk
  operation sharing one `opId`, a replay of an operation that won nothing, a
  replay of an applied operation, the outcome vocabulary, and a create with
  tags. An implementation that reaches a different outcome fails here.

### Definition of done

- `/api/sync` passes the contract test suite against a real database.
- Every §11 matrix row has a server-side test.
- Migrations apply cleanly to empty and legacy databases, with legacy content
  proven unchanged.
- The Lead confirms the endpoint's behaviour by direct probe.

---

## Phase 4 — Client Local-First Core

### Objective

Make the client the owner of the shopping data: a persistent IndexedDB, a
repository that writes locally and enqueues an operation atomically, and a
dashboard that renders from the local store. **No component may call the
network for domain data** (INV-01, INV-05, INV-06).

### Scope

| # | Task | Owner | Files |
| --- | --- | --- | --- |
| 4.1 | Add the Dexie local database: schema, versioned migrations, a `meta` store (local schema version, app version, cached identity, device id), and a `households` store holding the signed-in user's household list (`id`, `name`). The household list is what makes offline household switching possible and must exist from Phase 4, not Phase 6. **The `households` and `identity` records are keyed by *account* as well as by household** (§12.3): local data belongs to the account that created it, and a different account signing in on the same browser must not be able to read it. **Add `dexie` and `dexie-react-hooks` to `package.json`** — Frontend owns this task's `package.json` change | Frontend | `src/client/db/**`, `package.json` |
| 4.2 | Implement the repository layer: local CRUD that writes the record **and** enqueues the operation in one IndexedDB transaction (INV-03). Catch and **propagate** `QuotaExceededError` at this boundary — Phase 4 must not swallow it, or Phase 6's banner has nothing to hook | Frontend | `src/client/db/repository.ts` |
| 4.3 | Implement the outbox: operation creation, the Lamport clock, `baseVersion` capture, and the `pending / inflight / failed / blocked` state machine | Frontend | `src/client/db/outbox.ts`, `src/client/sync/clock.ts` |
| 4.4 | Implement `useLiveQuery`-based reactive reads; convert `ShoppingList`, `ItemRow`, `ItemDialogs`, `QuickAddBar`, `HistoryList` to read from the local store. Implement the three distinct empty states — *empty* / *not downloaded on this device* / *couldn't load, retry* (§6.4 (empty states)). **Three carry-over defects must be fixed in this rewrite, not in Phase 1:** (a) the `ItemRow` memo comparator (`ItemRow.tsx:132-145`) compares a fixed prop list, so the new `pending`/`pendingFields`/`version` fields would never trigger a re-render and a pending badge would go stale — compare them, or drop the hand-rolled comparator; (b) `ItemDialogs.handleSave` (`ItemDialogs.tsx:83-103`) diffs against the props snapshot the dialog opened with, so a remote change made while it is open is written back on save — diff against the version the dialog opened with, or rebase on the live row; (c) the per-item optimistic rollback (B-14) and the premature `Item removed` toast (B-15) — the whole path is replaced by the local-first repository, so there is nothing to roll back | Frontend | `src/app/(app)/dashboard/_components/**`, `src/app/(app)/history/_components/**` |
| 4.5 | Convert the dashboard and history routes to **static shells**: remove the server-side session fetch from the layout **and** from `dashboard/page.tsx` and `history/page.tsx` (each currently calls `getRequestSession()` and redirects), add a client-side auth gate — which **blocks rendering a household's cached data to a different account** (§12.3): signing in as another account clears the retained local data, or requires explicit confirmation before it renders; never silently — stop passing `userName` in from the server session (`AppHeader.tsx` takes it as a prop today), stop pre-formatting history labels on the server, and keep server-side authorization on every API | Frontend | `src/app/(app)/layout.tsx`, `src/app/(app)/dashboard/page.tsx`, `src/app/(app)/history/page.tsx`, `src/components/AppHeader.tsx` |
| 4.6 | Implement the bootstrap path: **when the device holds no cached data for the active household** — on first load, or after switching to a household that is not yet downloaded — pull that household's full snapshot and write it to IndexedDB before the first list render, distinguishing *not downloaded* from *bootstrap failed* (§6.4 (empty states), §12.4). The condition is per household, not "the database is empty": after one household is cached the database is not empty, and a switch to an uncached household must still bootstrap it | Frontend | `src/client/sync/bootstrap.ts` |
| 4.7 | Add the static lint rules that enforce INV-01 / INV-05 / INV-06 (no `fetch` in components; domain reads only via the repository) | Frontend | `eslint.config.mjs` |
| 4.8 | Component tests with `fake-indexeddb`: a write commits locally with the network blocked; the write and the outbox entry land together; a failed transaction leaves neither. **Add `fake-indexeddb` to Vitest's `setupFiles`** in `vitest.config.ts` — Frontend owns this task's `vitest.config.ts` change | Frontend | `src/client/**/__tests__/**`, `vitest.config.ts` |
| 4.9 | Build the **basic** sync status chip — `Up to date`, `N changes pending`, `Offline`, `Offline · N changes pending`, `Sign in to sync · N pending` — reading from the local outbox, never from the network. It must not read `Up to date` before IndexedDB has been read (§6.4 (chip readiness)). The states that depend on the sync engine land in Phase 6 (task 6.3) | Frontend | `src/components/**`, `src/app/(app)/dashboard/_components/**` |

### Deliverables

- The dashboard renders from IndexedDB.
- Add / edit / check / delete work with the network blocked and are visible
  immediately.
- The basic sync status chip is present and truthful (the states that need the
  sync engine arrive in Phase 6).
- **An offline reload is verified in Phase 6**, after the navigation fallback
  (task 6.2) is added. The service worker today serves only cached `GET`
  requests under `/_next/static/`, and no Phase 4 task changes `public/sw.js`,
  so an offline reload cannot work before the navigation handler exists.
- The outbox holds every unacknowledged operation, durably.
- The lint rules fail the build if a component reintroduces a network call for
  domain data.

### Dependencies

Phase 2 (frozen contract types). Phase 3 is **not** a blocker — Phase 4 works
against a **specified, versioned mock** of `/api/sync` provided by the contract
types. The real integration dependency is recorded and wired in Phase 5.

**Phase 4 must not be deployed on its own.** The moment domain writes move
into IndexedDB, the device writes locally and the outbox is the only path to
the server — so until Phase 5 wires the outbox to the real `/api/sync`, edits
cannot reach other devices at all. Two things follow:

1. The client cutover is **gated on Phase 5**. Phase 4's increment is merged
   and developed behind the mock, but it is not deployed until the real sync
   engine is in place.
2. The **legacy server write path stays active** through Phase 4, so a write
   still reaches the server through the old route if the outbox is not yet
   draining. Phase 3's task 3.3b is what keeps that path on the change log.

### Files / architectural areas affected

`src/client/**` (new), `src/app/(app)/**` (components and pages),
`src/components/**`, `eslint.config.mjs`.

### Risks

| Risk | Likelihood | Mitigation |
| --- | --- | --- |
| Removing the server-side session check from the layout exposes the shell to unauthenticated users | Medium | The shell contains **no user data** (verified by Phase 6's cache-content test). All data flows through authenticated APIs. The client gate redirects within one tick. |
| The SSR → client-render switch regresses LCP | Medium | The Lighthouse harness measures it in Phase 7. The documented fallback (server-rendering the first screenful as a bootstrap payload) is in `docs/project.md` §15.2. |
| Hydration mismatches or flashes | Medium | The local DB is read in an effect after mount; the SSR output is a stable skeleton. Existing tests must be updated, not deleted. |
| The Dexie migration drops pending operations | Low | INV-11 test; the migration hook explicitly preserves the outbox. |
| Concurrent tasks on `src/app/(app)/**` conflict with other phases | Low | This phase owns the dashboard components exclusively for its duration. |

### Verification approach

```
pnpm test -- src/client
pnpm test -- "src/app/(app)"
```

plus a component test that stubs `fetch` to reject, performs every mutation, and
asserts both the rendered result and the outbox contents. Plus an ESLint run
that proves the new rules reject a deliberately added `fetch` call.

### Definition of done

- With the network blocked, all four mutations work and persist.
- The outbox is non-empty and correct after each mutation.
- `pnpm lint` fails on a deliberately introduced `fetch` in a component.
- The Lead confirms the dashboard renders identically with and without a network.

---

## Phase 5 — Sync Engine & Convergence

### Objective

Connect the client outbox to the server. The engine pushes queued operations,
pulls changes, applies them to the local store, records conflicts, and makes
two devices converge.

### Scope

| # | Task | Owner | Files |
| --- | --- | --- | --- |
| 5.1 | Implement the sync engine as a plain TypeScript class (not React state): debounced push, pull, retry with exponential backoff and jitter, and the `pending → inflight → acknowledged / failed / blocked` state machine | Frontend | `src/client/sync/engine.ts` |
| 5.2 | Implement the triggers: after a local mutation (2 s debounce), on the `online` event, on `visibilitychange`, and on app start — **plus a 30 s timer that runs while the app is visible and the household is active, whether or not the outbox is empty**. The push is conditional on pending work; the **pull is not**. A timer that only runs while there is pending work leaves an idle open device permanently stale: another member's edit arrives only when some unrelated event fires | Frontend | `src/client/sync/triggers.ts` |
| 5.3 | Implement the change-application rules: tombstones are applied as tombstones (INV-07); a pending local field is **not** overwritten by an incoming change to the same field; a change to a different field is applied immediately | Frontend | `src/client/sync/apply-changes.ts` |
| 5.4 | Implement the conflict store and the "Needs attention" surface: the three card types defined in `docs/project.md` §11.2 — **field conflict** (both values, the winning device, and "Keep mine" / "Use theirs" / "Dismiss"), **deleted elsewhere** ("Undo my edit" / "Dismiss"), and **server rejection** (the reason, and "Choose another" / "Discard"). Only the field-conflict card has a "Keep mine", and it sends an override operation. This task also owns the **`N need attention` chip state** that opens the panel (§6.1) — the panel's only entry point — so the panel is reachable as soon as it exists; Phase 6's task 6.3 completes the *other* chip states. The panel is opened from the status chip's `N need attention` state | Frontend | `src/client/db/conflicts.ts`, `src/app/(app)/**/_components/**` |
| 5.5 | Wire the real `/api/sync` endpoint into the engine, replacing the Phase 4 mock | Frontend | `src/client/sync/**` |
| 5.6 | Implement the full-resync path: detect `fullResyncRequired`, rebuild the local tables, and **replay the outbox afterwards** | Frontend | `src/client/sync/resync.ts` |
| 5.7 | Implement the per-household partitioning of the outbox, the local cache, and the tombstones (INV-09) | Frontend | `src/client/db/**` |
| 5.8 | End-to-end convergence tests against the real server and a real database: two local stores, one household, conflicting edits, asserting convergence per §11 | Frontend + Backend | `src/client/sync/__tests__/**`, `src/server/sync/__tests__/**` |

### Deliverables

- A local edit reaches the server automatically when connectivity returns.
- Two devices converge to the documented resolution.
- A conflict is surfaced to the user with both values.
- A duplicate submission is applied once.
- An interrupted sync leaves the outbox intact and retries cleanly.

### Dependencies

Phase 3 (the real endpoint) and Phase 4 (the local store). Phase 5 is the
integration point of the two.

### Files / architectural areas affected

`src/client/sync/**`, `src/client/db/**`, and the conflict UI components.

### Risks

| Risk | Likelihood | Mitigation |
| --- | --- | --- |
| The engine pushes and the server pulls at the same time, producing a lost update | Medium | The pull is applied **after** the push within a cycle, and the change-application rules preserve pending local fields. Tested by the convergence suite. |
| Retry storms against the server | Low | Exponential backoff with jitter, and a 30 s floor. |
| An infinite loop: apply changes → mark pending → push again | Medium | The change-application rules must not mark a record pending when the change came from the server. Explicit test required. |
| Conflicts accumulate without resolution | Medium | The status chip shows the count; the conflict list is reachable in one tap. |

### Verification approach

```
pnpm test -- src/client/sync
pnpm test:integration -- src/server/sync
```

plus the two-device convergence scenario described in §16.4 of
`docs/project.md`, run as a script against the real server.

### Definition of done

- Two clients with conflicting offline edits converge to the §11 resolution.
- No field is silently discarded: every losing value is retrievable in the
  conflict list.
- An op submitted twice is applied once, proven against a real database.
- The Lead confirms convergence by running the two-device demonstration.

---

## Phase 6 — Offline UX, PWA & Household Scenarios

### Objective

Deliver the experience the product owner actually asked for: the app works in a
store with no signal, is installable, and handles the awkward household
situations without losing data.

### Scope

| # | Task | Owner | Files |
| --- | --- | --- | --- |
| 6.1 | Write `public/manifest.webmanifest` with the required fields and icons (180 px, 512 px, maskable), add `apple-touch-icon`, and the iOS meta tags | Frontend | `public/**`, `src/app/layout.tsx` |
| 6.2 | Rewrite the service worker: precache the static shell, cache hashed assets, **network-first with a cached fallback for navigations**, never cache API responses, and add an update flow (`skipWaiting` + a "new version available — reload" prompt rather than a silent reload that could interrupt an edit) | Frontend | `public/sw.js`, `src/app/providers.tsx` |
| 6.3 | Complete the sync status chip with the states that only exist once the sync engine is running (`Syncing…`, `Sync failed — Retry`, `Can't save changes`), and implement its collapsed icon-plus-count form below 400 px. The chip's basic states land in Phase 4 (task 4.9) | Frontend | `src/components/**`, `src/app/(app)/dashboard/_components/**` |
| 6.4 | Implement the sign-out protection dialog (FR-29, scenario 11) with the three options: **sync first / keep a copy / discard**. "Keep a copy" writes the pending operations to a **JSON file the user downloads** — the local database is **cleared** either way, because a retained database is readable by whoever signs in next (§12.3, SEC-07). The export is inert: the app never reads it back | Frontend | `src/app/(app)/**`, `src/client/**` |
| 6.5 | Implement offline household switching (scenario 12): switch instantly to a cached household; show an explicit "not downloaded on this device" state for an uncached one | Frontend | `src/components/household-switcher.tsx`, `src/client/**` |
| 6.6 | Handle session expiry while offline (scenario 13): keep the app fully usable, show `Sign in to sync`, never destroy local data | Frontend | `src/client/**`, `src/app/(app)/**` |
| 6.7 | Handle storage unavailability and quota exhaustion (scenario 15): a clear blocking banner, an export path, and never a silent loss | Frontend | `src/client/db/**` |
| 6.8 | Mobile pass: 44 px touch targets, safe-area insets, the quick-add bar reflowed for a 375 px viewport, `viewport-fit=cover` | Frontend | `src/app/(app)/dashboard/_components/**`, `src/app/globals.css` |
| 6.9 | Add the offline Playwright scenarios: offline cold start, offline reload, offline mutations, offline restart, session expiry, sign-out with pending work, household switch offline | Frontend | `e2e/offline/**` |
| 6.12 | Extend the offline Playwright suite to cover **all eighteen scenarios** in `docs/project.md` §5 — SC-01 to SC-18 — each mapped to a named test. This task **builds the two-device harness** (two browser contexts against one household) and writes the five scenarios that need it (SC-03, SC-04, SC-05, SC-06, SC-18); the other thirteen are single-device and may already exist. The harness lands **here**, in the phase that owns `e2e/offline/**`, so Phase 6's gate can close on it | Frontend | `e2e/offline/**` |
| 6.10 | Add the "manage your devices" surface (household settings) listing known devices and their last-seen time | Frontend + Backend | `src/app/(app)/household/settings/**`, `src/app/api/households/**` |
| 6.11 | Implement the in-aisle interaction model (`docs/project.md` §6.3): a checked item **stays in place**, dimmed, and never leaves its category group; the bottom "Completed (N)" becomes a collapsed **summary** with an "Archive checked items" action and a count confirmation; and the 5-second inline **undo** strip for add / check / uncheck / delete / archive — where undo is itself an outbox operation (`item.undelete`, `item.unarchive`, `item.bulkArchive`), never a UI-only trick | Frontend | `src/app/(app)/dashboard/_components/**`, `src/client/db/outbox.ts` |

### Deliverables

- The app is installable on iOS and Android.
- With the network disabled **and the local database and service-worker cache
  already populated**, a cold start renders the household's list.
- Every scenario in `docs/project.md` §5's scenario list (1–18) has a **defined
  behaviour** and an **automated test**. The five multi-device scenarios
  (SC-03, SC-04, SC-05, SC-06, SC-18) are automated here too: task 6.12
  **builds the two-device harness** in the phase that owns `e2e/offline/**`.
  Phase 7's task 7.2 *runs* the suite in CI — it does not write it, because two
  tasks editing one path would break the ownership rule.
- The status chip is always truthful.
- A checked item stays in place, and undo works offline for every reversible
  action.
- Touch targets and layout pass an automated audit.

### Dependencies

Phases 4 and 5 (the local store and the sync engine must exist).

### Files / architectural areas affected

`public/**`, `src/app/**` (components), `src/components/**`, `src/client/**`,
`e2e/offline/**`.

### Risks

| Risk | Likelihood | Mitigation |
| --- | --- | --- |
| The service worker serves a stale shell after a deployment | Medium | The update prompt plus a versioned cache name and a delete-on-activate sweep of old caches. |
| The service worker caches an authenticated response | Low | The SW's fetch handler explicitly excludes `/api/`. Asserted by a test that inspects the cache contents (AC-19). |
| iOS Safari evicts the IndexedDB database under storage pressure | Low | Prompt on `versionchange`; export path; the server holds the authoritative copy. |
| A background-tab sync is killed by the browser | High (by design) | Sync is foreground-driven; durability comes from IndexedDB, not from a background task (ADR-10). |
| The 18 scenarios are treated as a checklist rather than tests | Medium | Each scenario maps to a named Playwright test in `e2e/offline/**`. |

### Verification approach

```
pnpm test:e2e -- e2e/offline
```

plus the manual scenario walkthrough from `docs/project.md` §5, run on an iPhone
13 device profile in WebKit, and on a real iOS device if available.

### Definition of done

- Every scenario 1–18 in `docs/project.md` has a passing automated test or a
  documented manual verification with an owner and a date.
- The manifest is valid and the app is installable in Chromium (the install
  prompt appears) and the iOS home-screen path works in WebKit.
- The Lighthouse PWA category is satisfied.
- The status chip is truthful in every state the automated tests can produce.

---

## Phase 7 — Hardening & Release Readiness

### Objective

Prove the system works, prove the data is safe, and produce a release the
product owner can approve with confidence.

### Scope

| # | Task | Owner | Files |
| --- | --- | --- | --- |
| 7.1 | Write `scripts/verify-offline-sync.mjs` — the repeatable two-device, conflicting-offline-edits demonstration (`docs/project.md` §16.4) | Backend | `scripts/**` |
| 7.2 | **Run** the offline Playwright suite written in Phase 6 — scenarios 1–18, including the five two-device scenarios — in CI, and fix anything the full run exposes. This task does not *write* the suite: Phase 6's task 6.12 owns `e2e/offline/**`, and giving both phases the same files would mean two tasks editing one path | Frontend | `.github/workflows/ci.yml` |
| 7.3 | Write the migration rehearsal: apply the migrations to a database seeded with a realistic legacy snapshot and prove that the first sync reproduces the user's list exactly | Database | `scripts/**`, `src/db/__tests__/**` |
| 7.4 | Run the Lighthouse harness against the new client; confirm score ≥ 90 and LCP ≤ 2500 ms; if the SSR removal regressed it, implement the documented first-screenful fallback | Frontend | `scripts/verify-perf-07.mjs`, `src/app/(app)/dashboard/**` |
| 7.5 | Add the observability the sync engine needs: structured sync logs (device, op count, duration, outcome — **never item content**, per SEC-12), a server-side sync error counter, and a simple household-level "sync health" view for the admin | Backend | `src/server/sync/**`, `src/app/(app)/household/settings/**` |
| 7.6 | Security review of the whole diff against `docs/project.md` §14; verify every SEC-01…SEC-12 | Backend + Database | `src/**` |
| 7.7 | Write the release checklist: CI status, preview environment, environment variables, migration order, backup and rollback, and the manual verification steps the product owner must perform | Lead | `docs/release-checklist.md` |
| 7.8 | Full regression run: unit, integration, E2E, offline suite, Lighthouse, and a manual walkthrough of the in-store journey | Lead | — |

### Deliverables

- The two-device offline demonstration passes and runs in CI.
- The migration rehearsal proves a legacy household's list is reproduced exactly.
- The performance budget is met.
- The security review is complete with no open high findings.
- The release checklist is ready for the product owner.

### Dependencies

Phases 0–6.

### Files / architectural areas affected

`scripts/**`, `e2e/**`, `.github/workflows/**`, `docs/**`.

### Risks

| Risk | Likelihood | Mitigation |
| --- | --- | --- |
| The offline demonstration is flaky in CI | Medium | It uses a real server and real database, so it must be a separate, non-blocking-at-first CI job that becomes required once it has been stable for a week. |
| The performance budget is missed after the SSR removal | Medium | The documented fallback (`docs/project.md` §15.2) is implemented in Task 7.4 if needed. |
| A migration rehearsal on a copy of production data is attempted | Low | The rehearsal uses a **synthetic** legacy snapshot. No production data is accessed. |

### Verification approach

```
pnpm verify:offline        # the two-device demonstration
pnpm test:e2e -- e2e/offline
pnpm verify:perf           # Lighthouse budget
pnpm verify:migration      # legacy-data rehearsal
pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration && pnpm build
```

Plus the manual in-store journey: airplane mode on a real phone, from opening
the app through adding, checking, closing, and reconnecting.

### Definition of done

- Every command above passes on the merged result.
- The release checklist is complete and reviewed by the Lead.
- The product owner has been given the release checklist and the merge order.
- The offline demonstration has been run successfully at least three times
  consecutively without flakiness.

---

## 3. Merge order and sequencing

| Order | PR | Why |
| --- | --- | --- |
| 1 | Phase 0 — CI gate | Everything else depends on a gate that works. |
| 2 | Phase 0b — Supabase migration | The stack moves first; Phase 1's cancelled tasks are absorbed here. |
| 3 | Phase 1.5–1.6b — UX and data-integrity fixes | Independent of each other; land in any order after 2. |
| 4 | Phase 1.7 and 1.9 — atomicity and integration tests | Depends on 3 (the tombstone change). |
| 5 | Phase 2 — contracts | Must precede all of Phase 3/4/5. |
| 6 | Phase 3 and Phase 4 in parallel | Disjoint file sets; both depend on 5. Merge Phase 3 before Phase 5, Phase 4 before Phase 5. |
| 7 | Phase 5 — convergence | Depends on Phase 3 and Phase 4. |
| 8 | Phase 6 — UX and PWA | Depends on 7. |
| 9 | Phase 7 — hardening | Depends on everything. |

**Blocking note:** Phase 4 (client) can be developed in parallel with Phase 3
(server) against the frozen contract, but **Phase 5 cannot start until both
land**. The product owner should expect a merge-order dependency at Phase 5.

---

## 4. Data migration and product-continuity strategy

Because this is a partial rebuild, the existing product stays in service
throughout. The plan preserves user value explicitly:

| Continuity requirement | How the plan meets it |
| --- | --- |
| **No user data is rewritten.** | All migrations are additive plus one separately-verified `is_active → deleted_at` backfill. Phase 7.3 rehearses it against a synthetic legacy snapshot. |
| **No client data exists to migrate.** | The current application stores no domain data on the device, so the first load of the new version simply bootstraps from the server. Phase 4.6. |
| **The existing feature set is preserved.** | Every capability in `docs/project.md` §2.1 is retained; Phase 4 converts the components rather than replacing them, and Phase 6 removes nothing. |
| **The product is never in a broken state.** | Every phase is a working increment on `main`. The client and server versions interoperate throughout: the legacy REST endpoints remain available until the new client has shipped and the old client is unreachable. |
| **Rollback is possible.** | The server is additive, so rolling the client back is a client-only deployment. The schema rollback is a migration down, not a data restore. **A rollback must not strand unsynchronised edits.** The new client's pending operations live in its IndexedDB outbox; the legacy client does not use that outbox, so a rollback that discards the new client's database would strand them. The rollback procedure therefore: (1) **drains the outbox** — the client syncs before it is rolled back, and the release notes tell the user to open the app once on a connection before downgrading; (2) if the outbox cannot be drained, the client **exports it to a JSON file** and the release notes say so, and (3) the legacy client is left able to read the server, because every write it makes goes through the change-log path (task 3.3b). |

### Explicitly deferred beyond this roadmap

Per `docs/project.md` §17: barcode scanning, voice input, recipes, price
tracking, item attribution display, drag-to-reorder, auto-categorisation, and
duplicate-product suggestions. The data model keeps the door open for
duplicate-product suggestions (scenario 6 keeps both items) and for a push
transport (the sync protocol is transport-agnostic).

---

## 6. Risks to the plan as a whole

| # | Risk | Severity | Mitigation |
| --- | --- | --- | --- |
| R-1 | The team discovers mid-implementation that the conflict rules are wrong for a real household scenario | High | Phase 2 proves the rules as pure functions before they are wired. The matrix is also a product decision — **the product owner is asked to approve §11 of `docs/project.md` before Phase 3 starts.** |
| R-8 | The apply statement is implemented from the prose rather than from §10.8's verified SQL, and the two drift | High | §10.8's three statements have been **executed against PostgreSQL 17** with the document's own DDL and their outcomes verified across **45 scenarios in 11 groups**, with **271 assertions** passing. They are the normative form; §16.4 makes them the fixture for the Phase 3 integration tests, so an implementation that differs from them fails a test rather than passing review. |
| R-2 | The SSR → client-render switch causes a performance regression that damages the existing Lighthouse score | Medium | The budget is a Phase 7 gate with a documented fallback. The existing perf harness is reused, not rewritten. |
| R-3 | iOS Safari behaves differently from the emulation (IndexedDB eviction, service worker lifecycle) | Medium | WebKit is in the Playwright matrix from Phase 0. The manual walkthrough on a real device is a Phase 7 gate. The design avoids Background Sync precisely because of iOS. |
| R-4 | ~~The HTTP driver of the previous host cannot provide the atomicity the apply path needs~~ — **closed**: the driver is the standard `pg` driver over the self-hosted instance, and interactive transactions are the primary path rather than a fallback (ADR-14, ADR-16). Confirmed on the production instance in Phase 2 (Task 2.4) | — | Closed |
| R-5 | Scope creep toward the deferred v2 features | Medium | §17 is explicit. Anything not in the phase list is out of scope for this roadmap. |
| R-6 | The recovery takes longer than 14 weeks | Medium | Phases 0–2 are the highest-value, lowest-risk work and are valuable on their own. If the timeline slips, the team ships Phase 6's PWA and offline cold start (the user's headline requirement) before the full conflict-resolution polish. |
| R-7 | The database grows in a way that degrades the sync pull | Low | The `(household_id, seq)` index, pruning, and a household-scale pull limit of 500 changes per page. |

---

## 7. Decisions needed from the product owner before Phase 3

These are product decisions, not technical ones. They are listed in full in the
assessment; the ones that block work are here.

| # | Decision | Blocks |
| --- | --- | --- |
| D-1 | Approve the conflict-resolution matrix (`docs/project.md` §11), in particular **check-wins** and **delete-wins**. | Phase 3 |
| D-1a | **Sub-decision inside D-1: which side wins a *concurrent* store-tag contest?** §11 now says the **removal** wins — a tag somebody deliberately removed does not come back because another device re-added it at the same time. The alternative is that the **addition** wins, on the grounds that losing a tag re-routes a shopper to the wrong store. Both surface the losing edit to the user; they differ only in which edit stands. The removal-wins rule is the one implemented and verified in §10.8.3, and it is the conservative default (a tag that was meant to be gone stays gone). Flipping it is a change to one `CASE` in the `decide` CTE — but it must be decided **before** Phase 3, because the pair resolution and its tests are written against it. | Phase 3 |
| D-2 | Confirm the change-log retention window (proposed: 90 days). It defines the **maximum device offline window** — beyond it a device must full-resync, and a full resync is authoritative over local state. Note that tombstones are **not** subject to this window: a tombstoned item row is never hard-deleted, because purging it would let a long-offline device resurrect the item (FR-24, INV-07). | Phase 3.1, 3.5 |
| D-3 | Confirm the sync interval (proposed: push 2 s after a change, poll every 30 s while pending) — a trade of battery against freshness. | Phase 5.2 |
| D-4 | Confirm that deleting an item makes it recoverable from History (today it does not) and that "clear completed" remains separately recoverable. | Phase 1.6 |
| D-5 | Confirm the sign-out behaviour when unsynchronised changes exist: block, or allow with an explicit choice? | Phase 6.4 |
| D-6 | Confirm whether a household admin may see other members' devices, and whether that list is in scope for the first release. | Phase 6.10 |
| D-7 | **Confirm that a checked item stays in place** (dimmed, struck through) rather than moving to a "Completed" section at the bottom of the list. This is the single most important in-aisle change in the plan: today a tick makes the row **leave its position**, so the shopper taps an item and it disappears from under their thumb. Recommendation: keep it in place, and turn the bottom section into a collapsed summary with an "Archive checked items" action. The alternative — today's behaviour, with the section not collapsed — preserves the current mental model at the cost of the extra screen furniture | Phase 6.11 |
