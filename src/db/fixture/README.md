# The §10.8 server-side fixture

`docs/project.md` §10.8 gives the three statements an implementer will copy:
the **item-row statement**, the **create statement**, and the **ledger
statement**. §16.4 calls this directory the **server-side fixture** for
Phase 3 — "an implementation that reaches a different outcome for any of them
fails the test rather than passing review".

## The point of it

The statements are **extracted from the specification document** at run time,
not read from a copy. There is no file here that can drift away from what the
document says.

The reference copies beside this README (`apply-item.sql`,
`apply-create.sql`, `apply-ledger.sql`) are what a reviewer reads and what was
last verified. Every run checks them against the document, so a change to the
document that has not been re-verified is **reported**, not absorbed:

```
DRIFT - the document's statements match the reference copies
  PASS  apply-item.sql in docs/project.md matches the reference copy
  PASS  apply-create.sql in docs/project.md matches the reference copy
  PASS  apply-ledger.sql in docs/project.md matches the reference copy
```

If that check fails, the document changed. Re-verify, then update the
reference copies.

**The drift check covers the three §10.8 statements and nothing else.**
`schema.sql` is the §9 DDL: it is applied as it stands and not compared with
the document. A change to the DDL in the specification is therefore *not*
reported by the drift check — and it does not necessarily fail a run either,
because a scenario only notices a changed constraint or column when it
exercises it. `schema.sql` is kept in step with the DDL by hand, like the
reference copies are.

## Running it

```bash
# against a local PostgreSQL
createdb auditsync
DATABASE_URL=postgresql://postgres@127.0.0.1:5432/auditsync python3 src/db/fixture/verify.py

# against the self-hosted Supabase instance
DATABASE_URL=postgresql://... python3 src/db/fixture/verify.py
```

`DATABASE_URL` is how the harness knows which database to write to, and it is
not optional in practice: without it the harness connects as `postgres` at
`127.0.0.1:5432`, which is not the database `createdb` made. With socket
authentication as the operating-system user, `postgresql:///auditsync` works
too.

`schema.sql` is applied first — it is the specification's own §9 DDL, in the
fixture's **own schema**, `fixture`. The fixture creates nothing else and
drops nothing else: it never touches `auth` (GoTrue owns that on a Supabase
instance) and never touches the application's `public` schema. `users` is the
fixture's stand-in for `auth.users` — the statements never read it, but the
foreign keys that carry an actor id do.

**The fixture creates and drops rows.** It writes to the database in
`DATABASE_URL`. Point it at a scratch database, never at production.

`psql` and `python3` must be on the path. Nothing else is needed — the
harness is deliberately dependency-free.

### The two destructive things, and how to ask for the second

**Every run deletes the rows in the `fixture` schema.** The scenarios need a
known state, so the run empties the fixture's own tables before it starts.
That is why the fixture wants a scratch database of its own: a run against a
database that holds fixture data loses that data.

The **schema** is only dropped when the reset is asked for on purpose:

```bash
python3 src/db/fixture/verify.py --reset-schema
# or, by hand:
psql "$DATABASE_URL" -v fixture_reset=1 -f src/db/fixture/schema.sql
```

The reset drops the `fixture` schema with `CASCADE` and rebuilds it. `CASCADE`
means anything **outside** the schema that depends on a fixture table goes
with it — a view in `public` built on `fixture.items`, say. Nothing else is
dropped, and without the flag no schema is ever dropped.

The reset is opt-in because it is the one thing here that destroys a
structure rather than the rows the run was going to delete anyway.

## What it covers

**45 scenarios in 11 groups, 271 assertions.**

| Group | Scenarios | What it proves |
| --- | --- | --- |
| FIELD | 11 | per-field resolution; the note and the category are fields like any other; a concurrent check wins over an uncheck; a winning update tells the device whose value it displaced; a lost CAS leaves the row untouched; a stale uncheck does not reverse an archive |
| OVERRIDE | 3 | an override beats check-wins, the device whose value it replaced is told, and an override that unchecks clears the archive |
| PAIR | 9 | the per-tag rule of §11, in both directions; the snapshot carries a removed tag; a concurrent removal that wins tells the device whose add it discarded |
| DELETE | 1 | a delete tombstones the row, and the tombstone reaches the change log |
| ARCHIVE | 5 | archive-wins-with-reversal, and its order-independence |
| UNARCHIVE | 2 | an unarchive clears the archive, and the bulk form clears every candidate |
| LEDGER | 4 | the idempotency ledger and its four outcomes |
| BULK | 4 | the bulk envelope, and the case with no identifiable loser |
| ENTITY | 3 | the ledger's decided-gate is entity-type aware |
| CREATE | 2 | the create statement, and its duplicate-id behaviour |
| LOCK | 1 | the per-household advisory lock, on a `uuid` parameter |

Plus the fixture's own four checks: the schema, and the three drift checks.

The full list, with what each one proves, is in `docs/project.md` §16.4.

## Changing it

**A change to the document's SQL changes this fixture's outcome.** That is the
intended behaviour: the fixture is the specification's executable form.

When the document's SQL changes:

1. run the fixture — the drift check tells you the document moved;
2. re-verify every scenario still holds;
3. update the reference copies so the drift check passes again;
4. say in the pull request what changed and why the outcomes did not (or did).
