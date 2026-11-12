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
| FR-31 | A tombstoned item MUST NOT be hard-deleted from the server for as long as the product exists, so that no stale device can ever resurrect it. The change-log retention window (90 days) separately defines the **maximum offline window**; a device older than that MUST full-resync, and a full resync is authoritative over local state. |

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

**The three conflict kinds.** Three of these scenarios can end in a conflict,
and each produces a different card in "Needs attention" (§11.2). A conflict is
never silent (FR-23):

| Kind | Scenario | What the user is told | What they can do |
| --- | --- | --- | --- |
| **Field conflict** | SC-03 — two devices edited the same field | Both values, and which device won | Keep mine / Use theirs / Dismiss |
| **Deleted elsewhere** | SC-05 — another device deleted an item you edited | That it was deleted elsewhere, and your edit is stranded | Undo my edit / Dismiss |
| **Server rejection** | SC-14 — the server refused a locally accepted change | The reason (e.g. the category no longer exists) | Fix the input / Discard the change |

A fourth case — the **check-wins** override in SC-04 — is a field conflict
whose card reads `Still checked`; it has no "Keep mine", because the item
genuinely is checked.

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
- With the network disabled **and the local database and service-worker cache
  already populated** (the same browser profile), a reload renders the list
  with the item names present. A *cold* context with no local data cannot
  render a list, and the criterion must not be written as though it could.
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
reconciled deterministically. **The edit with the higher `(lamport, deviceId)`
wins for the contested field.** A Lamport counter is a *logical* clock, not a
wall clock, so this is usually — but not always — the later edit: a device that
has been offline all morning ticks fifteen items (lamport 1–15) and will
outrank an online device that changed one quantity (lamport 3). The tiebreak is
the device id, not a timestamp.

**The losing edit is shown to the user** rather than disappearing, and the
"Needs attention" card names the winning device — it must never imply
recency.

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
- If instead device B **unchecks** from an older base, the item stays checked
  **and** B is told: the item shows `Checked by <name>` and a "Needs attention"
  entry explains that the uncheck did not take effect. The outcome is
  intuitive, but B's action was overridden and must not be silent (FR-23).

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
client rebuilds its local tables, **discarding its local tombstones because the
server snapshot is authoritative** (§9.3, FR-31), and then **replays its outbox
afterwards** (INV-11, §10.6). Replayed operations against a tombstoned entity
are rejected by the server, so a replay cannot resurrect a deleted item.

**Acceptance criteria.**
- The device can be offline for 7 simulated days with no loss and no degraded
  behaviour.
- On reconnect, all changes from both directions are present.
- With `lastSeq` forced below the retention floor, the device re-bootstraps and
  its own pending operations are **still applied** afterwards.
- An item deleted on the server while the device was offline **does not
  reappear** on the device after the re-bootstrap — the full resync is
  authoritative over the device's stale local state.

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

**Expected behaviour.** The user sees no duplication. **A double-tap on "Add"
creates one item, not two.**

**Technical handling.** `opId` is the idempotency key. The server inserts into
`sync_operations`, whose **primary key is `op_id`**; a duplicate insert fails
and the server returns the cached `result` with `duplicate: true`. The client
generates a fresh `opId` per user action, so two genuine "Add" taps are two
genuine operations — the protection is against *retransmission*, not against
the user pressing the button twice.

**The Add control is disabled for the duration of the local commit.** Offline
there is no network round trip to be "in flight of", but the local commit is
still asynchronous (an IndexedDB transaction), so a double-tap can otherwise
enqueue two creates before the first commits — and SC-06's rule that duplicates
are never merged means both would survive forever. Disabling the control for
the duration of the local commit is what makes the promise true offline as well
as online.

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

**One install may belong to several households.** The `deviceId` is a
per-install identifier, not a per-household one: the same browser may hold
several households' data, and each is a separate partition. That is why
`devices` is keyed on `(household_id, id)` rather than on `id` alone — a device
row records one household's view of one install, and the same `id` may appear
under several households (§9.2).

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
2. A persistent status chip in the header shows exactly one of these states:
   - `Up to date` (neutral) — nothing pending.
   - `Syncing…` (neutral) — a sync is in flight.
   - `N changes pending` (neutral) — queued edits are waiting for a connection.
   - `Offline` (neutral) — no connection and nothing queued.
   - `Offline · N changes pending` (neutral) — no connection, with queued edits.
   - `Sign in to sync · N pending` (neutral) — the session expired; local data is still safe.
   - `N need attention` (warning) — conflicts or rejected changes need a decision.
   - `Sync failed — Retry` (danger) — the last sync attempt failed.
   - `Can't save changes` (danger) — local storage is unavailable or full.

   Only the last three are styled as warnings or danger. `N changes pending`
   and `Offline` are **neutral**: having unsynchronised work is the normal
   state of an offline-first app, not an error, and styling it as a warning
   would train the shopper to ignore the chip.

   The chip is a **button**: it opens "Needs attention" when there are
   conflicts, and otherwise triggers a sync. Below 400 px it collapses to an
   icon plus the count. It MUST NOT read `Up to date` before IndexedDB has
   been read — that would claim a state the app has not yet established.
3. The shopper adds items. Each appears instantly and stays on screen.
4. The shopper ticks items off. Ticks appear instantly and **the item stays in
   place, dimmed and struck through**. A checked item is never moved out of its
   group (§6.3).
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
| An item is checked | **No** toast — the row shows a brief inline undo strip, because the row does not disappear from its position. |
| The user taps **Undo** after a local edit | **Yes** — a 5-second inline undo strip on the affected row, for add / check / uncheck / delete / archive-checked. Undo is itself a local operation in the outbox, never a second network call. |
| An item is unchecked | **No** toast. The row returns to full contrast in place. |
| A destructive action is confirmed | **Yes** — an accessible confirmation dialog, never `window.confirm`. |

### 6.3 Where a checked item goes — and undo

**Checked items stay in place.** This is a change from the current behaviour,
and it is the single most important in-aisle fix in this document.

Today a checked item **leaves its position**: `ShoppingList.tsx:169-173`
partitions the list on `isChecked`, and `ShoppingList.tsx:636` renders the
completed items in a separate section at the bottom. The shopper taps the item
they just put in the trolley and the row vanishes from under their thumb,
reappearing in a different place further down the screen. In a grocery aisle,
with one hand and a trolley, that is a mis-tap generator.

📋 **SPEC**: during a trip, **a checked item stays in its position in the list,
dimmed and struck through** — the style already exists at `ItemRow.tsx:67-69`,
but today it is only ever seen in the bottom section. **No item leaves its
category group.**

The bottom "Completed (N)" section becomes a **summary, not a second copy**: it
reports how many items have been collected and provides the action to clear
them, but it does not re-list the items. The active list grows as the shopper
works, so the summary is collapsed by default.

The reason is spatial: in an aisle the list is a physical checklist and the
shopper navigates by position ("the 4th thing"). Moving a row destroys that
memory. It is also a correctness problem under `useLiveQuery` — when *another
device* checks an item, the current design reflows the list under the
shopper's finger.

Consequently "Clear completed" is renamed **"Archive checked items"**, is
triggered from the summary, and shows a confirmation with the count. Archiving
sets `archivedAt` — it is **never** a delete.

> **Product decision D-7.** This is a behaviour change, not a pure refactor,
> and it is flagged for the product owner. The alternative — keeping today's
> behaviour but not collapsing the section, so the item stays visible in a
> pinned "Completed" tray — preserves the current mental model at the cost of
> the extra screen furniture.

**Undo.** The two most common in-aisle errors are ticking the wrong row and
double-tapping, and both must be recoverable without navigating away.

| Action | Undo window | Behaviour |
| --- | --- | --- |
| Check or uncheck an item | 5 seconds | An inline "Undone" affordance appears on the row itself, with a text alternative for screen readers. |
| Add an item | 5 seconds | The new row offers an inline undo before the outbox entry is created. |
| Delete an item | Until the row is dismissed | The row is removed and replaced by an inline "Item deleted · Undo" strip. The undo **re-queues the delete as a restore operation** (a tombstone is cleared), so it works identically offline. |
| Clear completed (bulk) | Until the confirmation is dismissed | The same inline strip, undoing the whole bulk action as an `item.bulkUnarchive` operation. |

**Undo is an operation, not a UI trick.** An undo of a delete is an
`item.undelete` operation, and an undo of a bulk clear is an `item.bulkUnarchive`.
That means undo works offline, syncs correctly, and conflicts with a
concurrent delete under the normal §11 rules. A purely client-side undo would
diverge from the server the moment the shopper went offline.

### 6.4 Client-render regressions that must be designed for

Moving the shopping surface to a client render from IndexedDB (§7.4) is the
right trade — losing the SSR fast path is worth it for a shopper in a basement
store — but it introduces three regressions that must be designed for, not
discovered later:

**(a) Incoming changes must not reflow the list under the finger.** When a
remote device checks an item, the reactive query re-renders the list. If the
row is removed or moved, the shopper's next tap lands on the wrong item. Rows
therefore keep their position (§6.3) and the list is never re-partitioned by a
remote change. Where a remote change *would* move a row, the change is applied
at the next boundary — a filter change or a reload — not immediately.

**(b) The chip must not render "Up to date" before IndexedDB has been read.**
Before the local database is opened, the app knows nothing about pending work.
The chip shows a neutral loading state until the first read completes, then
renders one of the nine states in §6.1.

**(c) The empty state must distinguish four cases, in a fixed precedence.**
Today's single message — "Your list is empty. Add your first item below."
(`ShoppingList.tsx:550`) — is wrong in three of the four.

**Precedence: failed → never-downloaded → genuinely-empty → reading.** A
shopper must only ever see the empty-list message when we *know* the list is
empty.

| Order | Case | What the shopper sees |
| --- | --- | --- |
| A | **Reading the local store** (transient, ~50 ms) | **No message at all** — just the skeleton rows. Never a spinner over the list, and never the empty-list copy. |
| B | **The household has never been downloaded on this device** | `This household hasn't been downloaded on this device yet. Connect to download it.` with a **[ Download now ]** action — enabled only while online; offline the button reads `Waiting for a connection`. (§10.6) |
| C | **The list is genuinely empty** (bootstrap completed, zero active items) | `Your list is empty. Add your first item below.` — today's copy, unchanged. |
| D | **The bootstrap failed** | `We couldn't load your list. Check your connection and try again.` with a **[ Try again ]** action. It must **never** fall through to case C. |

