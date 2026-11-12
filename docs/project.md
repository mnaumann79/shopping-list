# Shopping List — Product Specification & Technical Architecture

**Status:** Proposed — pending product-owner approval
**Scope:** Future state of the application after the offline-first recovery
**Audience:** Frontend Designer, Backend Engineer, Database Expert
**Prepared by:** Lead Engineer

---

## How to read this document

Every claim in this document is tagged:

| Tag | Meaning |
| --- | --- |
| ✅ **VERIFIED** | I inspected the source and/or ran the running application and observed this behaviour firsthand. |
| ⚠️ **DEFECT** | Verified to be broken or incorrect in the current code. |
| 📋 **SPEC** | The intended behaviour of the recovered system. Not yet implemented. |

Where the current behaviour is relevant it is stated as **VERIFIED** or **DEFECT**;
everything about the future system is **SPEC** and requires implementation.

**Verification method.** Beyond static review, the current application was built,
run against a real PostgreSQL 17 instance, and driven with a real Chromium browser
via Playwright. Every runtime claim below was observed in that environment, not
inferred. The harness is described in §16.5.

---

## 1. Product vision and primary users

### 1.1 Vision

A shared shopping list for a household that **works in the aisle**, with or without
a network connection, and converges correctly across the household's devices when
the network returns.

The product promise is not "a list that syncs". It is:

> *A member of the household can open the list in a basement store with no signal,
> add what they need, tick off what they bought, and close the app. Nothing is lost.
> When signal returns, every other device in the household converges to the same list.*

### 1.2 Primary users

**Verified from the existing product definition** (`.planning/PROJECT.md:57-64`):

- **The household shopper** — one adult, on a phone, standing in a shop. This is
  the primary and most demanding user. They are usually one-handed, often in a
  poorly-lit or low-signal space, and they need the list *now*.
- **The household co-ordinator** — adds to the list ahead of the trip (at the
  supermarket, from a recipe, from a phone call), tags items to a store, and
  assigns categories.
- **The household admin** — a household of 2–6 people; creates the household,
  invites members, manages stores.

**Household scale is small** (2–6 users, tens to low hundreds of items). This is
the single most important constraint on the design: it permits an entire-household
snapshot model, it permits per-field conflict resolution, and it rules out any
need for a CRDT or a general-purpose sync engine.

### 1.3 What this changes about the product

The existing product's stated primary use case is *"Users will primarily use this
on mobile browsers while at the store"* (`.planning/PROJECT.md:58`), while its
architecture requires a live server round-trip for every read and every write.
That contradiction is the root of the problem this document resolves.

---

## 2. Existing capabilities worth retaining

### 2.1 Verified working (retain)

| Capability | Evidence | Disposition |
| --- | --- | --- |
| Email/password signup, sign-in, sign-out | ✅ VERIFIED — drove the real signup → onboarding → dashboard flow in Chromium | **Retain** (Better Auth) |
| Household creation, onboarding | ✅ VERIFIED | **Retain** |
| Household invite by email | ✅ VERIFIED — Better Auth enforces admin-only (returns "not allowed" for plain members) | **Retain**, fix status code |
| Shareable join link | ✅ VERIFIED — works, but see §2.3 | **Retain**, add authorization |
| Household switching | ✅ VERIFIED — `authClient.organization.setActive` | **Retain** |
| Item CRUD with name / quantity / note | ✅ VERIFIED | **Retain**, fix quantity input |
| Category assignment + custom categories | ✅ VERIFIED — 10 defaults seeded per household | **Retain** |
| Store tagging (many-to-many) + store CRUD | ✅ VERIFIED | **Retain** |
| Check/uncheck during a trip | ✅ VERIFIED | **Retain**, make local-first |
| Clear completed → archive → re-add from History | ✅ VERIFIED end-to-end in the browser | **Retain**, redesign delete semantics |
| Store filter + Category/Alphabetical/Store grouping | ✅ VERIFIED | **Retain** |
| Multi-household data isolation | ✅ VERIFIED — household B received HTTP 404 when it tried to read or delete household A's item | **Retain**, add regression tests |
| Dark mode, design system, compact item row | ✅ VERIFIED visually | **Retain** |
| Playwright harness with iPhone 13 / WebKit / Firefox profiles | ✅ VERIFIED present | **Retain and extend** |

### 2.2 Verified broken (must repair or replace)

| # | Defect | Evidence |
| --- | --- | --- |
| B-1 | **The application cannot load without a network connection.** An offline reload fails with `net::ERR_INTERNET_DISCONNECTED` — the browser's network error page, not the app. | ✅ VERIFIED in Chromium against the production build |
| B-2 | **The service worker does not cache the application shell.** `public/sw.js:33-36` caches only `/_next/static/`; navigation requests are never handled, so there is no offline fallback. | ✅ VERIFIED — SW registered and active, `static-v2` cache present, offline reload still failed |
| B-3 | **No PWA manifest exists.** There is no `public/manifest.json` and no `app/manifest.ts`, so the app is not installable on iOS or Android home screen. | ✅ VERIFIED by full-file search |
| B-4 | **Offline edits are destroyed.** Adding an item while offline shows `Failed to add item` and the item vanishes, because the client rolls the optimistic update back on `fetch` failure. | ✅ VERIFIED in Chromium — `"Offline Bread" visible after offline add: false` |
| B-5 | **No local persistence of any kind.** `indexedDB.databases()` returned `[]`; shopping data exists only in React state. | ✅ VERIFIED in Chromium |
| B-6 | **Quantity input silently corrupts data.** Typing `2.5 kg` yields `25`, and `25` is what the server stores. `INTEGER_ONLY = /\D/g` strips every non-digit. | ✅ VERIFIED — field value `"25"`, server row `quantity: "25"` |
| B-7 | **Household collaboration requires a manual page reload.** An item added on device 2 never appeared on an open device 1 without navigation. There is no polling, no cache, no realtime. | ✅ VERIFIED in Chromium |
| B-8 | **Unit tests do not pass.** `pnpm test` → 6 failed / 123 passed / 1 skipped. All six are `onboarding.test.tsx` failing because `DarkModeToggle` calls `useTheme()` outside a `ThemeProvider`. | ✅ VERIFIED |
| B-9 | **Type-check does not pass.** `tsc --noEmit` → 9 errors, all in route test files. `next build` passes its own narrower check, so the gap is invisible in CI. | ✅ VERIFIED |
| B-10 | **No CI quality gate.** The single workflow (`.github/workflows/perf-audit.yml`) is bi-monthly + manual, runs no unit tests, no lint, and there is no `typecheck` script. | ✅ VERIFIED by full-file search |
| B-11 | **Deleting an item makes it unrecoverable, but clearing a completed item makes it recoverable.** `DELETE` sets `is_active = false`; history filters on `archived_at IS NOT NULL`. Two different delete mechanisms, one invisible to the user. | ✅ VERIFIED in source |
| B-12 | **`clear-completed` archives items regardless of concurrent activity**, and the SELECT/UPDATE race was flagged HIGH by review and never fixed. | ✅ VERIFIED — `.planning/phases/10-performance-optimizations/10-REVIEWS.md:22,132,142`; implementation at `src/server/services/items.ts:270-303` |
| B-13 | **Item-store replacement is not transactional.** `updateItem` deletes then re-inserts `item_stores` without a transaction, because the Neon HTTP driver throws on `db.transaction()`. A failure between the two leaves an item with no store tags. | ✅ VERIFIED — `drizzle-orm/neon-http/session.js:151-152` throws `"No transactions support in neon-http driver"` |
| B-14 | **Optimistic-update rollback can silently discard a concurrent edit.** `ShoppingList.tsx:380-392` captures the rollback snapshot by side effect inside a `setItems` updater; two in-flight edits on different items clobber each other. | ✅ VERIFIED in source |
| B-15 | **Deleting an item claims success before the request resolves.** `ItemRow.tsx:767-769` shows `Item removed` optimistically, then the failure path shows `Failed to delete item` — contradictory double feedback. | ✅ VERIFIED in source |
| B-16 | **The DB client is constructed at module load with a non-null assertion.** `src/db/index.ts:22` calls `neon(process.env.DATABASE_URL!)`; with no `DATABASE_URL` the whole build fails during page-data collection. | ✅ VERIFIED — `pnpm build` failed with `No database connection string was provided to neon()` |

### 2.3 Verified security defects

| # | Defect | Severity | Evidence |
| --- | --- | --- | --- |
| S-1 | **Any household member can mint a shareable join link.** `POST /api/households/join-links` calls `requireActiveOrganization` — membership, not admin — and then inserts directly, bypassing Better Auth entirely. The UI hides the button from non-admins (`HouseholdSettingsClient.tsx:368`) but the API does not enforce it. A plain member can therefore add arbitrary people to the household. | **High** | ✅ VERIFIED — plain member received HTTP 200 and a join URL |
| S-2 | **A plain member can invalidate the admin's join link.** `createJoinLink` deletes all of the household's existing links before inserting the new one, so S-1 is also a denial-of-capability against the admin. | Medium | ✅ VERIFIED — the original token then returned HTTP 404 `Invalid join link` |
| S-3 | **Authorization failures return HTTP 500 instead of 403.** `src/server/services/households.ts` maps only messages containing `not authorized` / `permission`; Better Auth's real message is *"You are not allowed to invite users to this organization"*, so it falls through to a 500. | Medium | ✅ VERIFIED — both non-admin invite and non-admin remove-member returned HTTP 500 |
| S-4 | **Unauthenticated disclosure endpoint.** `GET /api/invitation-email?id=…` performs no session check and returns the email address bound to any invitation id. | Medium | ✅ VERIFIED — HTTP 200 with no credentials |
| S-5 | **No database-level tenant isolation.** All isolation is an application-level `organization_id` predicate. It is applied consistently today (verified), but a single missed predicate would leak across households and no test would catch it. | Medium | ✅ VERIFIED by source review |
| S-6 | **`GET /api/admin/users` exposes every user's email** to a single `ADMIN_EMAIL` env var. No audit log, no rate limit. | Low | ✅ VERIFIED by source review |
| S-7 | **No rate limiting on application routes** (sign-up, invite, join-link creation). | Low | ✅ VERIFIED by source review |

---

## 3. Functional requirements

Requirements are numbered `FR-*`. `MUST` is binding.

### 3.1 Shopping list

| ID | Requirement |
| --- | --- |
| FR-01 | The user MUST be able to add an item with a name and an optional free-form quantity, note, category, and set of stores. |
| FR-02 | Quantity MUST accept free-form text (`2.5 kg`, `500 g`, `2 x 400 g`, `1 gallon`, `6`). Non-numeric characters MUST NOT be silently removed. |
| FR-03 | The user MUST be able to edit any field of an item, including its name, quantity, note, category, and store tags. |
| FR-04 | The user MUST be able to delete an item. |
| FR-05 | The user MUST be able to check and uncheck an item. |
| FR-06 | The user MUST be able to clear all checked items in one action. |
| FR-07 | The user MUST be able to view a history of cleared items and re-add them to the active list. |
| FR-08 | The user MUST be able to reorder the visible list by category, alphabetically, or by store. |
| FR-09 | The user MUST be able to filter the list to a single store, with untagged items always visible. |
| FR-10 | Deleted items MUST be recoverable for a retention window (see FR-31). |
| FR-11 | The user MUST see, at all times, whether there are unsynchronised changes and whether the app is online. |

### 3.2 Households and stores

