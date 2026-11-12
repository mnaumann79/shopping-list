# Shopping List — Audit Summary

**What this file is.** The entry point for the offline-first recovery of the
Shopping List application. It states where the project stands, what the audit
found, and what happens next. It is a summary, not a specification —
`docs/project.md` is the specification and `docs/plan.md` is the roadmap.

| | |
| --- | --- |
| **Scope** | Technical and functional audit of `mnaumann79/shopping-list`, plus an offline-first recovery plan |
| **Date** | 2026-11-12 |
| **Branch** | `docs/offline-first-sync-statement-fixes` |
| **Pull request** | [#1](https://github.com/mnaumann79/shopping-list/pull/1) — **merged**. [#2](https://github.com/mnaumann79/shopping-list/pull/2) — open, documentation-only, **not merged** |
| **Implementation** | **Phase 0 in progress** — a reliable baseline: CI, a green test suite, a safe migration runner. No feature code yet; the offline-first rebuild has not started. |

---

## 1. What was done

The audit covered the whole codebase: architecture, frontend components and
state management, backend APIs and business logic, the database schema and
migrations, authentication and household isolation, caching and PWA behaviour,
concurrency and data-loss scenarios, dependencies, security, and test coverage.
It also read the historical `.planning/` documentation and **independently
verified** whether its claims matched the implementation.

**Method.** Claims were verified by *running* the application, not by reading
it: the production build was compiled, run against a real PostgreSQL 17
instance, and driven with a real Chromium browser via Playwright. Where the
document says **VERIFIED**, that means it was observed in that environment.

**Review.** The Backend, Database and Frontend specialists reviewed the
planning documents over eight rounds. They found roughly **fifty blocking**
defects in the *specification* — several of which would have cost weeks to
discover during implementation, and two of which would have caused silent
data loss. All findings have been applied.

**The last round was the sharpest.** The Database Expert extracted §10.8's SQL
— the statement an implementer would copy — and ran it against PostgreSQL 17
using the specification's own DDL. It **did not parse**, and where it parsed it
reached the wrong outcome: sixteen blocking defects, every one of them in that
statement. The statement was rewritten and re-verified; it now executes, and
its outcomes were checked across **thirty-seven scenarios** — a normal update,
a field lost to a concurrent write, a check that loses by check-wins, a write
to a tombstoned row, an undelete that is too old, a lost compare-and-swap,
**both arrival orders of an archive racing an uncheck**, a stale uncheck that
does not reverse an archive, an explicit override that beats check-wins, five
store-tag outcomes, a mixed bulk operation, a bulk operation where every
candidate was skipped, a row archived before the sync model, two replays, a
create that writes its tags, and a create whose id is already taken. **201 assertions
pass.** The same round produced one schema change: a **tombstone on the tag
pairs** (`item_stores.deleted_at`),
without which a removal's ordering key is destroyed and a long-offline device
could resurrect a tag somebody had deliberately removed.

**A ninth round then found one more blocking defect, in the ledger.** The
ledger row was written by the apply statement, so a bulk operation — which
expands into one statement per item under a single `opId` — would insert the
same primary key twice, raise, and take the whole batch down with it. The same
happened when an operation that won nothing was replayed. The ledger row is now
written **once per operation, by the request, at the end of the batch**, so it
cannot raise; the apply statements return the operation's outcome instead. A
further round also found that "clear completed" was **order-dependent** — the
outcome depended on which device reconnected first — so the archive is now
conditional on the item still being checked, and an uncheck reverses it.

---

## 2. The headline finding

> **The application is entirely online. It does not degrade without a
> connection — it disappears.**

Verified against the production build in a real browser:

- With the network disabled, a **reload produces the browser's
  `ERR_INTERNET_DISCONNECTED` error page**. The service worker *is* registered
  and its cache *does* exist — but it holds only content-hashed static assets,
  so no navigation request is ever served from it.
- **No local persistence of any kind.** `indexedDB.databases()` returns `[]`;
  shopping data exists only in React state.
- **Offline edits are destroyed.** Adding an item while offline shows
  `Failed to add item` and the item is rolled back and lost.
- **There is no `manifest.json`**, so the app cannot be installed on iOS or
  Android.
- **Household collaboration requires a manual page reload.** An item added on
  a second device never appeared on an open first device.

The application's own product definition names its primary use case as
*"users will primarily use this on mobile browsers while at the store"*
(`.planning/PROJECT.md:58`) — precisely the scenario its architecture cannot
serve.

**Why it happened.** The project's own planning history deferred offline
support in exactly one line (`.planning/milestones/v1.0-REQUIREMENTS.md:92`),
and that line was then deleted from every subsequent scope document without
being reinstated or replaced by a backlog item.

---

## 3. What was found

**23 verified defects** (16 functional, 7 security) are catalogued in
`docs/project.md` §2, each with a source-file reference. The most serious:

| Severity | Finding | Where |
| --- | --- | --- |
| Critical | The app cannot load offline | `public/sw.js:33-36` |
| Critical | Offline edits are destroyed | `ShoppingList.tsx:370-373` |
| Critical | No local persistence; no PWA manifest | `ShoppingList.tsx:256` |
| High | Plain household members can mint join links (authorization bypass) | `api/households/join-links/route.ts` |
| High | No idempotency, no conflict detection, no operation queue | `src/db/schema/items.ts` |
| High | `clear-completed` archives items regardless of concurrent activity | `src/server/services/items.ts:270-303` |
| High | Item-store replacement is not transactional — the tag rows are deleted and re-inserted as two separate statements | `src/server/services/items.ts:249-256` |
| High | Unit tests do not pass — 6 failed / 123 passed / 1 skipped | `pnpm test` |
| High | No CI quality gate: no lint, typecheck, or unit-test job | `.github/workflows/` |
| Medium | Quantity input silently corrupts data — `2.5 kg` is stored as `25` | `src/lib/utils.ts` |
| Medium | Type-check fails — 9 errors, invisible to `next build` | `tsc --noEmit` |
| Medium | A check makes the row leave the shopper's thumb | `ShoppingList.tsx:169-173` |

**What works, and is retained:** household onboarding, household switching,
item CRUD with categories and store tags, check-off, the History and re-add
flow, the store filter and the Category / Alphabetical / Store grouping, the
dark-mode design system, and the Playwright harness with its iPhone 13 and
WebKit profiles. **Authentication and the invitation flows keep their
capability and change their mechanism** — Supabase Auth replaces Better Auth,
and `household_invitations` replaces the plugin's own tables (ADR-17). The
shareable join link is retained, with authorization added.

**Tenant isolation was verified working** — a user of household B receives 404
for household A's item on read, update, and delete. But **no test asserts it**,
because the test suite's fake `db` ignores `where()` clauses entirely. A
regression dropping the household filter would pass the whole suite.

---

## 4. The verdict: partial rebuild

**Option B** — retain the domain model, schema shape, validation and UI;
replace the client data layer, the mutation path, the sync protocol, the PWA
layer and the authentication mechanism.

**Not an incremental refactor.** The server owns the data and the client is a
thin view; offline-first *inverts that ownership*. That is architectural, not a
function body — patching around it leaves two competing mental models, which
is how the current inconsistency arose.

**Not a rewrite.** Roughly 60% of the codebase survives intact, and because the
current application stores **no client-side data**, the existing data needs no
**client-side** migration — there is nothing on a device to migrate. The
**server** data does need a migration: the cutover from the hosted database to
the self-hosted Supabase instance and from Better Auth to Supabase Auth, the
`is_active → deleted_at` backfill, the additive columns, the tag-pair
de-duplication before its new primary key, and a rehearsal against a seeded
legacy database (Phase 0b, task 0b.12, Phase 0, task 0.4, and Phase 3, tasks
3.0–3.1). A rewrite would add 6–8 weeks and real data-loss risk for zero
functional gain.

| Option | Duration | Risk | Outcome |
| --- | --- | --- | --- |
| Incremental refactor | 9–12 wks | High | A hybrid with inconsistent semantics |
| **Partial rebuild** | **≈ 14 wks** | **Low–Medium** | **Coherent offline-first system, ~60% retained** |
| Full rebuild | 20–22 wks | High | Same destination, later, with real migration risk |

---

## 5. The proposed architecture

Full detail in `docs/project.md`. In brief:

- **IndexedDB via Dexie** as the client's source of truth, with versioned
  schema migrations. The only storage that satisfies "persistent local
  database" with structured data, transactions *and* migrations.
- **One `POST /api/sync`** endpoint that pushes and pulls in a single round
  trip, one transaction, with the push strictly before the pull.
- **A server-side change log** (`sync_changes`) with a monotonic sequence, and
  the apply path serialised per household so allocation order equals commit
  order.
- **Idempotency keyed on a client-generated `opId`**, with the full response
  envelope cached so a replay is identical.
- **Per-field conflict resolution** — check-wins, delete-wins, removal-wins
  for store tags, field-level LWW elsewhere — with the losing value
  **surfaced, never silently discarded**.
- **Foreground sync only.** The Background Sync API is unimplemented in Safari,
  so durability comes from IndexedDB, not a background task.
- **Real-PostgreSQL integration tests**, because a mocked database cannot
  verify tenant isolation, constraints, or migrations.
- **Self-hosted Supabase for the platform**, and **Supabase Auth** for
  identity. This is the product owner's decision, and it is recorded as
  ADR-16 and ADR-17. It buys three things: the instance is the platform the
  owner wants to run; the apply path becomes an ordinary interactive
  transaction on the standard `pg` driver instead of a batch of independent
  requests (ADR-14, ADR-16); and the identity id is a `uuid` owned by the
  platform, which is what makes `auth.uid()` — and therefore **real**
  row-level security — possible.

Seventeen architectural decisions with their rationale and rejected
alternatives are recorded in `docs/project.md` §18.

---

## 6. The roadmap

Full detail in `docs/plan.md`. Nine dependency-aware phases:

| Phase | Objective | Weeks |
| --- | --- | --- |
| **0 — Reliable Baseline** | Make lint, type-check, tests and CI green so anything can be verified | 1 |
| **0b — Supabase Migration** | Move the hosting, the database and the authentication; put row-level security behind the scope helper | 2 |
| **1 — Security & Data-Integrity Repairs** | Close the verified authorization and integrity defects on the current architecture | 1 |
| **2 — Architecture Contracts** | Freeze the interface contracts; prove the atomicity approach | 1 |
| **3 — Server Sync Core** | Change log, idempotency ledger, apply engine, `/api/sync` | 2 |
| **4 — Client Local-First Core** | IndexedDB, repository, outbox, dashboard renders from the local store | 2 |
| **5 — Sync Engine & Convergence** | Push, pull, conflict resolution, two devices converge | 2 |
| **6 — Offline UX, PWA & Household Scenarios** | Install, offline cold start, status chip, the 18 scenarios | 2 |
| **7 — Hardening & Release Readiness** | Full test matrix, migration rehearsal, performance budget | 1 |

Phases 3 and 4 run in parallel once Phase 2 has frozen the contracts. Every
phase produces a demonstrably working increment, and a file-ownership matrix
prevents concurrent tasks from sharing writable paths.

**Phase 0b is the cutover, and it is the one phase that touches live data.**
Its rollback is a configuration change rather than a restore, because the
old database is not modified during the window — and that property is only
true if the steps are followed. §13.2a is the procedure; §13.2c explains why
no existing user is asked to reset their password.

**A repeatable demonstration is required before the work is done**: two
devices make conflicting offline changes, reconnect, and converge correctly
with the losing edit surfaced rather than discarded.

---

## 7. Current state

| | |
| --- | --- |
| **Specification** | `docs/project.md` — ~3,900 lines. 31 functional requirements, 12 invariants, 18 offline scenarios, 17 operation types, 13 error codes, 17 ADRs, 38 acceptance criteria. |
| **Roadmap** | `docs/plan.md` — ~900 lines. 9 phases, ownership matrix, merge order, 8 open decisions plus 3 in Phase 0b. |
| **Review** | 8 rounds, by three specialists, plus 4 further verification rounds. All blocking findings applied; 22 refinements deferred to Appendix B with an owner and a phase. |
| **Verification** | Every cross-reference resolves; no undefined identifiers, no stale vocabulary, all 18 scenarios carry behaviour, handling and acceptance criteria. **§10.8's three statements have been executed against PostgreSQL 17 with the specification's own DDL, and 201 assertions about their outcomes pass** — extracted from the document by content, so the text that is verified is the text that is specified. **All three have also been executed against the self-hosted Supabase instance**, which is PostgreSQL 17.11 — the same version — and `auth.uid()` resolves there from a transaction-local claim, which is what the row-level security policies depend on. |

**Deliberate changes to the original plan, made on review:** "Keep mine" made
an explicit **override** rather than a race; tombstones made **never
hard-deleted**; the change-log payload made **camelCase** to match the wire
contract; and a **pair tombstone** added so that a removal's ordering key
survives.

**One change was reversed by the stack move.** The original plan **excluded**
PostgreSQL row-level security, because every statement reached the database as
its own request with no session state: a policy could not be keyed reliably to
the caller, and a policy written fail-open returns every row while one written
fail-closed returns none — the *appearance* of defence in depth, behaving
unpredictably. That reasoning was correct, and it is
**answered rather than ignored**: the hosting moves to a self-hosted Supabase
instance, where Supabase Auth issues a signed JWT and the claims are set
**inside the transaction that runs the query**, so there is no window in which
a policy is evaluated without the caller being known. RLS is now the second
of three isolation layers, and it closes the "no database-level tenant
isolation" defect (S-5) at the database rather than only in the application.

---

## 8. Decisions needed from the product owner

Eight are listed in `docs/plan.md` §7. **Three gate Phase 3**, so they are
the ones to answer first:

| | Decision | Gates | Why it is yours |
| --- | --- | --- | --- |
| **D-1** | **The conflict-resolution matrix** — in particular **check-wins** and **delete-wins** (`docs/project.md` §11) | Phase 3 | A product judgement about how a household should behave, not a technical one. Every other rule is an implementation detail; this one is about people. |
| **D-1a** | **Which side wins a *concurrent* store-tag contest** — the removal (as specified and verified) or the addition | Phase 3 | A sub-decision inside D-1. Both surface the losing edit to the user; they differ only in which edit stands. The removal-wins rule is implemented and verified; flipping it is a change to one `CASE`. |
| **D-2** | **The change-log retention window** (proposed: 90 days) — it defines the maximum device offline window | Phase 3.1, 3.5 | A product trade of storage against how long a device may be offline before it must re-bootstrap. Tombstoned rows are exempt from the window. |
| **D-7** | **A checked item stays in place**, dimmed, rather than moving to a "Completed" section | Phase 6.11 | Today the row leaves the shopper's thumb the instant they tick it. This is the most important in-aisle change in the plan. |

The other four — sync cadence (D-3), delete-recoverability (D-4), sign-out
behaviour with unsynchronised changes (D-5), and device management (D-6) —
have later deadlines and are listed in `docs/plan.md` §7.

**Three more gate Phase 0b**, and they are listed in `docs/plan.md`'s Phase
0b section:

| | Decision | Recommendation | Why it is yours |
| --- | --- | --- | --- |
| **D-8** | Does Supabase require email confirmation on sign-up? | **No**, initially | An unconfirmed account can reach no data: every household-scoped table is behind row-level security and a membership row is required. Turning it on later is one setting. |
| **D-9** | How long is the rollback window after the cutover? | **14 days** | It has to cover "the user did not notice until next week". A longer window means the old authentication library stays a dependency longer. |
| **D-10** | Are the legacy authentication tables dropped, or left in place? | **Dropped** | A table named `user` sitting next to `auth.users` is a trap for the next developer. Dropping is irreversible, but the data is redundant once every account has been migrated. |

---

## 9. What has *not* been done

**The audit itself changed nothing:** no application code, no database schema
or migration, no production system, no credential. That is still true of the
audit's findings.

**Since then, the work has started, and this is where it stands:**

- **Phase 0 is in progress** — a reliable baseline, not a feature. A CI
  workflow, a green test suite, a migration runner that refuses to run against
  a production host, and a test configuration that works from a clean
  checkout.
- **Phase 0b is planned, not started.** The Supabase migration has a written
  procedure, a rehearsal, and twelve tasks with owners — but **the cutover
  has not happened and no production data has moved.** The instance is
  verified — PostgreSQL 17.11, and the fixture's three statements run against
  it — and task 0b.2 re-runs both and records the outcome. It has not been
  switched to.
- **No feature work has started.** The offline-first rebuild — IndexedDB, the
  sync engine, the conflict resolution, the offline UX — is untouched.
- **Nothing has been deployed**, and no production system or credential has
  been accessed.
- **PR #1 is merged; PR #2 is open.** Merging the documentation pull request
  is the product owner's decision, and so is the cutover.

**One thing has been done that deserves to be called out:** the §10.8 SQL was
executed against a real PostgreSQL with the specification's own DDL, and its
outcomes verified — 201 assertions across 37 scenarios in 9 groups. That is
**verification, not implementation**: no production code contains that SQL
yet, and it will not until Phase 3.

---

## 10. How to verify these claims

The audit's runtime findings were produced with a real PostgreSQL instance, a
real production build, and a real browser. To reproduce the central finding:

```bash
# a real database
createdb shopping_test && psql shopping_test -f db/init.sql

# the production build AND the running server need the same environment:
# src/db/index.ts reads DATABASE_URL at import time, so the build alone is
# not enough — the server process needs it too.
export DATABASE_URL=postgresql://…/shopping_test
export BETTER_AUTH_SECRET=…
export BETTER_AUTH_URL=http://127.0.0.1:3000
export NEXT_PUBLIC_APP_URL=http://127.0.0.1:3000

# the driver is chosen by an environment variable; after Phase 0b (ADR-16) the
# standard `pg` driver is the only one.

pnpm build && pnpm start

# then, in the browser, with the app open on the dashboard:
#   1. add an item while still ONLINE   → it appears
#   2. disable the network
#   3. add another item                 → "Failed to add item", and the
#                                          item is rolled back and lost
#   4. reload the dashboard             → ERR_INTERNET_DISCONNECTED
#   5. inspect the console              → indexedDB.databases() is []
#
# (Step 3 before step 4: once the page has been reloaded into the browser's
# error page there is no app left to add an item to.)
```

The quality gates as they stand today:

```
pnpm lint              # passes
pnpm exec tsc --noEmit # FAILS — 9 errors, all in route test files
pnpm test              # FAILS — 6 failed / 123 passed / 1 skipped
pnpm build             # passes with DATABASE_URL set; fails without it
```

There is no `pnpm typecheck` script yet — `package.json` has only `dev`,
`build`, `start`, `lint` and `test`. Phase 0's task 0.1 adds one.

Phase 0 exists to make the last three green before any architecture changes,
so that every later increment can be verified rather than asserted.

---

## 11. Related documents

| Document | What it is |
| --- | --- |
| `docs/project.md` | The future product specification and technical architecture |
| `docs/plan.md` | The phased implementation and recovery roadmap |
| `docs/audit-summary.md` | This file — current state and next steps |
| `docs/perf-audit.md` | The existing Lighthouse performance runbook |
| `.planning/` | The project's historical planning documentation (reviewed, not relied upon) |