**Auto-focus: desktop only.** On desktop the name field may take focus. On
mobile it must **not** — the software keyboard covers half the screen in an
aisle, which is exactly when the shopper most needs to see the list.

Showing "your list is empty" when the truth is "we have not loaded your list"
is the worst of the four: the shopper concludes they have nothing to buy.
Case D must not fall through to case C for the same reason — a failed load
that renders as "your list is empty" is actively misleading.

**Which case applies is decided by the per-household bootstrap state** in the
`meta` store (§8.2): `pending` → case B, `failed` → case D, `done` with zero
items → case C.

### 6.5 Explicitly forbidden UX

- ❌ A toast that says `Failed to add item` when the item was actually added locally.
- ❌ A spinner that blocks the list because the network is slow.
- ❌ A destructive action that completes with no confirmation of what it affected.
- ❌ A `window.confirm` dialog (unstyleable, blocking, untestable). Replace with the
  existing `AlertDialog` component — `window.confirm` is used at
  `ShoppingList.tsx:489` and must be replaced.

### 6.6 Mobile requirements (mobile Safari and Chrome)

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
  households: "id",
  meta:       "key, householdId",
});
```

`households` holds the signed-in user's household list (`id`, `name`). It is the
**only store not partitioned by `householdId`** — it is the index of partitions,
not a partition. It is what makes offline household switching (§12.4) and the
"not downloaded on this device" state (§10.6) possible at all.

`meta` is keyed by `(key, householdId)` and holds **per-household** state, so
two households on one device never share a bootstrap state. The keys it must
carry:

| Key | Value | Used by |
| --- | --- | --- |
| `bootstrap:${householdId}` | `pending`, `done`, or `failed` | §6.4 (empty states) — the client shows *not downloaded* when `pending`, *couldn't load* when `failed`, and the empty-list message only when `done` |
| `bootstrapAt:${householdId}` | epoch ms of the last successful bootstrap | Diagnostics; also the age of the local copy |
| `schemaVersion` | integer | The local schema version (§8.4) |
| `appVersion` | string | The running application version |
| `deviceId` | string | The per-install device identifier (§14, SEC-08) |
| `identity` | `{ id, name, email }` | The signed-in identity, for rendering the header offline. **The session token is never stored here** (§12.1) |

**This is the mechanism that makes the empty states distinguishable.** Without
per-household bootstrap state, an empty local store looks identical whether the
household has never been downloaded, the bootstrap failed, or the household
genuinely has no items — and the client would have to guess. §6.4(c) depends on
this key existing.

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
  pendingFields: string[];    // fields touched by the pending local op(s)
};

type OutboxOp = {
  opId: string;              // UUIDv7, globally unique
  householdId: string;
  entityType: "item" | "category" | "store";
  entityId: string;
  type: SyncOperationType;   // the ONE union — §10.1a, exported from src/shared/sync.ts
  baseVersion: number;       // server version the client believed it was editing
  lamport: number;           // client's Lamport counter for this household
  payload: OutboxPayload;    // typed per operation type — see below
  state: "pending" | "inflight" | "failed" | "blocked";
  attempts: number;
  lastError: string | null;
  createdAt: number;
};
```

**There is exactly ONE operation-type union in the system.** It is
`SyncOperationType`, defined in `src/shared/sync.ts` and enumerated in §10.1a.
The local outbox uses the same namespaced values (`item.update`,
`item.undelete`, …) as the wire — there is no second, shorter local union to
translate from. Two lists of operation names is exactly how the vocabulary
drifted apart in the first place.

**`item.undelete` and `item.unarchive` are different operations.**
`item.undelete` clears a *delete* tombstone (`deleted_at`); `item.unarchive`
clears an *archive* mark (`archived_at`) and is what the existing "re-add from
History" flow (`POST /api/items/[id]/re-add`) sends. They have the same visible
effect but different semantics, and an implementer who conflates them will
resurrect a deleted item.

**`item.storeTags` carries a version per tag, not a flat list of ids.** The
server can only decide whether an addition and a removal of the same tag are
*concurrent* — and therefore whether the removal wins (§11) — if it knows the
version the client last saw for that pair. A flat `storeIds: string[]` cannot
say that: "the client saw this tag absent" and "the client saw it present at
version 4" are different facts, and only the second lets the server tell a
concurrent removal from a sequential one. So the payload is a list of
`{ storeId, version, present }` — the version the client last saw for that
pair, and whether it believed the tag was present — and **the item snapshot
carries the same per-pair versions**, so a client always knows what to send.