| ID | Requirement |
| --- | --- |
| FR-12 | A user MUST be able to create a household and be its owner. |
| FR-13 | Only a household owner or admin MUST be able to invite members by email or mint a join link. |
| FR-14 | Only a household owner or admin MUST be able to remove a member. |
| FR-15 | A user MUST be able to belong to more than one household and switch between them. |
| FR-16 | A user MUST be able to add, rename, and delete stores. |
| FR-17 | Every household MUST have the default category set, seeded automatically. |

### 3.3 Offline behaviour

| ID | Requirement |
| --- | --- |
| FR-18 | The application MUST remain fully usable with no network connection for at least 7 days of continuous offline use. |
| FR-19 | Every write MUST be applied to local persistent storage and MUST be visible in the UI without a network round-trip. |
| FR-20 | A write MUST survive a page reload, an app restart, and a browser restart. |
| FR-21 | Writes MUST be queued and synchronised automatically when connectivity returns. |
| FR-22 | The same write MUST NOT be applied twice, however many times it is submitted or retried. |
| FR-23 | Concurrent edits MUST converge deterministically. A losing edit MUST NOT be silently discarded — it MUST be surfaced to the user. |
| FR-24 | A deleted item MUST NOT be resurrected by a stale device reconnecting later. |
| FR-25 | The application MUST be installable on iOS and Android where the platform permits it. |
| FR-26 | The application MUST launch and show the household's list with no network connection. |
| FR-27 | A destructive bulk action MUST NOT destroy changes made on another device while the acting device was offline. |

### 3.4 Account and session

| ID | Requirement |
| --- | --- |
| FR-28 | Sign-up, sign-in, sign-out, and session persistence MUST work as today. |
| FR-29 | The user MUST be able to sign out with unsynchronised changes and MUST be told what will happen to them before doing so. |
| FR-30 | An expired session MUST NOT destroy locally stored data. |
| FR-31 | Deleted items and tombstones MUST be retained server-side for at least 90 days so that a long-offline device cannot resurrect them. |

---

## 4. Offline-first requirements and invariants

These are the hard guarantees of the recovered system. Every one is testable and
must have an automated test (§16).

### 4.1 Invariants

| ID | Invariant | Verified by |
| --- | --- | --- |
| **INV-01** | No user interaction awaits a network request. No `await fetch(...)` appears in any component's event handler. | Static lint rule + component tests |
| **INV-02** | A committed edit is durable in IndexedDB **before** the UI acknowledges it. | IndexedDB-backed component test with a blocked network |
| **INV-03** | The local write and the enqueue of its operation happen in **one** IndexedDB transaction. Either both land or neither does. | Transaction-failure injection test |
| **INV-04** | A queued operation is never dropped silently. It is either acknowledged by the server, or it remains visible as pending, or it is surfaced as a rejected conflict the user can act on. | Outbox-integrity test after forced failure |
| **INV-05** | Only the sync engine talks to the server for domain data. No component calls `fetch` for items, categories, or stores. | Static lint rule |
| **INV-06** | Every read of shopping data is served from IndexedDB. | Static lint rule + component test |
| **INV-07** | Deletion is a tombstone. Only an explicit, later restore operation clears it. | Resurrection test |
| **INV-08** | Every operation carries a globally unique `opId`; the server deduplicates on it. | Idempotency test |
| **INV-09** | Queues, tombstones, and cached snapshots are partitioned by household. Switching households never mixes data. | Household-switch test |
| **INV-10** | The application shell is served from cache when the network is unavailable; the list renders from IndexedDB. | Offline E2E test |
| **INV-11** | A local database schema upgrade preserves all unsynchronised operations. | Migration test |
| **INV-12** | The server never accepts a write that it cannot atomically record in its change log. | Server-side atomicity test |

### 4.2 Operations that require a server connection

| Operation | Offline? | Reason |
| --- | --- | --- |
| Sign up / sign in / sign out | **No** | Credential verification is inherently server-side. |
| Create a household | **No** | The household is a server-side tenant. |
| Accept an email invitation | **No** | The invitation must be redeemed server-side. |
| Redeem a join link | **No** | Membership must be granted server-side. |
| Accept or decline an invitation / change member roles | **No** | Permission changes are server-side. |
| Add / rename / delete a **store** | **Yes**, but reconciled later | Store names are household-scoped and rarely conflict; queued as an operation. |
| Add / edit / check / delete an **item** | **Yes** | Fully local-first. |
| Clear completed items | **Yes**, guarded | Queued as a bulk operation with a base-version guard (§11). |
| Category creation / rename | **Yes** | Queued; duplicate-name conflicts are surfaced. |
| Reading the list | **Yes** | From IndexedDB. |
| Sync | Requires connectivity | Triggered automatically when connectivity returns. |

**Rule:** *creating a household, authenticating, and changing permissions are the
only operations that are impossible offline.* Everything a shopper does in an
aisle is offline-capable.

---

## 5. Real-world offline scenarios

Every scenario below states **expected user behaviour**, **technical handling**,
and **testable acceptance criteria**. The identifiers `SC-01 … SC-18` are
referenced by name in the test suite (§16.3) and in the roadmap.

Which operations can never work offline is settled in §4.2: only **account
creation, initial authentication, invitation acceptance, join-link redemption,
and permission changes** require a server. Everything a shopper does in an
aisle is offline-capable.

---

### SC-01 — Opening the list with no internet access

**Expected behaviour.** The app opens to the household's list exactly as it was
when the device was last online. No error page, no spinner longer than 300 ms,
no connectivity complaint. If the household has never been downloaded on this
device, the app says so plainly rather than showing an empty list that would be
indistinguishable from "there is nothing to buy".

**Technical handling.** The service worker serves the cached static shell for
the navigation (network-first, cached fallback). The client reads items from
IndexedDB through a reactive query. The sync engine starts, detects no
connectivity, and sets the status chip to `Offline — N changes pending`. No
component issues a domain-data network request (INV-01, INV-05, INV-06).

**Acceptance criteria.**
- With the network disabled, a cold browser context renders the list with the
  item names present.
- No browser error page is shown; no unhandled request failure reaches the user.
- The status chip reads `Offline`.
- For a household never downloaded on this device, the text *"This household
  hasn't been downloaded on this device yet. Connect to download it."* is shown —
  **not** an empty list.

---

### SC-02 — Creating, editing, checking, and deleting items offline

**Expected behaviour.** All four operations behave exactly as they do online.
Each change is visible immediately. Nothing is lost and nothing is reported as
failed.

**Technical handling.** Each operation is applied to IndexedDB and enqueued in
the **same** transaction (INV-03). The UI updates from the reactive query. The
operation carries a unique `opId`, the `baseVersion` it was edited from, and the
client's `lamport`. A delete writes a **tombstone**; it does not remove the row
(INV-07).

**Acceptance criteria.**
- With the network blocked, add / edit / check / delete each update the rendered
  list within 100 ms.
- The outbox contains exactly one operation per action, each with a unique
  `opId`.
- **No error toast is shown for any of the four actions** — this is the exact
  defect in the current build (verified: `Failed to add item`).
- After a reload, all four changes are still present.

---

### SC-03 — Two household members edit the same item while disconnected

**Expected behaviour.** When the two devices reconnect, the two edits are
reconciled deterministically. The later edit wins for the contested field, and
**the losing edit is shown to the user** rather than disappearing.

**Technical handling.** Each operation carries the `baseVersion` the editor saw.
The server compares it against the row's current `version` and `field_meta`. A
field whose version has moved on is a **concurrent edit**: the winner is decided
by `(lamport, deviceId)`, and the loser's value is written to
`entity_conflicts` and returned to the losing device in the sync response.

**Acceptance criteria.**
- Two devices edit the same field offline; after reconnect both show the same
  value, and that value is the one with the higher `(lamport, deviceId)`.
- The losing value is retrievable in the "Needs attention" panel with both
  values shown.
- "Keep mine" re-queues the losing value with a fresh `lamport`, and it then
  wins.
- The same scenario replayed three times produces the same winner — the
  resolution is deterministic, not arbitrary.

---

### SC-04 — One user checks an item while another edits its quantity

**Expected behaviour.** Both changes stand. The item ends up **checked** with
the edited quantity. A shopper's "I got this" is never undone by someone
else's unrelated edit.

**Technical handling.** `isChecked` uses the **check-wins** rule (§11): an
uncheck whose `baseVersion` predates a *different* device's check does not clear
the check. `quantity` uses field-level LWW and is uncontested here, because the
two devices touched different fields — so neither is even in conflict.

**Acceptance criteria.**
- Device A checks the item; device B changes the quantity from an older base.
- After reconnect: `isChecked === true` and the quantity is B's value.
- **No conflict entry is raised**, because no field was contested.

---

### SC-05 — One user deletes an item while another modifies it

**Expected behaviour.** The item stays deleted. The other user's modification is
not applied to a deleted row, and is not silently thrown away — it is shown to
that user as "this item was deleted on another device".

**Technical handling.** The delete writes a tombstone (`deleted_at`) and is
**terminal** (§11): only a strictly later `restore` operation clears it. The
concurrent edit is recorded as a conflict against a deleted entity and surfaced
to the editing device.

**Acceptance criteria.**
- Device A deletes; device B edits the quantity. After reconnect the item is
  absent from both devices' lists.
- Device B shows a conflict entry naming the item and explaining the deletion.
- A device that has been offline for 7 days and still holds the pre-delete copy
  does **not** resurrect the item (FR-24, INV-07).

---

### SC-06 — Multiple devices add the same product independently

**Expected behaviour.** Both items exist. The household sees two entries of
"Milk" rather than one merged entry — merging would silently discard one
person's intent (a different quantity, a different store, or a different
member's item).

**Technical handling.** Each device generates its own UUIDv7 id, so the two
creates are different entities and both are applied. No automatic de-duplication
is performed. A future "these look like the same item" *suggestion* is a UI
addition that does not change the data model (§17).

**Acceptance criteria.**
- Two devices add "Milk" offline; after reconnect both devices show two "Milk"
  entries.
- The two entries have different ids and are independently editable and
  deletable.
- Neither create is reported as a conflict.

---

### SC-07 — A device remains offline for several days

**Expected behaviour.** The device keeps working normally the whole time. When
it reconnects, everything that happened elsewhere arrives, and everything that
happened on the device is pushed. Nothing is lost in either direction.

**Technical handling.** The outbox holds every operation with its original
`lamport`. On reconnect the device pushes its outbox, then pulls every change
since its `lastSeq`. If the device's `lastSeq` is older than the change-log
retention window (90 days), the server returns `fullResyncRequired` and the
client rebuilds its local tables and **replays its outbox afterwards**
(INV-11, §10.6).

**Acceptance criteria.**
- The device can be offline for 7 simulated days with no loss and no degraded
  behaviour.
- On reconnect, all changes from both directions are present.
- With `lastSeq` forced below the retention floor, the device re-bootstraps and
  its own pending operations are **still applied** afterwards.

---

### SC-08 — Synchronisation is interrupted halfway through

**Expected behaviour.** Nothing is lost and nothing is applied twice. The
status chip shows the pending count; the interruption is invisible to the user
unless it persists.

**Technical handling.** The engine retries with exponential backoff and jitter
(1 s → 30 s cap). An operation in `inflight` that never receives a response is
retried with the **same `opId`**, so the server recognises it as a duplicate and
returns the original result without re-applying it. A batch is re-sent whole;
already-acknowledged members are duplicates, the remainder is applied.

