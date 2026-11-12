# Shopping List — Audit Summary

**What this file is.** The entry point for the offline-first recovery of the
Shopping List application. It states where the project stands, what the audit
found, and what happens next. It is a summary, not a specification —
`docs/project.md` is the specification and `docs/plan.md` is the roadmap.

| | |
| --- | --- |
| **Scope** | Technical and functional audit of `mnaumann79/shopping-list`, plus an offline-first recovery plan |
| **Date** | 2026-11-12 |
| **Branch** | `docs/offline-first-recovery-plan` |
| **Pull request** | [#1](https://github.com/mnaumann79/shopping-list/pull/1) — open, documentation-only, **not merged** |
| **Implementation** | **Not started.** No boards, no tasks, no code, no migrations touched. |

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
planning documents over seven rounds. They found roughly forty **blocking**
defects in the *specification* — several of which would have cost weeks to
discover during implementation, and two of which would have caused silent
data loss. All findings have been applied.

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
| High | Item-store replacement is not transactional (Neon HTTP throws on `db.transaction()`) | `src/server/services/items.ts:249-256` |
| High | Unit tests do not pass — 6 failed / 123 passed / 1 skipped | `pnpm test` |
| High | No CI quality gate: no lint, typecheck, or unit-test job | `.github/workflows/` |
| Medium | Quantity input silently corrupts data — `2.5 kg` is stored as `25` | `src/lib/utils.ts` |
| Medium | Type-check fails — 9 errors, invisible to `next build` | `tsc --noEmit` |
| Medium | A check makes the row leave the shopper's thumb | `ShoppingList.tsx:169-173` |

**What works, and is retained:** authentication and household onboarding,
invitations and join links, household switching, item CRUD with categories and
store tags, check-off, the History and re-add flow, the store filter and the
Category / Alphabetical / Store grouping, the dark-mode design system, and the
Playwright harness with its iPhone 13 and WebKit profiles.

**Tenant isolation was verified working** — a user of household B receives 404
for household A's item on read, update, and delete. But **no test asserts it**,
because the test suite's fake `db` ignores `where()` clauses entirely. A
regression dropping the household filter would pass the whole suite.

---

## 4. The verdict: partial rebuild

**Option B** — retain the domain model, schema shape, auth, validation and UI;
replace the client data layer, the mutation path, the sync protocol and the
PWA layer.

**Not an incremental refactor.** The server owns the data and the client is a
thin view; offline-first *inverts that ownership*. That is architectural, not a
function body — patching around it leaves two competing mental models, which
is how the current inconsistency arose.

**Not a rewrite.** Roughly 60% of the codebase survives intact, and because the
current application stores **no client-side data**, the existing data needs no
migration. A rewrite would add 6–8 weeks and real data-loss risk for zero
functional gain.

| Option | Duration | Risk | Outcome |
| --- | --- | --- | --- |
| Incremental refactor | 9–12 wks | High | A hybrid with inconsistent semantics |
| **Partial rebuild** | **≈ 12 wks** | **Low–Medium** | **Coherent offline-first system, ~60% retained** |
| Full rebuild | 14–20 wks | High | Same destination, later, with real migration risk |

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

Fifteen architectural decisions with their rationale and rejected alternatives
are recorded in `docs/project.md` §18.

---

## 6. The roadmap

Full detail in `docs/plan.md`. Eight dependency-aware phases:

| Phase | Objective | Weeks |
| --- | --- | --- |
| **0 — Reliable Baseline** | Make lint, type-check, tests and CI green so anything can be verified | 1 |
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

**A repeatable demonstration is required before the work is done**: two
devices make conflicting offline changes, reconnect, and converge correctly
with the losing edit surfaced rather than discarded.

---

## 7. Current state

| | |
| --- | --- |
| **Specification** | `docs/project.md` — ~2,850 lines. 31 functional requirements, 12 invariants, 18 offline scenarios, 17 operation types, 13 error codes, 15 ADRs, 38 acceptance criteria. |
| **Roadmap** | `docs/plan.md` — ~760 lines. 8 phases, ownership matrix, merge order, 7 open decisions. |
| **Review** | 8 rounds, by three specialists. All blocking findings applied; 12 refinements deferred to Appendix B with an owner and a phase. |
| **Verification** | Every cross-reference resolves; no undefined identifiers, no stale vocabulary, all 18 scenarios carry behaviour, handling and acceptance criteria. |

**Deliberate changes to the original plan, made on review:** RLS removed from
the isolation strategy (unreliable on the Neon HTTP driver — fail-open returns
every row, fail-closed returns none); "Keep mine" made an explicit **override**
rather than a race; tombstones made **never hard-deleted**.

---

## 8. Decisions needed from the product owner

Seven are listed in `docs/plan.md` §6. Two gate Phase 3:

| | Decision | Why it is yours |
| --- | --- | --- |
| **D-1** | **The conflict-resolution matrix** — in particular **check-wins** and **delete-wins** (`docs/project.md` §11) | A product judgement about how a household should behave, not a technical one. Every other rule is an implementation detail; this one is about people. |
| **D-7** | **A checked item stays in place**, dimmed, rather than moving to a "Completed" section | Today the row leaves the shopper's thumb the instant they tick it. This is the most important in-aisle change in the plan. |

The other five — retention window, sync cadence, delete-recoverability,
sign-out behaviour with unsynchronised changes, and device management — are
listed in `docs/plan.md` §6.

---

## 9. What has *not* been done

- No application code was changed.
- No database schema or migration was changed.
- No implementation board or task was created.
- Nothing was deployed, and no production system or credential was accessed.
- The pull request is **open and unmerged** — merging is the product owner's
  decision.

---

## 10. How to verify these claims

The audit's runtime findings were produced with a real PostgreSQL instance, a
real production build, and a real browser. To reproduce the central finding:

```bash
# a real database
createdb shopping_test && psql shopping_test -f db/init.sql

# the production build, with the DB configured
DATABASE_URL=postgresql://…/shopping_test DB_DRIVER=node-postgres \
  BETTER_AUTH_SECRET=… BETTER_AUTH_URL=http://127.0.0.1:3000 pnpm build

# then, with the app running:
#   - disable the network
#   - reload the dashboard  → ERR_INTERNET_DISCONNECTED
#   - add an item            → "Failed to add item", and the item is lost
#   - inspect the console    → indexedDB.databases() is []
```

The quality gates as they stand today:

```
pnpm lint        # passes
pnpm typecheck   # FAILS — 9 errors, all in route test files
pnpm test        # FAILS — 6 failed / 123 passed / 1 skipped
pnpm build       # passes with DATABASE_URL set; fails without it
```

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