(The alternative is to test every pair against the operation's single
`baseVersion`, which requires every tag change to bump `items.version` and so
makes any unrelated field edit look like a concurrent tag change. The
per-pair version is more precise and is what §11's rule assumes.)

**The payload is a discriminated union, not `Record<string, unknown>`.** An
untyped payload is how an implementer ends up sending `storeIds` on an
operation that ignores them:

```ts
type OutboxPayload =
  | { name: string; quantity?: string | null; note?: string | null;
      categoryId?: string | null; storeIds?: string[] }              // item.create
  | { name?: string; quantity?: string | null; note?: string | null;
      categoryId?: string | null }                                   // item.update
  | { isChecked: boolean }                                          // item.check
  | { storeIds: { storeId: string; version: number; present: boolean }[] }  // item.storeTags
  | { fields: string[] }                                            // item.delete / item.undelete
  | { baseVersion: number }                                         // item.archive / item.bulkArchive
  | { field: string; value: unknown; serverValue: unknown }         // item.override (Keep mine)
  ;
```

The payload union is **keyed by the same `SyncOperationType`**, so
`OutboxPayload` is a discriminated union over `type` — a `item.check` payload
cannot carry `storeIds`.

**`pendingFields` is what makes §10.7 implementable.** A single `pending`
boolean cannot tell the client *which* fields a pending operation touched, so
the rule "the server's change does not overwrite the local pending value for
the fields the local op touched" could not be applied. `pendingFields` is the
union of the fields touched by the row's outstanding operations.

> ⚠️ **`pending`, `pendingFields` and `version` are render-relevant.** The
> current `ItemRow` memo comparator (`ItemRow.tsx:132-145`) compares a fixed
> list of props — id, name, quantity, note, categoryId, isChecked, storeIds —
> and returns "equal" for anything else. A pending badge or a "pending" visual
> state driven by those three new fields would therefore **never re-render** and
> would go stale. The comparator must compare them too, or the memoisation must
> be replaced by the reactive query's own change detection.

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

**`items`** — additive only, with one conversion:

| Column | Type | Purpose |
| --- | --- | --- |
| `id` | `uuid` PK | Unchanged type; the server now accepts client-supplied values. |
| `deleted_at` | `timestamptz` nullable | **Tombstone.** `NULL` = live. Set on delete; cleared only by an explicit restore. |
| `version` | `integer` not null default 1 | Incremented on every server-applied change. The client's `baseVersion` is checked against it. |
| `field_meta` | `jsonb` not null default `'{}'` | Per-field write metadata. **An entry exists only for a field that a write actually touched** — a row that has only ever had its name changed has a `field_meta` with one key, not eight. The tracked set is exactly: `name`, `quantity`, `note`, `categoryId`, `storeIds`, `isChecked`, `deletedAt`, `archivedAt`. Each entry is `{ v, lamport, device }`, where **`v` is the row `version` that the write produced** — so `field_meta[f].v` is directly comparable with the row's current `version`, and a client can tell whether a given field has moved since its base version. `device` is the id of the device that wrote it, which is what §11's check-wins rule reads (`field_meta["isChecked"].device`). Enables per-field conflict resolution without a separate table. **It also carries the ordering key for the tombstone:** `field_meta["deletedAt"].lamport` records the effective lamport of the delete that set `deleted_at`, so `item.undelete` can tell whether a *newer* delete exists (§11). |
| `updated_by_id` | `text` nullable → `user(id)` `ON DELETE SET NULL` | Who last changed the row. Named to match the existing `created_by_id` convention, and carries the same foreign key so the column cannot hold a user id that does not exist. |
| `lamport` | `bigint` not null default 0 | Highest Lamport value applied to this row. |
| `last_op_id` | `uuid` nullable | The `opId` of the operation that last wrote this row. Set by the compare-and-swap in the same batch. **It is corroborating, not the guard.** The guard is that the compare-and-swap matched **exactly one row** (§10.8). `last_op_id` additionally identifies *which* operation wrote the row, which matters for an operation that touches **several rows under one `opId`** (`item.bulkArchive`). It must not be used as the replay guard: after an operation has been applied, `last_op_id = $opId` is still true, so a replay would pass that predicate. — without it, a losing operation's change-log insert matches the **winner's** row and appends a second entry for one logical change, breaking the change log's total order. |

**One meaning of "now" per table.** The existing `items.created_at`,
`items.updated_at` and `items.archived_at` are `timestamp` (no time zone), while
every column this plan adds is `timestamptz`. A table holding both means two
different instants for "now", and comparing across them is a bug waiting to
happen. **The existing `timestamp` columns are converted to `timestamptz` in
the same migration that adds the new ones** — `ALTER TABLE … ALTER COLUMN …
TYPE timestamptz USING … AT TIME ZONE 'UTC'`. The conversion is a widening
change, not a narrowing one, and it must happen before any row is written, so
no `timestamp` value is ever compared against a `timestamptz` one.

**`is_active` is deprecated by *stopping* to use it, not by keeping it in step.**
The draft said it would be "kept in step with `deleted_at` for one release",
which imposes a dual-write on every writer forever with no mechanism to
enforce it — exactly the kind of trigger-free obligation that rots. Instead:
**the release that adds `deleted_at` stops reading `is_active` entirely.** The
column is left in place, unused, and dropped in a later migration. No trigger,
no dual-write, nothing to remember.

`archived_at` keeps its existing meaning: *cleared from the list, recoverable
from History*. It is orthogonal to `deleted_at` (*deleted, tombstoned*).
The current code conflates the two (defect B-11); 📋 **SPEC** separates them.

**`stores`, `categories`** — additive only:
`version integer not null default 1`, `field_meta jsonb not null default '{}'`,
`updated_by text nullable`, `last_op_id uuid nullable`, `lamport bigint not null default 0`,
and `deleted_at timestamptz nullable` — a store or a category is deleted with a
tombstone exactly like an item, so that a stale device cannot resurrect it and
so that `category.delete` and `store.delete` have the same semantics as
`item.delete` (§11).

**`item_stores`** — the item-to-store tag table needs to carry conflict
metadata, because `storeIds` is **not** a column on `items` and `field_meta`
holds one entry per *field*, not per tag. The add-wins rule (§11,
`item.storeTags`) therefore has no schema home today. Two options exist:

| Option | Verdict |
| --- | --- |
| Version the `item_stores` rows | **Chosen.** Preserves the relational model we are keeping, and gives each tag its own version, Lamport value, and writing device — which is exactly what a per-tag add-wins rule needs. |
| Make `storeIds` a real `jsonb` column on `items` | Rejected. It would replace a normalised join table with a denormalised blob, duplicating data the database already models well. |

The chosen option adds to `item_stores`:
`PRIMARY KEY (item_id, store_id)` — **the table currently has no primary key
at all**, so duplicate tag rows are possible today — plus
`version integer not null default 1`, `lamport bigint not null default 0`, and
`device_id text not null` (the device that last added the tag).

### 9.2 New tables

```sql
-- Append-only log of every applied change, per household.
CREATE TABLE sync_changes (
  seq          bigserial PRIMARY KEY,     -- global, monotonic; filter by household
  household_id text NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  entity_type  text NOT NULL,             -- CHECK: 'item' | 'category' | 'store'
  entity_id    uuid NOT NULL,
  op_id        uuid,                      -- NULL when there is no originating operation
                                         -- (e.g. the seeded default categories)
  version      integer NOT NULL,
  lamport      bigint NOT NULL,
  device_id    uuid NOT NULL,
  actor_id     text NOT NULL,
  payload      jsonb NOT NULL,            -- full entity snapshot after the change
  deleted      boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sync_changes_household_seq ON sync_changes (household_id, seq);
CREATE INDEX sync_changes_household_created ON sync_changes (household_id, created_at);  -- for pruning

-- Idempotency ledger. The primary key IS the idempotency guarantee.
-- NEVER PRUNED: it must outlive the change log, because a replayed operation
-- whose change-log row has been pruned must still be recognised as a
-- duplicate and replayed with its cached result. Pruning this table would
-- silently re-apply an operation that had already been applied.
CREATE TABLE sync_operations (
  op_id        uuid PRIMARY KEY,
  household_id text NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  device_id    uuid NOT NULL,
  actor_id     text NOT NULL,
  entity_type  text NOT NULL,
  entity_id    uuid NOT NULL,
  op_type      text NOT NULL,
  lamport      bigint NOT NULL,
  payload      jsonb NOT NULL,
  result       jsonb NOT NULL,            -- the FULL per-op response envelope, cached for replay
  outcome      text NOT NULL,             -- 'applied' | 'partial' | 'rejected' | 'duplicate'
  applied_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sync_operations_household ON sync_operations (household_id, applied_at);

-- Known devices per household (device id, name, last seen).
CREATE TABLE devices (
  id           uuid NOT NULL,
  household_id text NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  name         text NOT NULL,
  epoch        uuid,                      -- the epoch this device last synced against
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (household_id, id)
);

-- Per-household sync state: the Lamport clock, the change-log retention
-- floor, and the sync epoch. None of these fit on any other table.
CREATE TABLE household_sync_state (
  household_id      text PRIMARY KEY REFERENCES organization(id) ON DELETE CASCADE,
  epoch             uuid NOT NULL,          -- regenerated when a full resync occurs
  min_retained_seq  bigint NOT NULL DEFAULT 0,  -- the change-log floor for this household
  lamport           bigint NOT NULL DEFAULT 0,  -- the household's Lamport clock
  updated_at        timestamptz NOT NULL DEFAULT now()
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
  resolution   text NOT NULL,             -- 'lww' | 'check_wins' | 'delete_wins' |
                                           -- 'add_wins' | 'override' | 'rejected'
  winner_device_id uuid,                  -- the device whose value won (NULL for a server-side rejection)
  winner_lamport  bigint,                 -- the Lamport value of the winning write
  op_id        uuid NOT NULL,
  device_id    uuid NOT NULL,
  resolved_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
```

**Retention.** `entity_conflicts` rows are retained **at least as long as the
change log** — they are the only place a *losing* value survives, so pruning
them before the log they explain would discard the only record of what a
user's edit lost. They are pruned only once the corresponding change-log
window has passed.

`winner` as a `'server' | 'client'` pair is not expressive enough: a conflict
can be resolved by last-write-wins, by check-wins, by delete-wins, by
add-wins, by an explicit override, or by a server-side rejection — and the
winner is a **device**, not a side. The `resolution` enum names the rule that
was applied, and `winner_device_id` plus `winner_lamport` identify whose value
won and at what ordering value. The conflict's `id` is returned to the client
so the two sides can refer to the same conflict.

### 9.2a Indexes and constraints

Beyond the primary keys, these indexes are required. The pruner in particular
needs age access, not just sequence access.

```sql
-- The hot path: the active list for a household.
CREATE INDEX items_active_household ON items (organization_id) WHERE deleted_at IS NULL;
CREATE INDEX stores_household        ON stores (organization_id);
CREATE INDEX categories_household    ON categories (organization_id);
CREATE INDEX item_stores_item        ON item_stores (item_id);

-- Pruning by age, per household.
CREATE INDEX sync_changes_household_created ON sync_changes (household_id, created_at);
```

**The name-uniqueness constraint must be partial.** The existing
`categories` constraint spans soft-deleted rows, so a category name that was
deleted still blocks re-creating a category with that name — and `category.create`
must be able to re-create it (§11). The constraint therefore becomes:

```sql
-- A partial unique index, not a table constraint: soft-deleted rows are
-- outside it, so a deleted name is free to be reused.
CREATE UNIQUE INDEX categories_org_name_live ON categories (organization_id, name)
  WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX stores_org_name_live ON stores (organization_id, name)
  WHERE deleted_at IS NULL;
```

**This is the one piece of non-additive DDL in the whole migration plan** —
it replaces an existing table constraint rather than adding alongside it, so
§9.4 must sequence it carefully: it requires the `deleted_at` column to exist
first, and the backfill must run before the partial index is created, or the
constraint build will fail on rows that are soft-deleted but not yet marked.

---

### 9.3 Rationale for a server-side change log

Deriving changes from `items.updated_at` is unreliable: two changes in the same
millisecond are unordered, clock skew between the server and the client makes
comparison ambiguous, and `updated_at` cannot express *what changed*. A
monotonic `bigserial` per change is cheap, gives a total order, supports
incremental pull with a single indexed range scan, and doubles as an audit trail
of who changed what and when.

**Retention — two different clocks, and conflating them resurrects deleted
items.**

1. **Tombstones are never hard-deleted.** An `items` row whose `deleted_at` is
   set is retained indefinitely. If it were purged, a device that has been
   offline longer than the purge window would still hold the item as live, would
   reconnect, and would push an `item.update` for a row the server no longer
   knows is deleted — resurrecting it and breaking FR-24 and INV-07. Purging
   tombstones is therefore **not** offered as a space optimisation.
2. **The change log is pruned after 90 days.** `sync_changes` rows are the only
   thing that grows without bound, so they are the only thing pruned. The
   90-day window therefore defines the **maximum device offline window**: a
   client whose `lastSeq` predates the oldest retained `seq` for its household
   receives `fullResyncRequired: true` and re-bootstraps.

**A full resync is authoritative over local state, and the client re-bases
its pending operations onto it.** On a full resync the client discards its
local tables *and its local tombstones* and rebuilds them from the server
snapshot. Any operation still in the outbox carried a `baseVersion` from
*before* that snapshot, which is now stale — so the client **re-bases each
pending operation's `baseVersion` to the version in the snapshot** for that
entity. Without the re-base, every replayed operation would present a
`baseVersion` the server has long since moved past and would be reported as a
conflict, even though nothing was actually contested. This is what closes the second resurrection path: a device
that has been offline longer than the change-log window cannot carry stale
"live" state into the new world, because its entire local view — including any
item it believed was deleted — is replaced by the server's. Local
unsynchronised operations are preserved and replayed *after* the snapshot
(INV-11, SC-17); the server rejects any replayed **`item.update`,
`item.check`, or `item.storeTags`** operation against a tombstoned entity, so
a replay cannot resurrect an item. `item.undelete` is deliberately *not*
rejected — it is the operation that clears a tombstone — and is rejected only
when a **newer** delete exists (§11).

### 9.4 Migration safety

All migrations are **additive**: new nullable columns with defaults, new tables,
new indexes. No column is dropped and no row is rewritten in the same release
that introduces the sync model. `is_active` → `deleted_at` backfill is a single
separate migration that sets `deleted_at = now()` where `is_active = false`.
**The backfill is idempotent**: `WHERE is_active = false AND deleted_at IS
NULL`. Without the second predicate, re-running it would re-stamp every
legacy tombstone with a *new* `deleted_at`, silently moving the moment of
every historical deletion to the day the migration was re-run.

**The one exception is the partial unique index** on `categories` and `stores`
(§9.2a). It *replaces* the existing table constraint rather than sitting
alongside it, because the old constraint spans soft-deleted rows and would
block re-creating a deleted name. It is sequenced last: after the `deleted_at`
column exists and after the backfill has run, so the index build cannot fail
on rows that are soft-deleted but not yet marked. Everything else in this plan
can be applied in any order and rolled back by dropping what was added.

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

**Batch granularity: one HTTP request, one transaction, all of the
request's operations.** This is the only choice that satisfies both
constraints. Per-operation batches would mean one Neon HTTP request each — 100
queued operations could not meet the 1 s p95 sync target (§15.1). Per-household
batches would break the per-operation isolation the response envelope depends
on. So: **one batch per request, containing every operation in that request.**

Per-operation failure isolation is achieved by keeping the batch free of
statements that can *raise*. A statement that errors aborts the whole
transaction in PostgreSQL, and would take its neighbours down with it. So:

- **Validation, authorization, and duplicate-name checks happen before the
  batch**, and their failures are reported in `rejected[]` without touching
  the database.
- **A failed compare-and-swap is not an error** — it updates zero rows and the
  operation is simply classified as a conflict. No statement raises.
- **Unique-constraint violations are avoided**, not caught: `ON CONFLICT DO
  NOTHING` makes the create a no-op that the server reports as
  `DUPLICATE_NAME` for that operation alone.

With those three rules, every statement in the batch has a defined non-error
outcome, so all of the request's operations can share one transaction safely.

**Request**

```jsonc
{
  "householdId": "org_abc",
  "deviceId": "uuid-v7-of-this-browser-install",
  "deviceName": "Sara's iPhone",          // upserted into devices on first sight
  "lastSeq": 1042,              // highest seq this client has applied
  "clientClock": 87,            // client's current Lamport counter
  "operations": [
    {
      "opId": "uuid-v7",        // globally unique; the idempotency key
      "entityType": "item",
      "entityId": "uuid-v7",    // omitted for item.bulkArchive / item.bulkUnarchive,
                                // which name their targets in the payload
      "type": "item.update",    // one of the operation types in §10.1a
      "override": false,        // true = explicit user decision, bypasses LWW for the field
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
        { "id": "uuid",              // the conflict's id, so both sides can name it
          "field": "quantity",
          "localValue": "2 kg",
          "serverValue": "3 kg",
          "resolution": "lww",      // which rule decided it — see §11
          "winnerDeviceId": "uuid",
          "winnerLamport": 91 }
      ] }
  ],
  "applied": [
    { "opId": "…", "entityType": "item", "entityId": "…",
      "outcome": "applied",      // "applied" | "partially_applied"
      "result": { /* entity after apply */ },
      "conflicts": [] }          // conflicts on fields this op LOST but that still applied
  ],
  "changes": [
    { "seq": 1043, "entityType": "item", "entity": { /* EntitySnapshot — see below */ },
      "deleted": false, "version": 13, "updatedBy": "user_x", "updatedAt": "…" }
  ],
  "nextSeq": 1043,             // the highest seq DELIVERED in this response
  "hasMore": false,            // true when more changes remain beyond nextSeq
  "serverClock": 91,
  "epoch": "uuid",              // the household's sync epoch — changes when a full resync occurred
  "minRetainedSeq": 900,        // the change-log floor; a client below it must full-resync
  "fullResyncRequired": false
}
```

**The snapshot type.** `changes[].entity` is not an opaque blob — it is a
concrete type, so `src/shared/sync.ts` can define it once and both sides agree:

```ts
type EntitySnapshot = {
  id: string;
  organizationId: string;
  name: string;
  quantity: string | null;
  note: string | null;
  categoryId: string | null;
  isChecked: boolean;
  archivedAt: string | null;
  deletedAt: string | null;
  storeIds: { storeId: string; version: number; present: boolean }[];  // from item_stores
  fieldMeta: Record<string, { v: number; lamport: number; device: string }>;
  version: number;
  lamport: number;
  lastOpId: string | null;
  updatedById: string | null;
  updatedAt: string;
  createdAt: string;
};
```

Every column of §9.1's `items` table appears, plus `storeIds` (assembled from
`item_stores`) and the `fieldMeta` the client needs to resolve its own
outstanding operations. `deleted` on the change is **derived** from
`deletedAt IS NOT NULL` and is therefore redundant — it is included only so a
client can filter without inspecting the snapshot.