**Acceptance criteria.**
- The `/api/sync` response is aborted after the server has applied the batch.
  After the retry, the state is correct and **each operation was applied once**.
- The outbox is never left empty while an operation was actually rejected.
- The final server state equals the state produced by the uninterrupted run.

---

### SC-09 — The same mutation is submitted multiple times

**Expected behaviour.** The user sees no duplication. A double-tap on "Add"
creates one item, not two.

**Technical handling.** `opId` is the idempotency key. The server inserts into
`sync_operations`, whose **primary key is `op_id`**; a duplicate insert fails
and the server returns the cached `result` with `duplicate: true`. The client
generates a fresh `opId` per user action, so two genuine "Add" taps are two
genuine operations — the protection is against *retransmission*, not against
the user pressing the button twice. The client's button is additionally disabled
while the action is in flight.

**Acceptance criteria.**
- The same `opId` submitted 10 times applies exactly one change.
- Responses 2–10 carry `duplicate: true` and an identical `result`.
- A repeated *batch* after a timeout applies only the unacknowledged remainder.

---

### SC-10 — The application is closed before pending changes synchronize

**Expected behaviour.** The changes are still there when the user comes back.

**Technical handling.** Every operation is durable in the IndexedDB outbox
before the UI acknowledges the edit (INV-02). Closing the app does not touch
the outbox. On next launch the engine reads the outbox and resumes.

**Acceptance criteria.**
- Make an edit offline, close the browser entirely, reopen, and the edit is
  present.
- The outbox still holds the operation with its original `opId`.
- On reconnect, the operation is pushed exactly once.

---

### SC-11 — A user signs out with unsynchronised changes

**Expected behaviour.** The user is told exactly what will happen and given a
choice. Signing out never silently discards their work.

**Technical handling.** Sign-out is intercepted when the outbox is non-empty.
The dialog offers **Sync now** (recommended), **Sign out and keep a copy**
(writes a JSON export to the device), and **Sign out and discard** (explicitly
destructive). The local database is cleared on sign-out unless the user chose to
keep a copy (SEC-07).

**Acceptance criteria.**
- Signing out with a pending outbox shows the dialog and states the number of
  pending changes.
- "Sign out and keep a copy" produces a download containing the pending
  operations, and the local database is then cleared.
- "Sign out and discard" removes the outbox only after explicit confirmation.

---

### SC-12 — A user switches households while offline

**Expected behaviour.** Switching to a household already on the device is
instant and works offline. Switching to one that is not on the device explains
that it needs a connection. Pending work for the household being left is never
lost.

**Technical handling.** The outbox, the local tables, and the tombstones are all
partitioned by `household_id` (INV-09). The local switch is a change of the
active partition. The server-side `activeOrganizationId` is updated on the next
successful sync.

**Acceptance criteria.**
- Switching offline to a cached household renders that household's list.
- The other household's pending operations are still in the outbox afterwards.
- Switching to an uncached household shows the "not downloaded on this device"
  message and **does not** show an empty list.

---

### SC-13 — Authentication expires while offline

**Expected behaviour.** The app keeps working. The user sees `Sign in to sync`
and can keep shopping. Local data is never destroyed because a token expired.

**Technical handling.** The session cookie is validated server-side on every
request. Offline, the client uses the cached session record **for display
only**. On reconnect, a 401 puts the client into a "sign in to sync" state while
the outbox is preserved intact. The local database is not cleared.

**Acceptance criteria.**
- With the session expired and the network off, the list still renders and
  mutations still work.
- The status chip reads `Sign in to sync`.
- After signing in, the outbox is pushed and the chip returns to `Up to date`.
- The local database was not cleared at any point.

---

### SC-14 — The server rejects a locally accepted change

**Expected behaviour.** The user is told, in plain language, which item was
rejected and why, and what they can do about it. The change is not silently
dropped and the local list does not silently diverge from the server.

**Technical handling.** A `4xx` response moves the operation out of the retry
loop into `state = "blocked"` and raises a conflict entry (INV-04). The local
record is marked so the UI can badge it. A `5xx` or a network error is
transient and is retried.

**Acceptance criteria.**
- A rejected operation produces a toast naming the item and a persistent entry
  in "Needs attention".
- The outbox retains the blocked operation — it is not deleted.
- A transient `500` is retried and eventually succeeds without user action.
- After a rejection, the UI clearly distinguishes the local state from the
  server state.

---

### SC-15 — The browser storage quota is reached, or local data is unavailable

**Expected behaviour.** The user is told immediately and unambiguously that
changes cannot be saved, and is offered a way to get their data out. The app
never pretends to have saved something it did not save.

**Technical handling.** `QuotaExceededError` from an IndexedDB write is caught
at the repository boundary. The UI shows a blocking banner and **disables
further writes** rather than accepting them and losing them. Mitigation options
are offered: prune archived items and old tombstones, or export to a file. If
IndexedDB is entirely unavailable (private browsing, a blocked third-party
context), the app runs read-only with a clear explanation.

**Acceptance criteria.**
- A simulated quota error produces a visible banner and no silent data loss.
- The write is **not** reported as successful.
- The export produces a complete JSON copy of the local list and outbox.

---

### SC-16 — An application update changes the local data schema

**Expected behaviour.** The update applies silently. Pending changes survive.
The user is never shown a broken or empty list because the app was updated.

**Technical handling.** The Dexie schema is versioned; each version has an
explicit `upgrade` hook that transforms records forward. The upgrade hook
**preserves every outbox row** (INV-11). If the upgrade changes the meaning of
a field, the client sets a flag so the next sync performs a full re-bootstrap
after the upgrade. The service worker shows a "new version available — reload"
prompt rather than reloading mid-edit.

**Acceptance criteria.**
- A local schema v1 → v2 upgrade transforms items correctly.
- The outbox is byte-identical before and after the upgrade.
- An app update while a dialog is open does not discard the in-progress edit.
- After the upgrade the list still renders and the next sync succeeds.

---

### SC-17 — An existing online user upgrades to the offline-first version

**Expected behaviour.** The user's list appears exactly as it was, within about
a second. Nothing is lost, and nothing is migrated on their device.

**Technical handling.** The current application keeps no client-side data, so
there is nothing to migrate. On first load the local database is empty; the
client performs a full bootstrap sync (`lastSeq = 0`), which returns the
household's whole snapshot, and writes it to IndexedDB before the first list
render. The server rows are untouched; their existing UUIDs remain valid
client-generated ids (§9.1).

**Acceptance criteria.**
- A household seeded with legacy data is reproduced **exactly** after the
  upgrade — same items, quantities, categories, store tags, and check states.
- The first list render occurs within 2 s of the first load.
- No existing server row is modified by the upgrade.

---

### SC-18 — A destructive bulk operation runs while another device has pending edits

**Expected behaviour.** The bulk operation does not destroy the other device's
work. Items changed elsewhere since the bulk action began are skipped, and the
user is told how many were skipped.

**Technical handling.** "Clear completed" is queued as a bulk operation
carrying the `baseVersion` the user was looking at. On the server, it archives
only items that are checked **and** whose `version` does not exceed that base
version (§11). Items another device changed in the meantime are skipped, and
the count is returned in the sync response.

**Acceptance criteria.**
- Device A clears completed items offline; device B unchecks an item and
  changes its quantity. After reconnect, B's item is **not** archived.
- The response reports the number of skipped items, and A is told.
- Items that were checked and unchanged by anyone else **are** archived.
- No item is lost from either device.

---

## 6. Expected user experience

### 6.1 The in-store journey (the primary journey)

1. The shopper opens the app. The list appears **immediately** from local storage
   — no spinner, no network wait, even with no signal.
2. A persistent status chip in the header shows one of:
   - `Up to date` (neutral) — nothing pending.
   - `Syncing…` (neutral) — a sync is in flight.
   - `N changes pending` (warning) — queued edits are waiting for a connection.
   - `Offline — N changes pending` (warning) — no connection.
   - `Sign in to sync` (danger) — the session expired; local data is still safe.
3. The shopper adds items. Each appears instantly and stays on screen.
4. The shopper ticks items off. Ticks appear instantly.
5. The shopper closes the app. Nothing is lost.
6. Later, on a connection, the app syncs silently in the background.

### 6.2 Feedback rules

| Situation | Required feedback |
| --- | --- |
| An edit is committed locally | **No** toast. The change is already visible. |
| An edit is queued (offline) | **No** toast. The pending-count chip updates. |
| A sync succeeds | **No** toast. The chip returns to `Up to date`. |
| A sync fails transiently | **No** modal. The chip shows `N changes pending`. Retries are silent and backed off. |
| An operation is rejected by the server (e.g. its category was deleted) | **Yes** — a toast naming the item, plus a persistent entry in a "Needs attention" list. |
| Two devices edited the same field | **Yes** — a conflict entry showing both values with the winner, and a one-tap choice to keep yours. |
| Storage is unavailable or full | **Yes** — a blocking banner explaining that changes cannot be saved, with an explicit export option. |
| The session expired while offline | **Yes** — a banner: `Sign in to sync. Your list is safe on this device.` |

### 6.3 Explicitly forbidden UX

- ❌ A toast that says `Failed to add item` when the item was actually added locally.
- ❌ A spinner that blocks the list because the network is slow.
- ❌ A destructive action that completes with no confirmation of what it affected.
- ❌ A `window.confirm` dialog (unstyleable, blocking, untestable). Replace with the
  existing `AlertDialog` component — `window.confirm` is used at
  `ShoppingList.tsx:489` and must be replaced.

### 6.4 Mobile requirements (mobile Safari and Chrome)

- Minimum touch target **44 × 44 px** — the project's own research flags sub-44px
  targets as a documented grocery-aisle hazard (`.planning/research/PITFALLS.md:82-100`).
- The quick-add row must not overflow a 375 px viewport. The current row
  (name input + 80 px quantity + 112 px store select + Add button) leaves the name
  field roughly 90 px wide on an iPhone 13 — the item-name input, the most-used
  control, is the most cramped. 📋 **SPEC**: the quick-add bar collapses to a
  single full-width row with an expandable options sheet.
- Respect `env(safe-area-inset-*)` for the sticky quick-add bar and the bottom
  organization bar.
- `viewport-fit=cover` plus `apple-mobile-web-app-capable` meta so an installed
  PWA uses the full screen.

---

## 7. Technical architecture

### 7.1 Overview

```
┌───────────────────────────────────────────────────────────────────────┐
│ BROWSER  (installable PWA)                                            │
│                                                                       │
│  ┌─────────────────────────────────────────────────────────────────┐  │
│  │ Application shell  (static HTML + JS, cached by Service Worker) │  │
│  └─────────────────────────────────────────────────────────────────┘  │
│                                                                       │
│  ┌───────────────────────┐        ┌───────────────────────────────┐  │
│  │ React UI              │◄──────►│ Repository layer              │  │
│  │ (ShoppingList, etc.)  │        │  - local CRUD                 │  │
│  └───────────────────────┘        │  - enqueue operation          │  │
│           ▲                       │  (one IndexedDB transaction)   │  │
│           │ useLiveQuery          └───────────────┬───────────────┘  │
│           │                                       │                  │
│  ┌────────┴────────┐                 ┌────────────▼───────────────┐  │
│  │ Dexie (IndexedDB)│                │ Outbox (operation queue)    │  │
│  │  items, stores,  │                │  opId, type, payload,        │  │
│  │  categories,     │                │  lamport, baseVersion, state │  │
│  │  meta, conflicts │                └────────────┬───────────────┘  │
│  └─────────────────┘                             │                  │
│                                    ┌──────────────▼───────────────┐  │
│                                    │ Sync engine (plain TS class) │  │
│                                    │  - push batch / pull batch   │  │
│                                    │  - retry with backoff        │  │
│                                    │  - idempotency               │  │
│                                    └──────────────┬───────────────┘  │
└───────────────────────────────────────────────────┼───────────────────┘
                                                    │ HTTPS, cookie auth
┌───────────────────────────────────────────────────▼───────────────────┐
│ SERVER  (Next.js 16 App Router on Vercel)                            │
│                                                                       │
│  /dashboard /history /settings  →  static shells (no data)            │
│  /api/auth/*                    →  Better Auth                        │
│  /api/sync                      →  sync endpoint (push + pull)        │
│  /api/categories /stores        →  household-scoped CRUD              │
│                                                                       │
│  ┌─────────────────────────────────────────────────────────────────┐  │
│  │ Application layer: sync apply, conflict resolution, authz      │  │
│  └─────────────────────────────────────────────────────────────────┘  │
│  ┌─────────────────────────────────────────────────────────────────┐  │
│  │ PostgreSQL (Neon) via Drizzle                                    │  │
│  │  items, stores, categories, item_stores                        │  │
│  │  sync_operations, sync_changes, devices, entity_conflicts      │  │
│  └─────────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────────────┘
```

### 7.2 Stack decisions

| Layer | Technology | Change? | Rationale |
| --- | --- | --- | --- |
| Framework | Next.js 16 App Router | **Retain** | Already in use; provides the API routes, the static shell, and the deployment target. A rewrite would buy nothing. |
| UI | React 19, Tailwind v4, shadcn/ui | **Retain** | The design system is polished and consistent. |
| Auth | Better Auth 1.5 (email/password + organization plugin) | **Retain** | Handles sessions, organizations, invitations. Reimplementing it would be a large, risky, low-value change. |
| ORM | Drizzle 0.45 | **Retain** | Typed, idiomatic, already used well. |
| Database | PostgreSQL (Neon) | **Retain** | Relational model is a good fit for the domain. |
| Server validation | Zod 4 | **Retain** | Already used consistently at every route boundary. |
| **Local persistence** | **IndexedDB via Dexie 4** | **New** | Required. See §7.3. |
| **Reactive reads** | **dexie-react-hooks `useLiveQuery`** | **New** | Required. See §7.3. |
| **Service worker** | **Hand-written (rewrite of `public/sw.js`)** | **Rewrite** | The current one caches only static assets. Needs navigation fallback, shell caching, and update handling. |
| **Sync** | **Hand-written sync engine** | **New** | Required. See §10. |
| Background Sync API | **Not used** | — | Unreliable on iOS Safari; explicitly excluded by requirement. |

### 7.3 Why IndexedDB, and why Dexie

**Why IndexedDB.** The requirement is "persistent local database" holding
structured shopping data that survives restarts. The alternatives fail:

| Option | Verdict |
| --- | --- |
| `localStorage` | Rejected. Synchronous, string-only, ~5–10 MB quota, and every read/write blocks the main thread. The project's existing `localStorage` use is correctly limited to UI *preferences*. |
| `sessionStorage` | Rejected. Cleared on tab close — violates FR-20. |
| Cache Storage API | Rejected. Designed for `Request`/`Response` pairs, not queryable records. |
| SQLite via WASM | Rejected. Adds a large WASM payload and OPFS dependency for no benefit at household scale. |
| **IndexedDB** | **Selected.** Asynchronous, structured, transactional, indexed, and universally supported on iOS Safari (since iOS 10) and Chrome. |

**Why Dexie rather than the raw API or `idb`.** The requirement explicitly
includes *"handle application updates and local database migrations safely"*.
Dexie provides exactly that with a declarative, versioned schema and an
`upgrade(tx => …)` migration hook:

```ts
db.version(1).stores({ items: "id, householdId, [householdId+deletedAt]", … });
db.version(2).stores({ … }).upgrade(async (tx) => { /* transform v1 rows */ });
```

`idb` is a thin promise wrapper with **no** schema-versioning or migration
support; adding that means hand-writing the migration machinery anyway.
Dexie's reactive query hook (`useLiveQuery`) also removes the need for a
hand-rolled store/subscription layer, which the existing `useSyncExternalStore`
+ `localStorage` pattern (`ShoppingList.tsx:119-131`) would otherwise have to
grow into.

**Cost:** two small dependencies (`dexie`, `dexie-react-hooks`). This is
justified against the requirement set; it is not speculative.

### 7.4 The data-ownership inversion (the core change)

Today the server owns the data and the client is a thin view:

```
TODAY:  Browser ──fetch──► Server ──► Postgres        (client has nothing)
        Browser ◄──HTML─── Server (SSR with the data)  (no local copy)

AFTER:  Browser ──IndexedDB──► local store  (client OWNS the data)
        Browser ◄──sync────── Server ◄──► Postgres        (server is a replica)
```

This inversion is what makes the application offline-capable, and it is why
**refactoring the current code in place is not sufficient** — the direction of
data flow is a property of the architecture, not of a function body.

Consequences that must be accepted deliberately:

1. **The shopping surface becomes client-rendered.** The dashboard route must not
   fetch data server-side. This costs the SSR fast-path for the item list and
   must be measured (see §15 and the plan's performance checkpoint).
2. **The app pages become static shells.** `src/app/(app)/layout.tsx` currently
   calls `getRequestSession()` and redirects — a server round trip that cannot
   succeed offline. The layout becomes a pure shell; authentication moves to a
   client-side gate, and the server continues to enforce authorization on every
   API call. Because the shells contain no user data, moving the redirect to the
   client leaks nothing.
3. **Reads become reactive.** Components read from Dexie via `useLiveQuery`
   rather than receiving props from a Server Component.

---

## 8. Local data model (IndexedDB)

### 8.1 Object stores

```
db.version(1).stores({
  items:      "id, householdId, [householdId+deletedAt], name, updatedAt",
  categories: "id, householdId, name",
  stores:     "id, householdId, name",
  outbox:     "opId, householdId, state, createdAt",
  conflicts:  "id, householdId, entityId, createdAt",
  meta:       "key",
});
```

### 8.2 Record shapes

```ts
type LocalItem = {
  id: string;              // UUIDv7, client-generated
  householdId: string;
  name: string;
  quantity: string | null; // free-form text
  note: string | null;
  categoryId: string | null;
  storeIds: string[];
  isChecked: boolean;
  deletedAt: number | null;   // local tombstone (epoch ms)
  archivedAt: number | null;  // cleared-from-list, recoverable
  version: number;            // server version last seen
  updatedAt: number;
  updatedBy: string | null;   // userId of last editor
  lamport: number;            // ordering clock last applied to this row
  pending: boolean;           // has unsynchronised local changes
};

type OutboxOp = {
  opId: string;              // UUIDv7, globally unique
  householdId: string;
  entityType: "item" | "category" | "store";
  entityId: string;
  type: "create" | "update" | "delete" | "restore" | "archive" | "bulkArchive";
  baseVersion: number;       // server version the client believed it was editing
  lamport: number;           // client's Lamport counter for this household
  payload: Record<string, unknown>;
  state: "pending" | "inflight" | "failed" | "blocked";
  attempts: number;
  lastError: string | null;
  createdAt: number;
};
```

### 8.3 Why UUIDv7 for client-generated ids

- The client must be able to create a record offline and know its final id
  before the server has seen it. The server therefore **accepts client-supplied
  ids**. 📋 **SPEC**
- UUIDv7 is **time-ordered**: it sorts by creation time, which makes the local
  store's natural ordering match insertion order and keeps IndexedDB index
  locality good. It is also a standard UUID, so it fits the existing `uuid`
  column type with no schema change. 📋 **SPEC**
- Existing rows keep their v4 UUIDs. Nothing is rewritten. 📋 **SPEC**

### 8.4 Local schema evolution

`db.version(N)` with an explicit `upgrade` hook. The `meta` store records
`localSchemaVersion` and `appVersion`. The upgrade path must:

1. transform records forward,
2. **preserve every row in `outbox`** (INV-11) — an upgrade must never discard
   unsynchronised work,
3. set a flag so the next sync performs a full re-bootstrap if the upgrade
   changed the meaning of a field.

---

## 9. Server data model (PostgreSQL)

### 9.1 Changes to existing tables

**`items`** — additive only, no destructive change:

| Column | Type | Purpose |
| --- | --- | --- |
| `id` | `uuid` PK | Unchanged type; the server now accepts client-supplied values. |
| `deleted_at` | `timestamptz` nullable | **Tombstone.** `NULL` = live. Set on delete; cleared only by an explicit restore. |
| `version` | `integer` not null default 1 | Incremented on every server-applied change. The client's `baseVersion` is checked against it. |
| `field_meta` | `jsonb` not null default `'{}'` | Per-field write metadata: `{"name": {"v": 4, "lamport": 12, "device": "d-…"}}`. Enables per-field conflict resolution without a separate table. |
| `updated_by` | `text` nullable → `user.id` | Who last changed the row. |
| `lamport` | `bigint` not null default 0 | Highest Lamport value applied to this row. |

`is_active` is **retained but deprecated**; it is kept in step with `deleted_at`
for one release and removed in a later migration. This avoids a risky
single-step rewrite.

`archived_at` keeps its existing meaning: *cleared from the list, recoverable
from History*. It is orthogonal to `deleted_at` (*deleted, tombstoned*).
The current code conflates the two (defect B-11); 📋 **SPEC** separates them.

**`stores`, `categories`** — additive only:
`version integer not null default 1`, `field_meta jsonb not null default '{}'`,
`updated_by text nullable`.

### 9.2 New tables

```sql
-- Append-only log of every applied change, per household.
CREATE TABLE sync_changes (
  seq          bigserial PRIMARY KEY,     -- global, monotonic; filter by household
  household_id text NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  entity_type  text NOT NULL,             -- 'item' | 'category' | 'store'
  entity_id    uuid NOT NULL,
  op_id        uuid NOT NULL,             -- the operation that caused it
  version      integer NOT NULL,
  lamport      bigint NOT NULL,
  device_id    text NOT NULL,
  actor_id     text NOT NULL,
  payload      jsonb NOT NULL,            -- full entity snapshot after the change
  deleted      boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sync_changes_household_seq ON sync_changes (household_id, seq);

-- Idempotency ledger. The primary key IS the idempotency guarantee.
CREATE TABLE sync_operations (
  op_id        uuid PRIMARY KEY,
  household_id text NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  device_id    text NOT NULL,
  actor_id     text NOT NULL,
  entity_type  text NOT NULL,
  entity_id    uuid NOT NULL,
  op_type      text NOT NULL,
  lamport      bigint NOT NULL,
  payload      jsonb NOT NULL,
  result       jsonb NOT NULL,            -- cached response for replay
  applied_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sync_operations_household ON sync_operations (household_id, applied_at);

-- Known devices per household (device id, name, last seen).
CREATE TABLE devices (
  id           uuid PRIMARY KEY,
  household_id text NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  name         text NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Conflicts the server resolved, surfaced to the losing device.
CREATE TABLE entity_conflicts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id text NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  entity_type  text NOT NULL,
  entity_id    uuid NOT NULL,
  field        text NOT NULL,
  local_value  jsonb,
  server_value jsonb,
  winner       text NOT NULL,             -- 'server' | 'client'
  op_id        uuid NOT NULL,
  device_id    text NOT NULL,
  resolved_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
```

### 9.3 Rationale for a server-side change log

Deriving changes from `items.updated_at` is unreliable: two changes in the same
millisecond are unordered, clock skew between the server and the client makes
comparison ambiguous, and `updated_at` cannot express *what changed*. A
monotonic `bigserial` per change is cheap, gives a total order, supports
incremental pull with a single indexed range scan, and doubles as an audit trail
of who changed what and when.

**Retention.** `sync_changes` rows are pruned after a window (90 days,
matching FR-31). A client whose `lastSeq` predates the oldest retained `seq` for
its household receives `fullResyncRequired: true` and re-bootstraps. Local
unsynchronised operations are preserved and replayed after the snapshot
(INV-11, scenario 17).

### 9.4 Migration safety

All migrations are **additive**: new nullable columns with defaults, new tables,
new indexes. No column is dropped and no row is rewritten in the same release
that introduces the sync model. `is_active` → `deleted_at` backfill is a single
separate migration that sets `deleted_at = now()` where `is_active = false`.

---

## 10. Synchronization protocol and lifecycle

### 10.1 Endpoint

`POST /api/sync` — a single endpoint that both pushes and pulls, so a sync
cycle is one round trip.

**Ordering is normative: the server applies the pushed operations first, then
computes the pull.** This is not an implementation detail — it is a correctness
requirement. The client sends operations derived from a version of the world it
has seen; if the pull were computed first, a client's own operation would be
resolved against a version it never saw. Pushing first means the server
resolves the client's operation against the state the client actually knew
about, and the pull that follows includes the outcome of that operation.

**Request**

```jsonc
{
  "householdId": "org_abc",
  "deviceId": "uuid-v7-of-this-browser-install",
  "lastSeq": 1042,              // highest seq this client has applied
  "clientClock": 87,            // client's current Lamport counter
  "operations": [
    {
      "opId": "uuid-v7",        // globally unique; the idempotency key
      "entityType": "item",
      "entityId": "uuid-v7",
      "type": "item.update",    // one of the operation types in §10.1a
      "baseVersion": 12,        // server version the client edited from
      "lamport": 88,
      "payload": { "quantity": "2 kg", "name": "Milk" },
      "createdAt": 1789000000000
    }
  ]
}
```

**Response**

Every operation lands in exactly one of three buckets — `applied`,
`duplicates`, or `rejected` — and **every bucket carries the same envelope**
so the client never has to special-case one of them:

```jsonc
{
  "acknowledged": ["uuid-v7"],   // opIds now durably applied (not duplicates)
  "duplicates":   ["uuid-v7"],   // already applied earlier — cached result replayed
  "rejected": [
    { "opId": "…", "entityType": "item", "entityId": "…",
      "code": "VERSION_CONFLICT", "reason": "quantity was changed on another device",
      "conflicts": [
        { "field": "quantity", "localValue": "2 kg", "serverValue": "3 kg", "winner": "server" }
      ] }
  ],
  "applied": [
    { "opId": "…", "entityType": "item", "entityId": "…",
      "outcome": "applied",      // "applied" | "partially_applied"
      "result": { /* entity after apply */ },
      "conflicts": [] }          // conflicts on fields this op LOST but that still applied
  ],
  "changes": [
    { "seq": 1043, "entityType": "item", "entity": { /* full snapshot */ },
      "deleted": false, "version": 13, "updatedBy": "user_x", "updatedAt": "…" }
  ],
  "nextSeq": 1043,
  "serverClock": 91,
  "fullResyncRequired": false
}
```

**The losing path carries its conflict detail.** This is the point most easily
got wrong: an operation that *loses* a field is not "applied" — it is rejected
— so if `conflicts[]` lived only on `applied[]`, the loser would never see the
server's value, and the "Keep mine / Use theirs / Dismiss" presentation in
§11.2 would have no data to render. `rejected[]` therefore carries the same
optional `conflicts[]` array, plus `entityType` and `entityId`, as `applied[]`.

**Per-field outcomes.** An operation touching several fields can partially
succeed — for example, a `quantity` edit that loses a concurrent change while
its `name` edit succeeds cleanly. In that case the operation is reported as
`applied` with `outcome: "partially_applied"`, and the lost field appears in
its `conflicts[]` with `winner: "server"`. A rejected operation changed nothing
at all.

### 10.1a Operation types (authoritative enumeration)

This table is the single source of truth. The `type` field of an operation is
exactly one of these strings, and §11's conflict rules are keyed to them.

| `type` | Entity | Payload | Conflict rule (§11) |
| --- | --- | --- | --- |
| `item.create` | item | `name`, `quantity`, `note`, `categoryId`, `storeIds` | Server accepts the client id; idempotent on `opId`. |
| `item.update` | item | any of `name`, `quantity`, `note`, `categoryId` | Field-level LWW by `(lamport, deviceId)`; the losing value is reported as a conflict. |
| `item.check` | item | `isChecked` (boolean) | **Check-wins** (§11). |
| `item.storeTags` | item | `storeIds` (array) | **Add-wins** for concurrent additions; a removal applies only against a base that contained the tag. |
| `item.delete` | item | — | **Delete-wins**, terminal tombstone. |
| `item.restore` | item | — | Clears a tombstone; rejected if a newer delete exists. |
| `item.archive` | item | `baseVersion` (on the op) | **Archive-wins**, but skips items whose `version` exceeds the op's base. |
| `item.bulkArchive` | item | `baseVersion` | The bulk form of `item.archive`; reports how many items it skipped. |
| `category.create` | category | `name` | Unique `(household_id, name)`; a duplicate is rejected with `DUPLICATE_NAME`. |
| `category.rename` | category | `name` | Field-level LWW. |
| `category.delete` | category | — | Rejected if any item still references it. |
| `store.create` | store | `name` | Duplicate names are rejected. |
| `store.rename` | store | `name` | Field-level LWW. |
| `store.delete` | store | — | Removes the store's item tags; the items themselves survive. |

> **Naming note.** The `type` values are namespaced by entity (`item.update`,
> not `update`), so that a client reading an unfamiliar operation type can
> tell whether it understands it. An operation whose `type` is not in this
> table is rejected with `UNSUPPORTED_OPERATION` and surfaced to the user
> rather than silently dropped (§13.2).



### 10.2 Lifecycle

```
   user action
       │
       ▼
  ┌─────────────┐   single IndexedDB transaction   ┌──────────────┐
  │ local CRUD  │ ───────────────────────────────► │ local store   │
  │ (repository)│                                  │ + outbox      │
  └─────────────┘                                  └──────┬───────┘
       │                                                    │
       │ UI updates immediately (reactive query)            │
       ▼                                                    ▼
                                                   ┌────────────────┐
                                                   │ sync engine    │
                                                   │  - debounce 2s │
                                                   │  - on 'online' │
                                                   │  - every 30s   │
                                                   │    if pending  │
                                                   │  - on visibility│
                                                   └───────┬────────┘
                                                           │ POST /api/sync
                                                           ▼
                                                  ┌────────────────┐
                                                  │ server         │
                                                  │  1. dedupe opId │
                                                  │  2. apply w/    │
                                                  │     conflict    │
                                                  │     resolution  │
                                                  │  3. append      │
                                                  │     change log  │
                                                  │  4. ack         │
                                                  │ ──────────────  │
                                                  │  5. THEN compute│
                                                  │     the pull    │
                                                  │     (>= lastSeq)│
                                                  └───────┬────────┘
                                                           ▼
                                                  changes written back
                                                  into IndexedDB; outbox
                                                  rows removed; conflicts
                                                  recorded
```

**Steps 1–4 (push) strictly precede step 5 (pull).** The server resolves the
client's pushed operations against the state the client knew about, and only
then computes the changes to hand back. Applying them in the other order would
resolve a client's own operation against a version it never saw (§10.1).

The client's change-application then follows the same order: the push response
is applied first (acknowledging or rejecting the client's operations), and the
pulled changes second, subject to the pending-field rule in §10.7.

### 10.3 Idempotency (INV-08, scenario 9)

`POST /api/sync` is safe to retry at any level:

1. The client sends the same `opId` again → the server finds the row in
   `sync_operations`, returns the **cached `result`**, and marks it `duplicate`.
   The state change is applied exactly once.
2. The client re-sends a whole batch after a timeout in which the server actually
   succeeded → every `opId` in the batch is a duplicate → the response is
   identical to the original, minus side effects.
3. The client re-sends a *partially* acknowledged batch → the acknowledged ops
   are duplicates, the rest are applied.
4. The client crashes mid-request → on restart the outbox still holds every
   un-acknowledged op → they are re-sent → duplicates → resolved.

### 10.4 Retry and backoff

- Exponential backoff with jitter: 1 s, 2 s, 4 s, 8 s, 16 s, 30 s (cap).
- A failed attempt does **not** remove the op from the outbox; it increments
  `attempts` and sets `state = "failed"` after 5 consecutive failures.
- `4xx` responses that indicate a permanent problem (validation, authorization,
  deleted category) move the op to `state = "blocked"` and raise a conflict entry
  the user can act on. `5xx` and network errors are transient and are retried.
- The sync engine never blocks the UI. It is a plain TypeScript class, not React
  state.

### 10.5 Why not the Background Sync API

The Background Sync API (`ServiceWorkerRegistration.sync`) is **not implemented in
Safari** and is unreliable on Android Chrome when the browser is terminated.
Since iOS Safari is an explicit target, sync must be driven by the foreground
page. The durability of unsynchronised work comes from **IndexedDB**, not from a
service worker background task. A background-sync registration may be added
later as a *best-effort accelerator* on Chromium browsers only, never as the
sole mechanism.

### 10.6 Initial and incremental synchronisation

| Case | Behaviour |
| --- | --- |
| First ever load on a device | `lastSeq = 0` → the server returns the full household snapshot as `changes`. The client writes it to IndexedDB and sets `nextSeq`. |
| Subsequent loads | `lastSeq` = the highest seq already applied → only newer changes are returned. |
| Long offline period | `lastSeq` is old but still within the retention window → incremental catch-up. |
| `lastSeq` older than retention | Response carries `fullResyncRequired: true` → the client requests a full snapshot, rebuilds its local tables, and **replays its outbox afterwards**. |
| Household never synced on this device | The client shows `This household hasn't been downloaded on this device yet. Connect to download.` It does **not** show an empty list, which would be indistinguishable from "the list is empty". |

### 10.7 Change application on the client

The client applies a sync response in two phases, in this order:

**Phase 1 — the push response.** For each operation in `applied[]`,
`duplicates[]`, and `rejected[]`, the client resolves its outbox row:
acknowledged and duplicate operations are removed from the outbox and their
local rows marked no longer pending; rejected operations move to
`state = "blocked"` and raise the conflicts reported on the response.

**Phase 2 — the pulled changes.** For each `change`:
1. If `entity.deleted` → write a local tombstone (`deletedAt` set) — never remove
   the row outright (INV-07).
2. Else → upsert the snapshot.
3. If the local row has `pending = true` (a local edit not yet acknowledged),
   **the server's change does not overwrite the local pending value for the
   fields the local op touched**. The local edit stays queued; the server value
   is stored as the op's `baseVersion` context for conflict detection. If the
   server's change touches a *different* field, it is applied immediately —
   this is what lets "one device checks an item while another edits its
   quantity" merge cleanly.

**The phases must not be interleaved.** Resolving the outbox first is what
makes rule 3 correct: by the time the pulled changes are applied, the client's
own operations are already known to be either accepted or rejected, so a
change produced by the client's *own* just-pushed operation does not overwrite
the local value it just wrote.

---

## 11. Conflict resolution matrix

**Conflict resolution is per operation type, not blanket last-write-wins.**

The server compares the incoming operation's `baseVersion` and `lamport` against
the stored row's `version` and `field_meta`. Ordering is by `(lamport, deviceId)`
— a total order that does not depend on wall-clock time.

The **Operation** column uses the authoritative `type` values enumerated in
§10.1a. That table is the single source of truth; this table defines only the
*conflict rule* for each one.

| Operation | Field(s) | Rule | Concurrent outcome | Surfaced to user? |
| --- | --- | --- | --- | --- |
| `item.create` | all | Server accepts the client id. Idempotent on `opId`. | Two devices create the same id → impossible unless the same `opId` is replayed → duplicate. | No |
| `item.create` | all | Two devices create *different* items with the same name. | **Both survive** as separate items. No automatic merge. | No |
| `item.update` | `name`, `quantity`, `note`, `categoryId` | Field-level LWW by `(lamport, deviceId)`. | The loser's value is stored as a **conflict record**; the winner's value applies. | **Yes** |
| `item.check` | `isChecked` | **Check-wins.** An uncheck whose `baseVersion` predates a *different* device's check does **not** clear the check. An uncheck based on a version that already includes the check does clear it. | Device A checks; device B (offline) unchecks → **item stays checked**. | No (the outcome is the intuitive one) |
| `item.storeTags` | `storeIds` | **Add-wins** for concurrent additions. A removal applies only if the removal's `baseVersion` already contained the tag. | A adds "Costco", B adds "Aldi" → both tags present. | No |
| `item.delete` | `deletedAt` | **Delete-wins, terminal.** Only a strictly later `restore` operation clears it. | Device A deletes, device B edits → **item stays deleted**. B's edit is not silently lost; it is recorded as a conflict against a deleted entity. | **Yes** |
| `item.restore` (re-add) | `deletedAt`, `archivedAt` | Clears the tombstone. Rejected if a *newer* delete exists. | Restore-then-delete ordering is respected. | No |
| `item.archive` (clear completed) | `archivedAt` | **Archive-wins** over concurrent edits to other fields, but the op carries a `baseVersion` and **skips any item whose `version` exceeds it** — i.e. items changed on another device since the clear was initiated are not archived. | A clears completed offline; B unchecks an item and changes its quantity → B's item is **not** archived. | **Yes**, the count of skipped items is reported |
| `item.bulkArchive` (clear completed, bulk) | `archivedAt` | The bulk form of `item.archive`: the same base-version skip rule, applied across every checked item. The response reports how many items were skipped and why. | A clears completed offline; B changes an item's quantity → that item is **skipped**, not archived, and A is told how many were skipped. | **Yes**, the skipped count is reported |
| `category.create` | all | Unique `(household_id, name)`. On conflict, the second op is rejected with `DUPLICATE_NAME` and surfaced. | — | **Yes** |
| `category.rename` | `name` | Field-level LWW. | Winner applies; loser recorded. | **Yes** |
| `store.rename` | `name` | Field-level LWW. | Winner applies; loser recorded. | **Yes** |

### 11.1 Why these rules

- **Check-wins** because in a grocery aisle, "I got the milk" is a fact about the
  physical world. A concurrent quantity edit must not un-tick it.
- **Delete-wins** because a deleted item reappearing is the most confusing
  possible outcome for a shopper, and because it makes the tombstone a reliable
  guard against resurrection (FR-24, INV-07).
- **Add-wins for store tags** because tags are a set of independent facts, and
  because losing a tag silently re-routes a shopper to the wrong store.
- **Archive skips items changed after the base version** because a bulk action
  that silently destroys a concurrent edit is the exact failure the product
  owner called out as scenario 18.
- **Field-level LWW with conflict records** satisfies the requirement to never
  silently discard an unsynchronised edit: the losing value is never thrown
  away — it is presented to the user with the winner, and the user can choose.

### 11.2 Conflict presentation

A conflict is shown as a compact card in a "Needs attention" panel:

```
Milk — quantity differs
  This device   2 kg      ← your offline edit
  Other device  3 kg      ← won
  [Keep mine]  [Use theirs]  [Dismiss]
```

"Keep mine" re-queues the local value with a fresh `lamport` so it wins.
"Dismiss" accepts the server value. Both are recorded.

---

## 12. Authentication and authorization

### 12.1 Sessions

- **Better Auth is retained** for credential handling, session cookies, and the
  organization plugin.
- Sessions are 30-day sliding (existing behaviour). 📋 **SPEC**: the session
  token is additionally cached locally (`meta` store) so the client can display
  the signed-in identity and household name while offline.
- **The client never trusts the cached session for authorization.** Every API
  call is authorized server-side. The cached session exists only so the UI can
  render a correct header offline.

### 12.2 Offline session expiry (scenario 13)

| Situation | Behaviour |
| --- | --- |
| Offline, session still valid | Everything works. The user sees `Offline — N changes pending`. |
| Offline, session expired or unknown | The app **continues to work fully**. The chip shows `Sign in to sync`. Local data is intact and readable. |
| Reconnect, session expired | The server returns 401. The client keeps the outbox, shows `Sign in to sync`, and prompts for credentials. On successful sign-in, the outbox is pushed. |
| Session invalid for another reason (revoked, user removed from household) | The client shows the appropriate message and **discards only the data for the household the user is no longer a member of**, after an explicit confirmation. Data for other households is untouched. |

### 12.3 Sign-out with unsynchronised changes (scenario 11)

Sign-out MUST NOT silently discard queued work. The confirmation dialog states
the exact consequence:

```
You have 7 unsynchronised changes.

[Sync now]        — returns you to the list and syncs first (recommended)
[Sign out and keep a copy]  — saves a JSON export to your device
[Sign out and discard]      — permanently deletes the pending changes
```

### 12.4 Household switching while offline (scenario 12)

| Situation | Behaviour |
| --- | --- |
| Switching to a household already synced on this device | The switch is **instant and offline**. Its cached list renders. The outbox is partitioned per household, so pending work for the other household is untouched. |
| Switching to a household never synced on this device | The app shows `This household hasn't been downloaded on this device. Connect to download it.` The server-side `activeOrganizationId` is updated on the next successful sync. |
| Switching with pending work for the current household | The pending work stays queued in its own partition and is pushed when that household is next synced. No loss. |

### 12.5 Authorization rules (server-side, authoritative)

| Action | Required role |
| --- | --- |
| Read/write items, categories, stores in a household | Member |
| Sync (push/pull) for a household | Member |
| Invite a member by email | Owner or Admin |
| Mint a join link | Owner or Admin |
| Remove a member | Owner or Admin |
| Change a member's role | Owner |
| Delete a user | Platform admin (`ADMIN_EMAIL`) |

**Every one of these is enforced in the server application layer, not in the UI.**
The current gap (S-1, S-3) is closed. 📋 **SPEC**: a shared `requireHouseholdRole(orgId, userId, roles)` helper is used by every household-scoped route, replacing the ad-hoc checks.

### 12.6 Tenant isolation

Isolation is enforced in three layers:

1. **Application layer** — every query is scoped by `organization_id` via a
   shared query helper that cannot be forgotten. (Today the predicate is applied
   correctly — verified — but it is repeated by hand in every call site.)
2. **Database layer** — 📋 **SPEC**: PostgreSQL row-level security policies on
   `items`, `stores`, `categories`, `item_stores`, keyed to a session variable
   set per request. This makes a missing predicate a no-op rather than a leak.
3. **Test layer** — an integration test asserts that a user of household A
   receives `404` for household B's item on read, update, and delete. This test
   must run against a **real** database, because the current mocked `db` ignores
   `where()` clauses entirely and would pass even if the predicate were deleted.

---

## 13. Data migration and recovery

### 13.1 User data migration

The current application keeps **no client-side data**. Therefore migrating
existing users to the offline-first version carries **essentially no data-loss
risk**:

| Existing state | Migration |
| --- | --- |
| A user opens the new version for the first time | The client has an empty IndexedDB. It performs a full bootstrap sync, which pulls the household's entire current state from the server. The local database is built from that snapshot. |
| Existing server rows | Untouched. Their `id` values remain valid UUIDs. |
| `is_active = false` rows | One migration sets `deleted_at = now()` for them, so the tombstone model is consistent from the first sync. |
| `archived_at` rows | Untouched. They remain recoverable from History. |

**There is no data to copy and no transformation to get wrong.** This is the
single strongest argument for a partial rebuild over a from-scratch rewrite: the
user-data risk of option C does not exist in option B.

### 13.2 Backward and forward compatibility

- The server accepts **both** the legacy REST endpoints and the new sync
  endpoint during the transition. The legacy endpoints are marked deprecated
  and removed only after the new client has shipped and the old client is no
  longer reachable.
- The sync protocol carries an explicit `protocolVersion`. A server that receives
  an unknown higher version returns `409 PROTOCOL_VERSION_UNSUPPORTED` and the
  client offers a reload.
- A server that is *older* than the client understands the operation types it
  knows and rejects others with `UNSUPPORTED_OPERATION`; the client surfaces
  those as blocked operations rather than dropping them.

### 13.3 Recovery objectives

| Scenario | Recovery |
| --- | --- |
| A device is lost or reset | The device re-bootstraps from the server. Unsynchronised work on the lost device is lost — hence the sign-out protection (§12.3) and the prompt to export. |
| The server database is restored from backup | Clients detect a `fullResyncRequired` response (the `seq` space regressed) and rebuild. |
| A client is stuck with a corrupt local database | The client detects an open failure on the IndexedDB, offers `Reset local data and re-download`, and preserves the outbox as an exportable JSON file first. |
| A bad server release corrupts data | The additive migration design means a rollback is a migration down, not a data restore. |

---

## 14. Security and privacy requirements

| ID | Requirement |
| --- | --- |
| SEC-01 | Every API route MUST verify the session server-side. The middleware is an optimistic redirect only and MUST NOT be treated as an authorization layer (already documented in `middleware.ts:11-13`). |
| SEC-02 | Every household-scoped query MUST be scoped by `organization_id`, enforced by a shared helper and by RLS. |
| SEC-03 | Only owners/admins may invite, mint join links, or remove members — enforced server-side, with **403** responses (not 500). |
| SEC-04 | No endpoint may return data without a session check. `GET /api/invitation-email` must require a session or be removed. |
| SEC-05 | The service worker MUST NOT cache any authenticated API response. Only the static shell and hashed static assets may be cached. |
| SEC-06 | Cached shell responses MUST NOT contain user data. This is what makes a shared, cross-user cache safe. |
| SEC-07 | The local database contains the household's shopping data. It MUST be cleared on sign-out unless the user explicitly chooses to keep a copy. |
| SEC-08 | The `deviceId` used for sync MUST be a random per-install identifier with no hardware fingerprinting. |
| SEC-09 | The `ADMIN_EMAIL` mechanism MUST be replaced by a role on the `member` table (or a dedicated `platform_admin` table) before the admin endpoints are exposed further. |
| SEC-10 | Rate limiting MUST be applied to sign-up, sign-in, invitation, and join-link endpoints. |
| SEC-11 | Invitation and join-link tokens MUST have a short expiry and MUST be revocable. Today `createJoinLink` deletes all prior links (S-2); 📋 **SPEC**: multiple concurrent links are permitted, each revocable individually. |
| SEC-12 | The `items.name`, `quantity`, and `note` fields contain user content. 📋 **SPEC**: they are never written to logs, never included in analytics, and never sent to the email provider. |

### 14.1 Privacy position

The household's shopping list is intimate data — it reveals diet, health
conditions, income, and religious practice. The design therefore minimises
server exposure of content: item text travels only between the household's own
devices and its own server rows. No third-party service receives item content.
The current `Resend` integration sends only invitation emails containing
household and inviter names — never item data. 📋 **SPEC** keeps it that way
and adds a regression test.

---

## 15. Performance and reliability targets

### 15.1 Targets

| Metric | Target | Measured how |
| --- | --- | --- |
| List render from IndexedDB (500 items) | < 100 ms | Playwright `performance.now()` around the list render |
| Local write → UI acknowledgement | < 50 ms | Timed in a component test with the network blocked |
| Local write → durable in IndexedDB | < 100 ms | Timed at the transaction commit |
| App shell → interactive list, **offline cold start** | < 1.5 s | Playwright, offline, cold browser context |
| Sync round trip (online, ≤ 100 ops) | < 1 s p95 | Server-side timing |
| Full bootstrap (1000 items) | < 2 s | Playwright, first load |
| Service-worker install | < 2 s | Playwright |
| Sync status chip latency after a local edit | < 100 ms | Component test |
| **Data loss** | **zero** | INV-02/03/04 tests |
| **Duplicate application** | **zero** | INV-08 idempotency test |

### 15.2 LCP trade-off — measured, not assumed

The dashboard currently server-renders the item list, which contributes to its
measured LCP of 2332 ms (`.planning/phases/11-dashboard-perf/11-01-SUMMARY.md:16-30`).
Moving the list to a client render removes the SSR contribution. The mitigation is
that the shell (header + quick-add bar + empty state) is cached and paints
immediately, and the list follows from IndexedDB without a network wait.

📋 **SPEC**: after the switch, **the LCP target is ≤ 2500 ms and the Lighthouse
score must not drop below 90**. The existing Lighthouse harness
(`scripts/verify-perf-07.mjs`) is reused as the gate. If the score regresses,
the fallback is to server-render only the *first screenful* of items as a
bootstrap payload that the client writes into IndexedDB before its first paint —
which keeps IndexedDB the single source of truth while restoring SSR paint.

### 15.3 Browser support

| Browser | Minimum | Notes |
| --- | --- | --- |
| Safari / iOS Safari | 16.4 | IndexedDB, service workers, `env(safe-area-inset-*)`. **No Background Sync** — by design, not used. |
| Chrome / Edge | 110 | Full support. |
| Firefox | 110 | Full support. |
| Samsung Internet | 23 | Secondary. |

`file://` and private-browsing modes where IndexedDB is unavailable MUST
degrade to a clear, blocking message rather than a silent failure.

---

## 16. Testing strategy

### 16.1 Principles

1. **Do not mock away the system under test.** A test that mocks the database
   proves nothing about tenant isolation. The current suite's core defect is
   that its fake `db` **ignores `.where()` entirely**, so every
   `organization_id` predicate in the codebase is untested.
2. **Real persistence, real endpoints, real interruption** for at least the
   core sync paths.
3. **Every invariant in §4.1 has at least one automated test.**
4. **CI runs on every pull request** and blocks the merge.

### 16.2 Test layers

| Layer | Scope | Technology | Real dependencies? |
| --- | --- | --- | --- |
| **Unit** | Conflict-resolution matrix, Lamport ordering, state transitions, quantity parsing, status-chip state machine | Vitest, table-driven | Pure functions — no I/O |
| **Local database** | Dexie schema, migrations, transaction atomicity, outbox integrity | Vitest + `fake-indexeddb` | Real IndexedDB semantics (in-memory) |
| **Repository** | Local CRUD + enqueue atomicity | Vitest + `fake-indexeddb` | Real repository code |
| **API contract** | `/api/sync` request/response shape, error codes, authz matrix, idempotency | Vitest + **real PostgreSQL** | ✅ Real DB (`DB_DRIVER=node-postgres`) |
| **Migration** | Apply migrations to an empty DB and to a seeded legacy-shaped DB | Vitest + **real PostgreSQL** | ✅ Real DB |
| **Sync integration** | Two local stores + one server, converging | Vitest + real PostgreSQL + `fake-indexeddb` ×2 | ✅ Real DB + real HTTP |
| **Browser E2E** | Offline journeys, reload, restart, two devices, sync status | Playwright (chromium, webkit, firefox, iPhone 13) | ✅ Real server + real DB |
| **Network interruption** | Request aborted mid-flight, partial failure, server 5xx, connection dropped | Playwright `route.abort()` / `context.setOffline()` + a fault-injecting proxy | ✅ Real server |
| **Auth / session** | Expiry, revocation, role changes, cross-household access | Playwright + Vitest | ✅ Real server + real DB |

### 16.3 Mandatory test cases

**Local database & repository**
- A write and its outbox entry commit together (INV-03).
- A failed transaction leaves neither the write nor the outbox entry (INV-03).
- An outbox entry survives a simulated process restart (INV-02).
- Schema migration v1 → v2 preserves all outbox entries (INV-11).
- Schema migration v1 → v2 transforms item records correctly.

**Conflict resolution (unit, table-driven over §11)**
- Every row of the §11 matrix has at least one test each way.
- Check-wins: device A checks, device B unchecks from an older base → checked.
- Delete-wins: device A deletes, device B edits → deleted, conflict recorded.
- Add-wins: concurrent store-tag additions → both tags present.
- Bulk archive skips items whose `version` exceeds the op's `baseVersion`.

**API contract & idempotency**
- The same `opId` submitted twice applies once and returns the same result.
- A batch replayed after a timeout applies once.
- A partially-acknowledged batch replay applies only the remainder.
- Unknown fields in an operation are rejected with a clear code.
- An operation from a device that is not a household member is rejected with 403.
- An operation naming an entity in another household is rejected with 404 and
  leaks no information.

**Tenant isolation (real database — the current suite cannot do this)**
- Household B's user reading household A's item → 404.
- Household B's user updating household A's item → 404 and A's row is unchanged.
- Household B's user deleting household A's item → 404 and A's row is unchanged.
- A plain member minting a join link → 403 (closes S-1).
- A plain member inviting by email → 403 with a 403 status code (closes S-3).
- `GET /api/invitation-email` without a session → 401 (closes S-4).

**Migration**
- Migrations apply cleanly to an empty database.
- Migrations apply cleanly to a database seeded with legacy rows.
- Legacy `is_active = false` rows become tombstones.
- Legacy rows' ids and content are unchanged by the migration.

**Browser E2E (Playwright)**
- **Offline cold start**: with the network off, open the app → the list renders
  from IndexedDB with no error page.
- **Offline add / edit / check / delete**: all four are applied locally, survive a
  reload, and survive a browser restart.
- **Offline reload**: the shell is served from cache (INV-10).
- **Two devices, conflicting offline edits** → reconnect → both converge to the
  documented resolution, and the conflict is surfaced.
- **Interruption mid-sync**: abort the request after the server applies it but
  before the client receives the response → the retry is idempotent and the
  final state is correct.
- **Sign out with pending changes** → the dialog appears and states the options.
- **Household switch offline** → the cached household's list renders and the other
  household's pending work is intact.
- **Session expiry offline** → the list still renders; `Sign in to sync` appears.
- **Quota exceeded** → a clear error, no silent data loss.

### 16.4 The required demonstration

A single repeatable script, `scripts/verify-offline-sync.mjs`, wired into CI,
that:

1. Starts two isolated browser contexts (device A and device B) against one
   household.
2. Loads both, then **takes both offline**.
3. Device A checks *"Milk"* and changes its quantity to `2 kg`.
   Device B changes the quantity to `3 kg` and adds *"Bread"*.
4. Brings both back online.
5. Asserts: both devices converge to the same list; the quantity is resolved by
   the §11 rules; the check survived (check-wins); "Bread" exists on both; the
   quantity conflict is surfaced to the user rather than discarded.
6. Prints a pass/fail report and exits non-zero on failure.

This is the acceptance demonstration for the whole project.

### 16.5 CI gates

`.github/workflows/ci.yml`, triggered on `pull_request` and `push` to `main`:

| Job | Command | Gate |
| --- | --- | --- |
| Lint | `pnpm lint` | must pass |
| Type-check | `pnpm typecheck` (`tsc --noEmit`) | must pass — **the script is missing today (B-9)** |
| Unit | `pnpm test` | must pass — **fails today (B-8)** |
| Integration | `pnpm test:integration` (real PostgreSQL service container) | must pass |
| Build | `pnpm build` | must pass |
| E2E | `pnpm test:e2e` (Playwright, chromium + webkit) | must pass |
| Offline demo | `pnpm verify:offline` | must pass |
| Perf | `pnpm verify:perf` (existing Lighthouse harness) | LCP ≤ 2500 ms, score ≥ 90 |

The existing `perf-audit.yml` schedule is kept.

---

## 17. Non-goals and deferred features

### 17.1 Explicit non-goals for this recovery

| Non-goal | Reason |
| --- | --- |
| A CRDT / general-purpose sync engine | Household scale (2–6 users) does not justify it. Field-level LWW plus explicit conflict records is sufficient and far simpler. |
| Background Sync API as the primary mechanism | Unavailable on iOS Safari. |
| A native mobile app | The brief is a web app; the PWA covers the in-store scenario. |
| Realtime push (WebSockets / SSE) | Household scale does not justify the infrastructure. The sync engine's polling interval (30 s) plus a `visibilitychange` trigger is sufficient. The sync protocol is designed so that a push transport could be added later without changing the data model. |
| Barcode scanning, voice input, recipe integration, price tracking | Product scope, already deferred in the existing roadmap. |
| Item attribution ("who added this") | Deferred; the server already records `created_by` and `updated_by`, so surfacing it later is cheap. |
| Rich conflict UI beyond the "Needs attention" card | Sufficient for the household scale. |
| Replacing Better Auth | High risk, low value. |
| Multi-region / offline write conflicts across thousands of households | Out of scale. |

### 17.2 Deferred but designed for

- **Duplicate-product suggestions** (scenario 6): the data model keeps both items;
  a suggestion is a UI addition, not a data-model change.
- **Push transport** for sync.
- **Per-device notification of incoming changes.**
- **Household-level statistics.**

---

## 18. Architectural decisions and rationale

| ADR | Decision | Rationale | Alternatives rejected |
| --- | --- | --- | --- |
| **ADR-01** | **Partial rebuild, not a rewrite and not an incremental patch.** Retain the domain model, schema shape, auth, and UI; replace the client data layer, the mutation path, the sync protocol, and the PWA layer. | The current architecture makes the server the sole owner of the data and treats the client as a view. Offline-first inverts that ownership. That inversion is an architectural change, not a refactor — but ~60 % of the codebase (schema, auth, validation, UI, design system, E2E harness) survives intact and the server data needs no migration. | *Incremental patch* — leaves the fetch-and-rollback pattern in every component and produces two competing mental models (some features local-first, some server-first), which is how the current inconsistency arose. *Full rewrite* — 14–20 weeks, reimplements auth and the UI, and introduces a genuine data-migration risk for zero functional gain. |
| **ADR-02** | **The shopping surface becomes a client render from IndexedDB; app pages become static shells; auth redirects move to the client.** | The server-side session check in the page layout is a network round trip that cannot succeed offline, and server-rendered data is incompatible with "IndexedDB is the source of truth". Because the shells contain no user data, moving the redirect client-side leaks nothing; all API calls remain server-authorized. | *Keep SSR and reconcile with local data* — two sources of truth and a hydration race. *Cache the SSR'd HTML per user* — breaks cross-user cache sharing and still fails offline when the session check runs. |
| **ADR-03** | **IndexedDB via Dexie.** | The only storage that satisfies "persistent local database" with structured data and transactional writes. Dexie adds versioned schema migrations, which the requirements demand, and a reactive query hook, which removes a hand-rolled store layer. | `localStorage` (synchronous, 5 MB, string-only), `idb` (no migrations), SQLite/WASM (large payload, no benefit at this scale). |
| **ADR-04** | **One `POST /api/sync` endpoint that pushes and pulls.** | One round trip per cycle; simpler retry semantics; the response is a consistent snapshot. | Separate push/pull endpoints — two round trips, two failure modes, and a harder-to-reason-about interleaving. |
| **ADR-05** | **Server-side change log (`sync_changes`) as the source of truth for incremental sync.** | A monotonic `bigserial` gives a total order that `updated_at` cannot, survives clock skew, supports one indexed range scan per pull, and doubles as an audit trail. | Deriving changes from `items.updated_at` — ambiguous ordering, no per-field history, breaks on equal timestamps. Polling the full table — O(n) per sync, and would not survive a long offline period cleanly. |
| **ADR-06** | **Idempotency keyed on a client-generated `opId`**, recorded in a dedicated `sync_operations` table. | The primary key *is* the guarantee. Replay returns the cached result. Handles every duplication scenario uniformly (retry, timeout, crash-restart, batch replay). | `If-Match`/ETag on entities — does not cover a queued operation that was never acknowledged, and does not cover batch-level retries. |
| **ADR-07** | **Per-field conflict resolution with per-field version metadata in `field_meta jsonb`.** | Satisfies "conflict resolution per operation type rather than simplistic last-write-wins" without a separate version table, a CRDT, or a per-field row. JSONB keeps the whole row in one heap tuple, avoiding a second table and a join on the hot path. | Entity-level LWW — loses a concurrent quantity edit when a check arrives, which is exactly the scenario the brief calls out. A CRDT — unjustifiable complexity at household scale. |
| **ADR-08** | **Client-generated UUIDv7 primary keys; the server accepts client ids.** | An offline client must know a record's id before the server has seen it. UUIDv7 is time-ordered (good index locality) and fits the existing `uuid` column type. | Server-generated ids — the client cannot reference a record it created offline. ULID — needs a `text`/custom column and a lexicographic-sort assumption; UUIDv7 is a standard UUID. |
| **ADR-09** | **Tombstones (`deleted_at`) are terminal and retained for 90 days.** | Makes resurrection impossible (FR-24) and makes "delete" and "clear completed" two clearly distinct, separately recoverable behaviours (fixes B-11). | Hard delete — a stale device would resurrect the item on its next sync. The current `is_active` flag — indistinguishable from "not in the list", and not recoverable from History. |
| **ADR-10** | **Foreground sync only; no dependency on the Background Sync API.** | iOS Safari does not implement it and Chromium's is unreliable when the browser is terminated. Durability comes from IndexedDB, not from a background task. | Background Sync as primary — silently loses pending work on iOS. |
| **ADR-11** | **Keep Next.js, Better Auth, Drizzle, and PostgreSQL.** | They are used well and are not the problem. The problem is the data-ownership model, not the tools. | A different framework — large, risky, and buys nothing for this problem. |
| **ADR-12** | **Server-side authorization is authoritative and role-checked; RLS added as a second layer.** | The current join-link gap (S-1) is a UI-only check. Isolation must be enforced where the data lives. | UI-only checks — already proven insufficient. |
| **ADR-13** | **Integration tests run against a real PostgreSQL, not a mocked `db`.** | The current fake `db` ignores `where()` clauses, so the codebase's tenant-isolation predicates are entirely untested. The `DB_DRIVER` switch already exists (`src/db/index.ts:16-19`). | Continuing to mock the database — it cannot verify isolation, constraints, or migrations. |
| **ADR-14** | **The sync apply path must be atomic, using compare-and-swap rather than a read-decide-write transaction.** The Neon HTTP driver throws on `db.transaction()`; `db.batch()` maps to Neon's atomic HTTP batch transaction. | Applying an operation, appending to the change log, and recording the idempotency key must be all-or-nothing (INV-12). **Note the limitation:** a batch executes *pre-built* statements, so the read that conflict resolution depends on cannot sit inside it. The read therefore happens first, and the write uses a compare-and-swap — `UPDATE … WHERE id = ? AND version = ?` — so a concurrent modification causes zero rows to be updated and the operation is retried against fresh state. The batch then commits the entity write, the change-log entry, and the idempotency record together. | The current non-transactional store-tag replacement (B-13) — a mid-flight failure loses the item's store tags. Blind read-decide-write without a compare-and-swap — two concurrent operations can both read the same `version` and both believe they won. The Neon WebSocket driver (interactive transactions) is the fallback if compare-and-swap proves insufficient. |
| **ADR-15** | **Service worker caches the static shell and hashed assets only — never an API response.** | The shell is identical for all users (no user data), so it caches safely and enables offline boot. API responses are per-user and per-household; caching them risks cross-account data leakage on a shared device. | Caching API responses — data-leak risk on shared devices and stale-data bugs. |

---

## 19. Measurable acceptance criteria

The recovery is complete when **all** of the following are demonstrably true.

### 19.1 Offline-first (the primary outcome)

| # | Criterion | How it is proven |
| --- | --- | --- |
| AC-01 | With the network disabled, the dashboard renders the household's list with no error page and no spinner longer than 300 ms. | Playwright offline test + timing assertion |
| AC-02 | With the network disabled, adding, editing, checking, and deleting items all work and are visible immediately. | Playwright offline test |
| AC-03 | Edits made offline survive a page reload and a full browser restart. | Playwright: offline → edit → reload → restart → assert |
| AC-04 | The service worker is installed and the app is installable (a valid `manifest.webmanifest` is served with the required fields and icons). | Manifest assertion + Lighthouse PWA category |
| AC-05 | Reconnecting synchronises all pending changes automatically with no user action. | Playwright: offline → edit → online → poll until converged |
| AC-06 | Submitting the same operation 10 times applies it exactly once. | Idempotency test against a real database |
| AC-07 | Two devices making conflicting offline edits converge to the documented resolution, and the losing edit is presented to the user rather than discarded. | The §16.4 demonstration script |
| AC-08 | A deleted item is not resurrected when a device that has been offline for 7 days reconnects. | Tombstone test with a stale `lastSeq` |
| AC-09 | Killing the app mid-sync and relaunching loses no queued operation. | Process-kill test |
| AC-10 | The outbox is empty and the status chip reads `Up to date` after a full online sync cycle. | Assertion in the E2E suite |

### 19.2 Data integrity

| # | Criterion |
| --- | --- |
| AC-11 | Every operation, its change-log entry, and its idempotency record are committed atomically. |
| AC-12 | The server's change log is a total order; two changes in the same millisecond are still ordered deterministically. |
| AC-13 | A bulk "clear completed" never archives an item that another device changed after the clear was initiated, and reports how many it skipped. |
| AC-13a | Two operations that target the same entity concurrently cannot both succeed: the loser detects zero rows updated by the compare-and-swap and retries against fresh state. Proven by a test that fires two concurrent updates at the same row. |
| AC-14 | No migration rewrites or deletes existing user data. Migrations are additive, plus one `is_active → deleted_at` backfill that is separately verifiable. |

### 19.3 Security

| # | Criterion |
| --- | --- |
| AC-15 | A plain household member receives **403** when minting a join link, when inviting by email, and when removing a member. |
| AC-16 | Every unauthenticated request to any `/api/*` route returns 401. `GET /api/invitation-email` is either authenticated or removed. |
| AC-17 | A user of household B receives 404 for household A's item on read, update, and delete — proven by a test against a real database. |
| AC-18 | RLS policies are active on the household-scoped tables and are proven by a test that sets a mismatched household and asserts zero rows returned. |
| AC-19 | The service worker cache contains no API responses and no user data. |

### 19.4 Quality

| # | Criterion |
| --- | --- |
| AC-20 | `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration`, `pnpm build`, and `pnpm test:e2e` all pass on every pull request. |
| AC-21 | The 31 placeholder E2E specs (`test.fixme`) are either implemented or deleted — a green run must not be a hollow green. |
| AC-22 | No test asserts anything about a mocked database's `where()` clause. Database-facing tests run against real PostgreSQL. |
| AC-23 | Every invariant INV-01 … INV-12 has at least one named automated test, and the test name cites the invariant. |
| AC-24 | Lighthouse performance score ≥ 90 and LCP ≤ 2500 ms, measured by the existing harness. |

### 19.5 Product quality

| # | Criterion |
| --- | --- |
| AC-25 | Quantity accepts `2.5 kg`, `500 g`, `2 x 400 g`, `1 gallon`, and `6`, and stores them verbatim. |
| AC-26 | No interaction shows a failure toast for an operation that was committed locally. |
| AC-27 | The sync status chip always reflects reality: pending count, syncing, offline, or up to date. |
| AC-28 | All interactive targets are ≥ 44 × 44 px, verified by an automated audit of the rendered dashboard. |
| AC-29 | The quick-add flow is usable on a 375 × 667 viewport without horizontal scrolling or a sub-100 px name field. |
| AC-30 | `window.confirm` is gone; destructive actions use an accessible confirmation dialog. |

---

## Appendix A — Evidence index

Every **VERIFIED** and **DEFECT** claim in this document traces to one of:

| Method | What it covered |
| --- | --- |
| Static review of 97 source files | Schema, services, routes, components, configuration |
| `pnpm lint` | Passes (exit 0) |
| `npx tsc --noEmit` | **Fails** — 9 errors, all in route test files (B-9) |
| `pnpm test` | **Fails** — 6 failed / 123 passed / 1 skipped (B-8) |
| `pnpm build` (no `DATABASE_URL`) | Fails — `neon()` throws at module load (B-16) |
| `pnpm build` (with `DATABASE_URL`) | Passes (exit 0) |
| Real PostgreSQL 17 + `db/init.sql` | Schema applied; 12 tables created |
| Real Chromium against the production build | Offline reload, offline mutation, IndexedDB/localStorage inspection, quantity corruption, multi-device visibility, service-worker registration, tenant isolation, join-link privilege escalation, authorization status codes |
| `.planning/` documentation audit (180+ files) | Original intent, offline deferral, admitted technical debt, verification claims |
| Test-suite audit (all test files) | Mock analysis, coverage gaps, CI gaps |

### Appendix A.1 — The central finding

> With the network disabled, the application does not degrade — **it disappears**.
> A reload produces the browser's `net::ERR_INTERNET_DISCONNECTED` error page.
> The service worker is registered and its `static-v2` cache exists, but that
> cache holds only content-hashed static assets; no navigation request is ever
> served from it. There is no `manifest.json`, so the app cannot be installed.
> `indexedDB.databases()` returns `[]`. An item added while offline is rolled
> back and destroyed, with the toast `Failed to add item`.

The application is not "partially offline". It is **entirely online**, and its
own project documentation deferred offline support once, in a single line, and
then silently removed that line from every subsequent scope document
(`.planning/milestones/v1.0-REQUIREMENTS.md:92` → deleted from v1.1 and v1.2).