**The pull cursor.** `sync_changes.seq` is a *global* `bigserial`, filtered
per household — so there is no "the household's next sequence number". A
household's changes are interleaved with every other household's in the
global sequence. `nextSeq` is **the highest `seq` delivered in this response** — the maximum of
the rows actually returned — and it must never be set to a value higher than
that. The server scans `WHERE household_id = $1 AND seq > $lastSeq ORDER BY seq
LIMIT $page` and returns those rows; the cursor advances to the highest one it
returned, and `hasMore` says whether the page was full. The client then
repeats with `lastSeq = nextSeq` until `hasMore` is false.

Advancing the cursor past a `seq` the client never received would silently
skip those changes forever, so the cursor is derived from the **delivered**
rows, never from the scan's upper bound or from the last row in the global
sequence. Advancing `lastSeq` past a `seq` belonging to *another* household is
harmless — it is simply skipped on the next scan — but advancing past one
belonging to *this* household that has not yet committed is not, which is
exactly what the per-household advisory lock prevents (§10.8).

The household's Lamport clock, its change-log retention floor, and its sync
epoch live in `household_sync_state` (§9.2). `serverClock` is that household's
clock — the client merges it into its own (§10.3). `epoch` changes whenever a
full resync occurs, so a client can tell "the server reset my household's
history" from "I am merely behind".

**Error codes — a closed set.** The client branches on these, so the set is
closed and every code has a defined meaning. An unrecognised code must be
treated as a transient failure and retried, never as a rejection.

| Code | Meaning | Retryable? | Surfaced to the user? |
| --- | --- | --- | --- |
| `VALIDATION_FAILED` | The operation's payload does not satisfy the field rules | No | **Yes** — naming the field |
| `UNSUPPORTED_OPERATION` | The `type` is not in §10.1a, or is not supported by this server version | No | **Yes** — the operation is blocked, not dropped |
| `VERSION_CONFLICT` | The compare-and-swap matched zero rows: the entity changed underneath the operation | Yes, after re-reading | **Yes** — with the conflict card |
| `CONFLICT_RETRY_EXHAUSTED` | The operation kept losing the race; it was retried the maximum number of times | No | **Yes** — the change is blocked, not dropped |
| `DUPLICATE_NAME` | A category or store with that name already exists | No | **Yes** |
| `DUPLICATE_ENTITY_OPERATION` | The request contains two operations for the same entity | No | **Yes** — the client should coalesce (§10.1) |
| `DUPLICATE_OPERATION` | The request contains the same `opId` twice | No | **Yes** — the client should never send a duplicate |
| `DUPLICATE_ID` | A create used a client-supplied id that already exists, and the idempotency ledger does not hold this `opId` | No | **Yes** — the id collided with a different operation |
| `ENTITY_NOT_FOUND` | The entity does not exist **in the requested household**, or is tombstoned | No | **Yes** |
| `ENTITY_EXISTS` | The entity already exists — a create for an id that is taken | No | **Yes** |
| `CATEGORY_IN_USE` | The category is still referenced by items | No | **Yes** — naming the blocking items |
| `NOT_AUTHORIZED` | The actor is not permitted to perform this operation | No | **Yes** |
| `SESSION_EXPIRED` | The session is no longer valid | After re-authentication | **Yes** — "Sign in to sync" |

**One operation per entity per request, and one operation per `opId` per
request.** The apply is one statement per operation, and one statement cannot
carry two operations for the same entity — so a request may not contain them.
The **client coalesces** — it collapses its outbox to the final local state
per entity before sending, so a user who adds an item and then renames it
sends one `item.create` with the final name, not two operations. The **server
rejects** a request that contains two operations for the same entity, with
`DUPLICATE_ENTITY_OPERATION` for the second one. The request continues; the
other operations are unaffected.

Nor may a request contain the **same `opId` twice**. The `sync_operations`
insert would violate the primary key on the second one, and in PostgreSQL a
raised error **aborts the whole transaction** — undoing every operation in the
request that had already succeeded. The duplicate is therefore caught in the
**pre-batch validation**, alongside the other checks, and reported as
`DUPLICATE_OPERATION` for the second occurrence. The first occurrence proceeds
normally.

**Cross-household entity ids are `ENTITY_NOT_FOUND`, not 403.** Every
`entityId` in a request resolves **within the requested household**. An id
belonging to another household is simply not found *there*, so it is
`ENTITY_NOT_FOUND` for that operation and the request continues — a household
membership check must not become an oracle that confirms the id exists
elsewhere. `403 NOT_AUTHORIZED` is returned only when the **actor** is not a
member of the requested household at all, which is a property of the session,
not of the entity.

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
| `item.create` | item | `name`, `quantity`, `note`, `categoryId`, `storeIds` | The server accepts the client id, and the insert uses **`ON CONFLICT (id) DO NOTHING RETURNING id`**. Zero rows returned means the id was already taken: that is `duplicate` if the idempotency ledger holds this `opId`, and `DUPLICATE_ID` otherwise. The change-log row is built from the **inserted** row, never from the pre-existing item — otherwise a collision would log a change that did not happen. |
| `item.update` | item | any of `name`, `quantity`, `note`, `categoryId` | Field-level LWW by `(lamport, deviceId)`; the losing value is reported as a conflict. |
| `item.override` | item | `field`, `value`, `serverValue` | **Bypasses LWW** for the named field and applies unconditionally. This is the "Keep mine" action (§11.2) — a user decision, not a race. |
| `item.check` | item | `isChecked` (boolean) | **Check-wins** (§11). |
| `item.storeTags` | item | `storeIds: [{ storeId, version, present }]` | The tag set is resolved **per `(item_id, store_id)` pair** — each pair is an independent entity with its own `version`, `lamport` and `device_id` (§9.1). An addition and a removal of the same pair are ordered by `(lamport, deviceId)`; when they are **concurrent** the **removal wins**, so a deliberate removal is not undone by a concurrent re-add. Every pair whose outcome differs from what the operation asked for is reported in `conflicts[]`. The payload carries a version per pair because the server can only tell a *concurrent* removal from a sequential one if it knows the version the client last saw for that pair. |
| `item.delete` | item | — | **Delete-wins**, terminal tombstone. |
| `item.undelete` | item | — | Clears a **delete** tombstone (`deleted_at`); rejected if a newer delete exists. |
| `item.unarchive` | item | — | Clears an **archive** mark (`archived_at`) and returns the item to the active list. This is the "re-add from History" operation. |
| `item.bulkUnarchive` | item | `versions: { [itemId]: version }` | The bulk form of `item.unarchive` — used to undo a bulk "Archive checked items". |
| `item.archive` | item | `versions: { [itemId]: version }` | **Archive-wins**, but skips items whose `version` exceeds the version the op carries for that item. |
| `item.bulkArchive` | item | `versions: { [itemId]: version }` | The bulk form of `item.archive`; reports how many items it skipped. |
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

**The cached `result` is the full per-operation response envelope**, including
the `conflicts[]` array. This is what makes a replay *identical* rather than
merely equivalent: if a losing operation is re-sent after a timeout, the
replayed response must still carry the server's value, or the client never
learns what it lost. Storing only the applied entity would leave a re-sent
losing operation with no way to show the "Keep mine / Use theirs / Dismiss"
card.

**Clock merge.** The client sets `lamport = max(localLamport, serverClock) + 1`
for every operation it creates after a sync, and the server sets
`row.lamport = max(row.lamport, op.lamport)` when applying. A Lamport counter
never goes backwards, so an operation created after the client has seen the
server's clock always outranks operations the client has not yet seen. Without
this rule a "fresh" lamport is only fresh relative to the *local* counter, so
"Keep mine" could re-queue a value that still loses.

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

**The epoch a device last synced against is recorded in `devices.epoch`.**
When it differs from `household_sync_state.epoch`, that device receives
`fullResyncRequired: true` **regardless of its `lastSeq`**, and `devices.epoch`
is set to the household's epoch when the device completes the resync. A device
with no row, or a `NULL` epoch, has never synced and receives the full
snapshot. This is what makes a *server-side history reset* detectable by a
client whose `lastSeq` still looks plausible.

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
   fields named in `pendingFields`**. The local edit stays queued; the server
   value is retained as the op's conflict context. If the server's change
   touches a *different* field, it is applied immediately — this is what lets
   "one device checks an item while another edits its quantity" merge cleanly.
4. **The local row's `version` advances to the server's version even when the
   server's *value* is withheld.** The server has already bumped the row's
   `version`; if the client does not advance its own `version` to match, every
   subsequent operation the client creates carries a stale `baseVersion` and
   will spuriously conflict. `version` tracks *what the client has seen*, not
   *which values it has accepted*.

**The phases must not be interleaved.** Resolving the outbox first is what
makes rule 3 correct: by the time the pulled changes are applied, the client's
own operations are already known to be either accepted or rejected, so a
change produced by the client's *own* just-pushed operation does not overwrite
the local value it just wrote.

---

### 10.8 The apply batch in SQL

Each operation is applied by **one** statement, not two. This matters: a plain
`INSERT` in a second statement runs even when the compare-and-swap matched zero
rows, leaving an orphan change-log entry for a change that never happened. The
`EXISTS (SELECT 1 FROM items WHERE version = base + 1)` variant is also wrong
— it is true when *someone else* won the race. Only a data-modifying CTE
gates correctly.

```sql
-- The PRE-IMAGE, read from this statement's snapshot. Every CTE in the
-- statement sees the same snapshot, so this is the row as it was before
-- the update -- which is what a conflict record needs.
before AS (
  SELECT * FROM items
   WHERE id = $entity_id
     AND organization_id = $household_id
     AND version = $base_version
),
applied AS (
  UPDATE items AS t
     SET version       = t.version + 1,

         -- PER FIELD: the incoming value is written ONLY when this
         -- operation wins that field. The row-level CAS gates the row;
         -- these expressions gate the fields. A field the operation
         -- loses keeps the server's value, and is recorded as a conflict
         -- by the `conflicts` CTE below.
         name          = CASE WHEN $op_type = 'item.update' AND $fields ? 'name'
                               AND ($op_lamport, $device_id) >
                                   (COALESCE((b.field_meta->'name')->>'lamport','0')::bigint,
                                    COALESCE((b.field_meta->'name')->>'device',''))
                              THEN $payload->>'name' ELSE t.name END,
         quantity      = CASE WHEN $op_type = 'item.update' AND $fields ? 'quantity'
                               AND ($op_lamport, $device_id) >
                                   (COALESCE((b.field_meta->'quantity')->>'lamport','0')::bigint,
                                    COALESCE((b.field_meta->'quantity')->>'device',''))
                              THEN $payload->>'quantity' ELSE t.quantity END,
         note          = CASE WHEN $op_type = 'item.update' AND $fields ? 'note'
                               AND ($op_lamport, $device_id) >
                                   (COALESCE((b.field_meta->'note')->>'lamport','0')::bigint,
                                    COALESCE((b.field_meta->'note')->>'device',''))
                              THEN $payload->>'note' ELSE t.note END,
         category_id   = CASE WHEN $op_type = 'item.update' AND $fields ? 'categoryId'
                               AND ($op_lamport, $device_id) >
                                   (COALESCE((b.field_meta->'categoryId')->>'lamport','0')::bigint,
                                    COALESCE((b.field_meta->'categoryId')->>'device',''))
                              THEN ($payload->>'categoryId')::uuid ELSE t.category_id END,

         -- check-wins uses baseVersion, NOT lamport ordering (section 11).
         is_checked    = CASE WHEN $op_type = 'item.check'
                               AND $base_version >=
                                   COALESCE((b.field_meta->'isChecked')->>'v','0')::int
                              THEN ($payload->>'isChecked')::boolean ELSE t.is_checked END,

         -- The tombstone and the archive mark are set by their own
         -- operations, and are cleared by their own operations.
         archived_at   = CASE WHEN $op_type IN ('item.archive','item.bulkArchive')
                              THEN now() ELSE t.archived_at END,
         deleted_at    = CASE WHEN $op_type = 'item.delete'
                              THEN now() ELSE t.deleted_at END,

         -- field_meta MUST be maintained per won field. Without this, every
         -- per-field rule in section 11 reads metadata the apply never
         -- writes, and the next operation's comparison has nothing to
         -- compare against.
         field_meta    = t.field_meta || jsonb_build_object(
                           'name',        jsonb_build_object('v', t.version + 1, 'lamport', $op_lamport, 'device', $device_id),
                           'quantity',    jsonb_build_object('v', t.version + 1, 'lamport', $op_lamport, 'device', $device_id),
                           'note',        jsonb_build_object('v', t.version + 1, 'lamport', $op_lamport, 'device', $device_id),
                           'categoryId',  jsonb_build_object('v', t.version + 1, 'lamport', $op_lamport, 'device', $device_id),
                           'isChecked',   jsonb_build_object('v', t.version + 1, 'lamport', $op_lamport, 'device', $device_id),
                           'deletedAt',   jsonb_build_object('v', t.version + 1, 'lamport', $op_lamport, 'device', $device_id),
                           'archivedAt',  jsonb_build_object('v', t.version + 1, 'lamport', $op_lamport, 'device', $device_id)
                         ),

         lamport       = GREATEST(t.lamport, $op_lamport),
         last_op_id    = $op_id,
         updated_at    = now(),
         updated_by_id = $actor_id
    FROM before AS b
   WHERE t.id = $entity_id
     AND t.organization_id = $household_id
     AND t.version = $base_version          -- the row-level compare-and-swap
  RETURNING t.id, t.organization_id, t.name, t.quantity, t.note, t.category_id,
            t.is_checked, t.archived_at, t.deleted_at, t.field_meta, t.version,
            t.lamport, t.last_op_id, t.updated_by_id, t.updated_at, t.created_at
),
lost AS (
  -- The fields this operation LOST: the operation asked for the field,
  -- the server's value was newer, so the pre-image IS the winning value.
  SELECT f.field,
         f.local_value,
         CASE f.field WHEN 'name' THEN b.name WHEN 'quantity' THEN b.quantity
                      WHEN 'note' THEN b.note WHEN 'categoryId' THEN b.category_id
                      WHEN 'isChecked' THEN b.is_checked END AS server_value,
         COALESCE((b.field_meta->f.field)->>'device','')::uuid AS winner_device_id,
         COALESCE((b.field_meta->f.field)->>'lamport','0')::bigint AS winner_lamport
    FROM before AS b,
         unnest($fields) AS f(field)
   WHERE $op_type IN ('item.update','item.check')
     AND NOT (($op_lamport, $device_id) >
              (COALESCE((b.field_meta->f.field)->>'lamport','0')::bigint,
               COALESCE((b.field_meta->f.field)->>'device','')))
     AND (f.field <> 'isChecked' OR $base_version <
          COALESCE((b.field_meta->'isChecked')->>'v','0')::int)
),
conflicts AS (
  INSERT INTO entity_conflicts (household_id, entity_type, entity_id, field,
                                local_value, server_value, resolution,
                                winner_device_id, winner_lamport, op_id, device_id)
  SELECT $household_id, $entity_type, $entity_id, l.field,
         l.local_value, l.server_value, $resolution,
         l.winner_device_id, l.winner_lamport, $op_id, $device_id
    FROM lost AS l
  RETURNING id
),
logged AS (
  INSERT INTO sync_changes (household_id, entity_type, entity_id, op_id,
                             version, lamport, device_id, actor_id, payload, deleted)
  SELECT $household_id, $entity_type, a.id, $op_id, a.version, $op_lamport,
         $device_id, $actor_id, to_jsonb(a), (a.deleted_at IS NOT NULL)
    FROM applied AS a                     -- MUST select FROM the CTE
  RETURNING seq
)
INSERT INTO sync_operations (op_id, household_id, device_id, actor_id,
                             entity_type, entity_id, op_type, lamport,
                             payload, result, outcome)
SELECT $op_id, $household_id, $device_id, $actor_id, $entity_type, a.id,
       $op_type, $op_lamport, $payload,
       -- The FULL per-operation response envelope, so a replay is identical.
       jsonb_build_object(
         'entity',    to_jsonb(a),
         'conflicts', COALESCE((SELECT jsonb_agg(to_jsonb(c) - 'id')
                                   FROM conflicts AS c), '[]'::jsonb)
       ),
       'applied'
  FROM applied AS a
RETURNING op_id;
```

**The batch holds the whole request.** Its first element is
`SELECT pg_advisory_xact_lock(hashtextextended($household_id, 0))`; its second
and subsequent elements are one statement per operation, in the order the
client sent them. All of them commit or none do (§10.1 — one HTTP request, one
transaction, all of the request's operations).

**Lock order is fixed: household first, then entity rows.** The per-household
advisory lock is always taken before any row lock, and the rows a batch
touches are locked in a deterministic order (by entity id). Because every
request for a household takes the same first lock, two batches for the same
household cannot deadlock against each other — one simply waits. A fixed
entity-row order keeps the same guarantee if a future version ever batches
across households.

`hashtextextended(household_id, 0)` is the interim choice: a 64-bit hash, so
an accidental collision between two households — and therefore an unnecessary
serialisation, or a lock on the wrong household — is vanishingly unlikely. If
a household's rows ever need to be locked in a different order, a dedicated
per-household lock table keyed on a `uuid` replaces it without touching the
protocol.

Because they share one transaction, **no statement in the batch may raise.**
Every failure mode must be a defined non-error outcome: validation,
authorization and duplicate-name checks happen before the batch; a failed
compare-and-swap updates zero rows; and creates use `ON CONFLICT DO NOTHING`
rather than letting a unique violation abort the transaction (§10.1).

**Zero rows mean different things for different operations.** For
`item.archive` and `item.bulkArchive`, §11's rule is that an item whose
`version` exceeds the version the operation carries is **skipped** — so a
zero-row compare-and-swap on that item is the *specified outcome*, not a
conflict: count it, write no change-log row for it, do not re-apply it, and
report the skipped count. For every other operation type, zero rows mean a
genuine conflict, as described above.

**The row-level CAS and the per-field gates are different things.** The
`WHERE version = $base_version` clause gates the *row* — it decides whether
this operation is still the one that should write at all. The `CASE`
expressions gate the *fields* — an operation that wins the row may still lose
individual fields to a concurrent write. A `CASE` that wrote the incoming
value unconditionally would apply a losing field and report no conflict, which
is exactly the silent discard that FR-23 forbids.

**`field_meta` must be maintained by the same statement.** Every per-field rule
in §11 reads `field_meta[f].lamport` or `field_meta[f].v`, so an apply that
does not write `field_meta` leaves the next operation with nothing to compare
against — the second concurrent edit would find no metadata and would win
unconditionally. The `field_meta` assignment merges one entry per field the
operation **won**, carrying the new row `version`, the operation's lamport, and
its device.

**The conflict record is written by the same statement, from the pre-image.**
The `before` CTE reads the row from the statement's snapshot — the state before
the update — so `lost.server_value` is the value that won, and
`lost.local_value` is what the operation asked for. Writing the conflict in a
separate statement would race with the write it describes.

**The tombstone and the archive mark are set by their own operations**, and
cleared by their own operations (`item.undelete` clears `deleted_at`,
`item.unarchive` clears `archived_at`). The change-log's `deleted` flag is
**derived from the row** — `(a.deleted_at IS NOT NULL)` — rather than hardcoded,
so a tombstone is always logged as a deletion and an archive is never
mistaken for one.

**A create is a different statement shape.** `item.create` inserts a
client-supplied id, so the id can already exist:

```sql
WITH created AS (
  INSERT INTO items (id, organization_id, name, quantity, note, category_id,
                     created_by_id, version, lamport, last_op_id)
  VALUES ($entity_id, $household_id, $payload->>'name', $payload->>'quantity',
          $payload->>'note', ($payload->>'categoryId')::uuid,
          $actor_id, 1, $op_lamport, $op_id)
  ON CONFLICT (id) DO NOTHING
  RETURNING id, organization_id, name, quantity, note, category_id,
            is_checked, archived_at, deleted_at, field_meta, version,
            lamport, last_op_id, updated_by_id, updated_at, created_at
)
-- ... then the same change-log and idempotency inserts, selecting FROM created
```

Zero rows means the id was already taken. That is `duplicate` if the
idempotency ledger holds this `opId` — a replay — and `DUPLICATE_ID`
otherwise. **The change-log row is built from the inserted row, never from the
pre-existing item**: selecting the existing row instead would log a change
that did not happen, and would report the operation as applied when nothing was
written.

**Implementation subtleties that will bite an implementer.**

1. **Drizzle has no builder for `WITH … UPDATE … RETURNING`.** Use the `sql`
   template literal and pass the resulting `SQL` object to `db.batch()`.
2. **A data-modifying CTE that is not referenced by the main query still
   executes.** The outer `INSERT` must `SELECT … FROM applied` — otherwise the
   `applied` CTE may be optimised away, the update never happens, and the
   batch commits an empty change log. The `logged` CTE above is included for
   the same reason.
3. **The guard is that the compare-and-swap matched exactly one row.** The
   `sync_changes` and `sync_operations` inserts both select `FROM applied`,
   and `applied` yields a row only when the `UPDATE … WHERE version =
   $base_version` matched. That is the whole guard: a replayed operation
   matches zero rows, so it writes no change-log row and no second ledger
   entry.

   `last_op_id` is **corroborating, not the guard** — after an operation has
   been applied, `last_op_id = $op_id` is still true, so using it as the
   predicate would let a replay through. It is kept because it identifies
   *which* operation wrote a row, which matters for an operation that touches
   several rows under one `opId` (`item.bulkArchive`).

   `last_op_id` is nonetheless what prevents a *losing* operation's change-log
   insert from matching the *winner's* row: the losing operation's `applied`
   CTE is empty, so it writes nothing at all (§11, ADR-14).
4. **Zero rows is a success, not an error.** The batch statement has three
   outcomes, and they must be kept distinct:

   | Outcome | Meaning | Action |
   | --- | --- | --- |
   | **One row** | The compare-and-swap won. | Applied. |
   | **Zero rows** | Either the compare-and-swap was **lost**, or the operation was **already applied** by a concurrent request carrying the same `opId`. | Re-read the row **in a fresh round trip** and consult the ledger first. If `sync_operations` holds a row for this `opId`, the operation was applied concurrently — report `duplicate` and replay its cached `result`. Otherwise it is a genuine conflict: re-run §11's per-field decision against the fresh state and re-apply with the new `baseVersion`. Bounded at **3 attempts**; then reject with `VERSION_CONFLICT`. |
   | **The statement raised** | A genuine database error. | Retry the whole batch. |

   An empty result set must **not** be treated as a transport failure. The
   batch may well have committed, and a blind retry would re-send operations
   that were already applied.
5. **All the CTEs in one statement share one snapshot.** `WHERE version =
   $base_version` is evaluated against the snapshot taken at statement start,
   so a transaction that committed after that snapshot is invisible to it.
   That is exactly why the losing operation must re-read in a **separate round
   trip** rather than inside the batch — and it is why the outer statements
   may read **only** from `applied`. Never re-read `items` inside the same
   statement to "confirm" the compare-and-swap: that read sees the same stale
   snapshot and cannot see the competing write either.
6. **Build the change-log payload from the CTE's `RETURNING`, and return every
   column.** The change-log snapshot must be complete, because §10.6 and
   §10.7 promise the client a *full* snapshot — without `archived_at` the
   client could not rebuild History, and without `deleted_at` it could not
   rebuild a tombstone. The `RETURNING` list above is therefore exhaustive;
   an abbreviated list silently drops fields from every logged snapshot.
7. **`db.batch()` accepts `SQL` objects**, not Drizzle query builders, for
   raw statements. The advisory lock and the CTE above are both `sql`
   templates.

**`last_op_id` — three constraints, because it is redundant with mechanisms
that already exist.** It is *additional* to the idempotency ledger (ADR-06)
and to `field_meta[f].device`, not a replacement for either.

- It is **additive to, never a substitute for,** the version compare-and-swap.
  If `last_op_id` replaced `version = $base_version`, concurrency detection
  would be lost: a losing operation would overwrite the winner's row.
- It carries **no foreign key** to `sync_operations`. An FK would make that
  ledger un-prunable, so the idempotency history could never be trimmed.
- It is **not** the "written by a different device?" signal. §11's check-wins
  rule needs the **per-field** `field_meta.isChecked.device`, because two
  devices can write different fields of the same row. A per-row column cannot
  answer that question.

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
| `item.check` | `isChecked` | **Check-wins**, with the comparison stated exactly: the uncheck **applies** iff `op.baseVersion >= field_meta["isChecked"].v` — that is, iff the uncheck was made against a version that already included the check. Otherwise the check is newer than the uncheck's base, the check stands, and the uncheck is reported as a conflict. | Device A checks; device B (offline) unchecks from an older base → `baseVersion < field_meta["isChecked"].v` → **the item stays checked**. | **Yes** — the item shows `Checked by <name>` and an entry is added to "Needs attention". The *outcome* is intuitive, but the **user's action was overridden**, and FR-23 requires that an overridden edit is never silently discarded. |
| `item.storeTags` | `storeIds` | The tag set is resolved **per `(item_id, store_id)` pair**, not as a set — each pair is an independent entity with its own `version`, `lamport`, and `device_id` (§9.1). For a single pair: an addition and a removal are ordered by `(lamport, deviceId)`, and when they are **concurrent** (neither operation's base version includes the other's write) the **removal wins** — a deliberate removal must not be undone by a concurrent re-add. Every pair whose outcome differs from what the operation asked for is reported in `conflicts[]` and surfaced. | A adds "Costco", B adds "Aldi" → both tags present. A removes "Costco" while B concurrently re-adds it → **the removal wins**, and A is told. | **Yes**, for any contested or dropped tag |
| `item.delete` | `deletedAt` | **Delete-wins, terminal.** Only a strictly later `restore` operation clears it. | Device A deletes, device B edits → **item stays deleted**. B's edit is not silently lost; it is recorded as a conflict against a deleted entity. | **Yes** |
| `item.undelete` | `deletedAt` | Clears a **delete** tombstone. Rejected if a **newer** delete exists — compared as: the tombstone's effective lamport (`field_meta["deletedAt"].lamport`, the lamport of the delete that set it) must not be **greater than** the undelete's own lamport. The delete's ordering value is persisted on the row for exactly this purpose (§9.1). | Delete-then-undelete ordering is respected: a delete at lamport 10 is not undone by an undelete at lamport 5. | No |
| `item.unarchive` | `archivedAt` | Clears an **archive** mark and returns the item to the active list. Distinct from `item.undelete`, which clears a *delete* tombstone — conflating them resurrects a deleted item. | Re-adding an archived item on two devices → the item is unarchived once; the second is a no-op. | No |
| `item.bulkUnarchive` | `archivedAt` | The bulk form of `item.unarchive`, carrying a `baseVersion`. Skips items changed since the base, exactly as `item.bulkArchive` does. | Undoing a bulk archive does not resurrect an item another device changed in the meantime. | No |
| `item.archive` (clear completed) | `archivedAt` | **Archive-wins** over concurrent edits to other fields, but the op carries a **version per candidate item** and **skips any item whose `version` exceeds it** — i.e. items changed on another device since the clear was initiated are not archived. | A clears completed offline; B unchecks an item and changes its quantity → B's item is **not** archived. | **Yes**, the count of skipped items is reported |
| `item.bulkArchive` (clear completed, bulk) | `archivedAt` | The bulk form of `item.archive`: the same per-item version skip rule, applied across every checked item. The response reports how many items were skipped and why. | A clears completed offline; B changes an item's quantity → that item is **skipped**, not archived, and A is told how many were skipped. | **Yes**, the skipped count is reported |
| `category.create` | all | Unique `(household_id, name)`. The insert uses **`ON CONFLICT DO NOTHING`**, and a no-op insert is reported as `DUPLICATE_NAME` for that operation alone. It must **not** rely on catching a unique-violation error: in PostgreSQL an error inside a transaction aborts the whole transaction, so one duplicate name would take every other operation in the request down with it. | Two devices create the same category name → one succeeds, the other is rejected with `DUPLICATE_NAME`. Neither affects the other's operations. | **Yes** |
| `category.rename` | `name` | Field-level LWW. | Winner applies; loser recorded. | **Yes** |
| `store.rename` | `name` | Field-level LWW. | Winner applies; loser recorded. | **Yes** |
| `store.create` | all | Duplicate names are handled with **`ON CONFLICT DO NOTHING`** and reported as `DUPLICATE_NAME` for that operation alone, for the same reason as `category.create`: a raised constraint violation would abort the shared transaction. The store is created with the client's id. | Two devices create the same store name → one succeeds, one is rejected and surfaced. Neither affects the other's operations. | **Yes** |
| `store.delete` | all | Removes the store's item tags. The items themselves survive, untagged. A concurrent `item.storeTags` on the same store loses to the delete. | A tags an item to a store while B deletes the store → the store is gone and the item keeps no tag for it. | No (the outcome is intuitive) |
| `category.delete` | all | Rejected with `CATEGORY_IN_USE` while any item still references the category. The client is told which items block it. | Two devices delete categories → one succeeds; the other is rejected and surfaced. | **Yes** |
| `item.override` | the contested field | **Bypasses the LWW comparison** for the named field. This is the "Keep mine" action (§11.2) — a user decision, not a race. Two boundary rules: (1) an override on a **tombstoned** entity is rejected with `ENTITY_NOT_FOUND` — you cannot keep your version of something that has been deleted; (2) overriding **`isChecked` is allowed**, and beats check-wins, because an explicit user decision outranks a rule that another user happened to trigger first. The value it replaced is written to `entity_conflicts` so the *other* device learns that its edit was overridden. | Device B's edit is overridden by device A's "Keep mine" → B is told, on its next sync, that its value was replaced. | **Yes**, on both sides |

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

**Entry point.** The "Needs attention" panel is opened by tapping the status
chip when it reads `N need attention` (§6.1). That chip state is the only
entry point; there is no separate "conflicts" nav item, because a shopper in
an aisle does not go looking for one.

**Three kinds of entry, three card types.** The panel is not one generic
error list — each kind of conflict needs different information and different
actions, and only the first has a "Keep mine".

**(a) Field conflict** — SC-03. Two devices edited the same field.

```
Milk — quantity differs
  This device   2 kg      ← your offline edit
  Other device  3 kg      ← won
  [Keep mine]  [Use theirs]  [Dismiss]
```

The card MUST name the **winning device** (e.g. `Other device — Sara's phone`)
and must never imply recency — the winner is decided by a logical clock, not
by wall-clock time (§5, SC-03).

**(b) Deleted elsewhere** — SC-05. Another device deleted an item you edited.

```
Milk — deleted on another device
  This device   2 kg      ← your edit
  Other device  deleted it
  [Undo my edit]  [Dismiss]
```

There is no "Keep mine": the item is gone, and the only meaningful action is
to undo your own edit (§6.3) or accept the deletion.

**(c) Server rejection** — SC-14. The server refused a locally accepted
change (a deleted category, a duplicate name, a lost authorization).

```
Milk — could not be saved
  Reason       Category "Produce" no longer exists
  [Choose another category]  [Discard the change]
```

There is no "Keep mine" here either — the server's rejection is about a
*constraint*, not a race, and the fix is to change the input.

**Checked by someone else** — the check-wins case (§11, `item.check`). The
item itself shows `Checked by <name>` inline, and a panel entry explains why
an uncheck did not take effect:

```
Milk — still checked
  Another device checked this item
  [Dismiss]
```

**"Keep mine" is a user decision, not a race.** It does **not** re-queue the
losing value as an ordinary operation, because that would re-enter the same
comparison that just lost and could lose again — the shopper would click
"Keep mine" and see no effect. Instead it sends an explicit **override**
operation carrying `override: true`, which bypasses the last-write-wins
comparison for the contested field and is applied unconditionally. It is
recorded like any other operation, so it syncs and can itself be overridden by
a later explicit user decision.

**The override is not silent on the other device.** An override discards the
value it replaced. If that happened on the other member's device, their edit
would vanish with no record — an INV-04 violation on their side, not ours. The
server therefore writes an `entity_conflicts` row when it applies an override,
naming the field, the discarded value, and the value that replaced it. That
record is pulled by the other device on its next sync and surfaces there as a
"Needs attention" entry. The device that pressed the button sees its own
action reflected; the other device learns it happened.

**"Use theirs"** accepts the server value and discards the local one.
**"Dismiss"** leaves the conflict unresolved but removes it from the panel;
the local value is not applied.

**Undo and "Keep mine" are different things and must not be conflated.**
Undo reverses *your own last action* and is a local operation in the outbox
(§6.3). "Keep mine" wins a field that *another device* contested (§11). A
conflict card offers "Keep mine"; a row offers Undo. Neither implies the
other.

The card MUST name the **winning device**, never imply recency — the winner
is decided by a logical clock, not by wall-clock time (§5, SC-03).

---

## 12. Authentication and authorization

### 12.1 Sessions

- **Better Auth is retained** for credential handling, session cookies, and the
  organization plugin.
- Sessions are 30-day sliding (existing behaviour). 📋 **SPEC**: the signed-in
  **identity** (user id, name, email) and the household list are cached locally
  so the client can display them while offline. **The session token is never
  written to local storage** — it is not needed to render the header, and
  writing it would widen the impact of any script-injection flaw in the page.
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

Isolation is enforced in two layers, deliberately:

1. **Application layer** — every query is scoped by `organization_id` via a
   shared scope helper that cannot be forgotten. (Today the predicate is applied
   correctly — verified — but it is repeated by hand in every call site.) The
   helper becomes the **only** sanctioned way to touch a household-scoped table:
   direct `db.select().from(items)` calls outside it are forbidden and enforced
   by a lint rule and by code review.
2. **Test layer** — an integration test asserts that a user of household A
   receives `404` for household B's item on read, update, and delete. This test
   must run against a **real** database, because the current mocked `db` ignores
   `where()` clauses entirely and would pass even if the predicate were deleted.

**PostgreSQL row-level security is deliberately NOT used** (ADR-12). On the
Neon HTTP driver each statement is an independent request with no session
state, so a policy keyed to `current_setting('app.current_household')` cannot be
set reliably for the whole request. A fail-open policy silently returns every
row; a fail-closed one silently returns none. RLS would give the *appearance* of
defence in depth while behaving unpredictably — which is worse than not having
it, because it would suppress the care the application-layer check needs. RLS is
recorded as **deferred**, to be reconsidered only if the Neon WebSocket driver
(adopting real session state) is adopted, at which point it becomes a genuine
second layer rather than a false one.

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
| `is_active = false` rows | One migration sets `deleted_at = now()` for them (`WHERE is_active = false AND deleted_at IS NULL`, so it is idempotent), and the code stops reading `is_active` in the same release, so the tombstone model is consistent from the first sync. |
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
| SEC-02 | Every household-scoped query MUST be scoped by `organization_id`, enforced by a shared scope helper that is the only sanctioned access path to household-scoped tables. RLS is explicitly not used (ADR-12). |
| SEC-03 | Only owners/admins may invite, mint join links, or remove members — enforced server-side, with **403** responses (not 500). |
| SEC-04 | No endpoint may return data without a session check. `GET /api/invitation-email` must require a session or be removed. |
| SEC-05 | The service worker MUST NOT cache any authenticated API response. Only the static shell and hashed static assets may be cached. |
| SEC-06 | Cached shell responses MUST NOT contain user data. This is what makes a shared, cross-user cache safe. |
| SEC-07 | The local database contains the household's shopping data. It MUST be cleared on sign-out unless the user explicitly chooses to keep a copy. |
| SEC-08 | The `deviceId` used for sync MUST be a random per-install identifier with no hardware fingerprinting. |
| SEC-09 | The `ADMIN_EMAIL` mechanism MUST be replaced by a role on the `member` table (or a dedicated `platform_admin` table) before the admin endpoints are exposed further. |
| SEC-10 | Rate limiting MUST be applied to sign-up, sign-in, invitation, and join-link endpoints. |
| SEC-11 | Invitation and join-link tokens MUST have a short expiry and MUST be revocable. Today `createJoinLink` deletes all prior links (S-2); 📋 **SPEC**: multiple concurrent links are permitted, each revocable individually. |
| SEC-12 | The `items.name`, `quantity`, and `note` fields contain user content. 📋 **SPEC**: they are never written to logs, never included in analytics, and never sent to the email provider. **This covers the tables added by §9.2 that carry the same content:** `sync_changes.payload` holds a full entity snapshot — including item text — and `sync_operations.payload` holds the operation's own fields. Both are written to the database and are not logged. |

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
- **Offline cold start**: with the network off **and the local database and
  service-worker cache already populated**, open the app → the list renders
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
| Rich conflict UI beyond the three "Needs attention" card types (§11.2) | Sufficient for the household scale. |
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
| **ADR-05** | **Server-side change log (`sync_changes`) as the source of truth for incremental sync, with the apply path serialized per household so that `seq` allocation order equals commit order.** | A monotonic `bigserial` gives a total order that `updated_at` cannot, survives clock skew, supports one indexed range scan per pull, and doubles as an audit trail. **The serialisation is not optional:** `seq` is allocated at INSERT time and `created_at default now()` is transaction-start time, so two concurrent devices can allocate `seq` 100 and 200 and commit in the opposite order. A client pulling `seq > lastSeq` can then advance past 100 before 100 commits and **never receive that change** — silent loss from the log that is the source of truth. Taking a per-household transaction-scoped advisory lock — `pg_advisory_xact_lock(hashtextextended(household_id, 0))` — as the first statement of the apply batch makes allocation order and commit order the same order. The hash is `hashtextextended` (64-bit, PostgreSQL 11+) rather than `hashtext` (32-bit), because a 32-bit hash makes an accidental collision between two households — and therefore an unnecessary serialisation or, worse, a lock on the wrong household — far more likely than it should be. | Deriving changes from `items.updated_at` — ambiguous ordering, no per-field history, breaks on equal timestamps. Polling the full table — O(n) per sync, and would not survive a long offline period cleanly. Relying on `bigserial` alone without per-household serialisation — commits can invert, and a change can be skipped forever by a pulling client. |
| **ADR-06** | **Idempotency keyed on a client-generated `opId`**, recorded in a dedicated `sync_operations` table. | The primary key *is* the guarantee. Replay returns the cached result. Handles every duplication scenario uniformly (retry, timeout, crash-restart, batch replay). | `If-Match`/ETag on entities — does not cover a queued operation that was never acknowledged, and does not cover batch-level retries. |
| **ADR-07** | **Per-field conflict resolution with per-field version metadata in `field_meta jsonb`.** | Satisfies "conflict resolution per operation type rather than simplistic last-write-wins" without a separate version table, a CRDT, or a per-field row. JSONB keeps the whole row in one heap tuple, avoiding a second table and a join on the hot path. | Entity-level LWW — loses a concurrent quantity edit when a check arrives, which is exactly the scenario the brief calls out. A CRDT — unjustifiable complexity at household scale. |
| **ADR-08** | **Client-generated UUIDv7 primary keys; the server accepts client ids.** | An offline client must know a record's id before the server has seen it. UUIDv7 is time-ordered (good index locality) and fits the existing `uuid` column type. | Server-generated ids — the client cannot reference a record it created offline. ULID — needs a `text`/custom column and a lexicographic-sort assumption; UUIDv7 is a standard UUID. |
| **ADR-09** | **Tombstones (`deleted_at`) are terminal and are NEVER hard-deleted from the server.** The 90-day retention window applies only to the change log, and it defines the maximum device offline window beyond which a full resync is mandatory and authoritative (FR-31, §9.3). | Makes resurrection impossible (FR-24) and makes "delete" and "clear completed" two clearly distinct, separately recoverable behaviours (fixes B-11). | Hard delete — a stale device would resurrect the item on its next sync. The current `is_active` flag — indistinguishable from "not in the list", and not recoverable from History. |
| **ADR-10** | **Foreground sync only; no dependency on the Background Sync API.** | iOS Safari does not implement it and Chromium's is unreliable when the browser is terminated. Durability comes from IndexedDB, not from a background task. | Background Sync as primary — silently loses pending work on iOS. |
| **ADR-11** | **Keep Next.js, Better Auth, Drizzle, and PostgreSQL.** | They are used well and are not the problem. The problem is the data-ownership model, not the tools. | A different framework — large, risky, and buys nothing for this problem. |
| **ADR-12** | **Server-side authorization is authoritative and role-checked. Tenant isolation is enforced by a single application-layer scope helper, NOT by PostgreSQL row-level security.** | The current join-link gap (S-1) is a UI-only check, so isolation must be enforced on the server. **RLS is deliberately excluded.** On the Neon HTTP driver, each statement is an independent request with no session state: a policy would need `current_setting('app.current_household')`, which can only be set inside a transaction and cannot be relied upon to persist across the separate queries a request makes. A policy written fail-open silently returns every row; one written fail-closed silently returns none. Either way RLS would give the *appearance* of defence in depth while behaving unpredictably — worse than not having it, because it suppresses the care the application-layer check actually needs. A single scope helper that every query must pass through, plus an integration test that asserts a cross-household read returns 404, is honest and testable. | *RLS as a second layer* — unreliable on the retained driver (see rationale); it would create false confidence rather than real isolation. *UI-only checks* — already proven insufficient. |
| **ADR-13** | **Integration tests run against a real PostgreSQL, not a mocked `db`.** | The current fake `db` ignores `where()` clauses, so the codebase's tenant-isolation predicates are entirely untested. The `DB_DRIVER` switch already exists (`src/db/index.ts:16-19`). | Continuing to mock the database — it cannot verify isolation, constraints, or migrations. |
| **ADR-14** | **The sync apply path is a single per-household-serialised batch containing a compare-and-swap that also stamps the row with the id of the operation that wrote it.** The batch's first statement takes a per-household transaction-scoped advisory lock — `pg_advisory_xact_lock(hashtextextended(household_id, 0))`, 64-bit — which is held to commit because a Neon HTTP batch is one transaction on one connection; the second is a data-modifying CTE that performs the compare-and-swap (`UPDATE … WHERE id = ? AND version = ?`) **and sets `last_op_id = $opId`**; the change-log append and the idempotency record are then guarded on `last_op_id = $opId`. | Applying an operation, appending to the change log, and recording the idempotency key must be all-or-nothing (INV-12). Four constraints force this shape. (1) The Neon HTTP driver throws on `db.transaction()`, so the apply must use `db.batch()`, which maps to Neon's atomic HTTP batch transaction. (2) A batch executes **pre-built** statements, so the read that conflict resolution depends on cannot sit inside it — the compare-and-swap moves the check into the write, so a concurrent modification yields zero rows updated and the operation is retried against fresh state. (3) `seq` allocation must not invert against commit order (ADR-05), which the per-household advisory lock guarantees. (4) **The change-log append must be guarded on the operation, not on the version.** Two different operations can both read `version = 12`; the winner writes `version = 13`, and the loser's compare-and-swap updates zero rows — but a change-log insert written as `INSERT … SELECT … FROM items WHERE id = $1 AND version = 13` matches the **winner's** row and appends a second entry for one logical change, so the change log stops being a faithful total order and the pulled `changes[]` contains the same entity twice. There is no shortcut via a unique constraint: `UNIQUE (op_id, entity_id)` does not help, because the two racing operations have *different* `opId`s. The row itself must carry the id of the operation that wrote it — hence `last_op_id` (§9.1). | The current non-transactional store-tag replacement (B-13) — a mid-flight failure loses the item's store tags. A blind read-decide-write without a compare-and-swap — two concurrent operations can both read the same `version` and both believe they won. Guarding the change-log insert on `version` alone — a losing operation appends a duplicate entry for the winner's write. `db.batch()` without the per-household lock — allocation and commit order can invert and a change can be skipped forever. The Neon WebSocket driver (interactive transactions) remains the fallback if the batch approach proves insufficient in Phase 2. |
| **ADR-15** | **Service worker caches the static shell and hashed assets only — never an API response.** | The shell is identical for all users (no user data), so it caches safely and enables offline boot. API responses are per-user and per-household; caching them risks cross-account data leakage on a shared device. | Caching API responses — data-leak risk on shared devices and stale-data bugs. |

---

## 19. Measurable acceptance criteria

The recovery is complete when **all** of the following are demonstrably true.

### 19.1 Offline-first (the primary outcome)

| # | Criterion | How it is proven |
| --- | --- | --- |
| AC-01 | With the network disabled **and the local database and service-worker cache already populated**, the dashboard renders the household's list with no error page and no spinner longer than 300 ms. | Playwright offline test + timing assertion |
| AC-02 | With the network disabled, adding, editing, checking, and deleting items all work and are visible immediately. | Playwright offline test |
| AC-03 | Edits made offline survive a page reload and a full browser restart. | Playwright: offline → edit → reload → restart → assert |
| AC-04 | The service worker is installed and the app is installable (a valid `manifest.webmanifest` is served with the required fields and icons). | Manifest assertion + Lighthouse PWA category |
| AC-05 | Reconnecting synchronises all pending changes automatically with no user action. | Playwright: offline → edit → online → poll until converged |
| AC-06 | Submitting the same operation 10 times applies it exactly once. | Idempotency test against a real database |
| AC-07 | Two devices making conflicting offline edits converge to the documented resolution, and the losing edit is presented to the user rather than discarded. | The §16.4 demonstration script |
| AC-08 | A deleted item is not resurrected when a device that has been offline for 7 days reconnects. | Tombstone test with a stale `lastSeq` |
| AC-08a | A deleted item is not resurrected when a device that has been offline **longer than the change-log retention window** reconnects: the device full-resyncs, discards its local tombstones, and the item stays deleted. Tombstoned rows are never hard-deleted from the server (FR-31). | Resync test with `lastSeq` below the retention floor |
| AC-08b | Two concurrent applies to the same household cannot invert commit order: a pulling client that advances past a `seq` always receives that change. | Integration test: apply two changes concurrently, pull between them, assert no change is skipped |
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
| AC-18 | A household-scoped table cannot be queried without passing through the scope helper — enforced by a lint rule — and an integration test proves a mismatched household receives 404 on read, update, and delete. |
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
| AC-31 | A checked item stays in its position in the list, dimmed, and never leaves its category group. A remote device checking an item does not reflow the list under the shopper's finger. |
| AC-32 | Undo works **offline** for add, check, uncheck, delete, and archive-checked, and is itself an outbox operation — an undone delete is an `item.undelete` that syncs, not a client-only reversal. |
| AC-33 | The empty state distinguishes *empty* / *not downloaded on this device* / *couldn't load, retry*. A household that has never been downloaded is never told its list is empty. |
| AC-34 | The status chip renders exactly one of the nine states in §6.1, never reads `Up to date` before IndexedDB has been read, and "Keep mine" always wins the contested field (it is an override, not a race). |
| AC-35 | Every overridden edit is surfaced, per FR-23 — including the **check-wins** case, where the item shows `Checked by <name>` and a "Needs attention" entry explains that the uncheck did not take effect. No conflict may be silently discarded. |

---

## Appendix B — Known refinements and deferred details

These are **not** defects. Each was raised during the specialist review and is
correctly deferred to the phase that implements it, because fixing it in the
specification now would grow the plan without changing what gets built. They
are recorded here so that nothing is silently lost.

| # | Refinement | Owner | Settled in |
| --- | --- | --- | --- |
| B-1 | The exact `LIMIT` on the change-log pull page (500 is the working figure) and the backoff when `hasMore` is true across many pages | Backend | Phase 3 |
| B-2 | The pruning job's mechanics: how often it runs, and whether it runs per-household or globally | Database | Phase 3 |
| B-3 | `entity_conflicts` retention beyond the change-log window — retained at least as long for now, with the exact second pruning window undecided | Database | Phase 3 |
| B-4 | The `epoch` field's exact semantics — it changes on a full resync, but whether it is also rotated on a household reset is undecided | Backend + Database | Phase 3 |
| B-5 | The `item_stores` primary key requires existing duplicate tag rows to be de-duplicated **before** the constraint is added | Database | Phase 3 |
| B-6 | The exact trigger conditions under which the Neon WebSocket driver would be adopted instead of the batch approach | Lead + Database | Phase 2 |
| B-7 | The "manage your devices" surface — listing members' devices and last-seen times — is a Phase 6 task whose scope depends on D-6 | Frontend + Backend | Phase 6 |
| B-8 | Whether the `override` operation should be rate-limited or restricted to household admins | Backend | Phase 3 |
| B-9 | The `deviceName` the client sends — whether it is a free-text label, a browser/OS-derived name, or user-editable | Frontend | Phase 4 |
| B-10 | The exact wording and iconography of the four "Needs attention" card types, beyond the content specified in §11.2 | Frontend | Phase 6 |
| B-11 | Whether the history page should also be an offline-capable shell, or remain online-only | Frontend | Phase 6 |
| B-12 | The `storeTags` per-pair conflict presentation — whether a contested tag is shown on the item, in the panel, or both | Frontend | Phase 6 |

**None of these change the architecture, the data model, the protocol, or the
conflict rules.** They are presentation, tuning, and operational details that
belong to the phase that has the context to settle them.

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
