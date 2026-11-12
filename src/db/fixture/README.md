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

## Running it

```bash
# against a local PostgreSQL
createdb auditsync
python3 src/db/fixture/verify.py

# against the self-hosted Supabase instance
DATABASE_URL=postgresql://... python3 src/db/fixture/verify.py
```

`schema.sql` is applied first — it is the specification's own §9 DDL,
including an `auth` schema, because the target environment is a Supabase
instance and the statements reference `auth.users`.

**The fixture creates and drops rows.** It writes to the database in
`DATABASE_URL`. Point it at a scratch database, never at production.

`psql` and `python3` must be on the path. Nothing else is needed — the
harness is deliberately dependency-free.

## What it covers

**33 scenario groups, 165 assertions.**

| Group | Scenarios | What it proves |
| --- | --- | --- |
| FIELD | 6 | per-field resolution; a lost CAS leaves the row untouched |
| PAIR | 8 | the per-tag rule of §11, in both directions |
| ARCHIVE | 5 | archive-wins-with-reversal, and its order-independence |
| LEDGER | 4 | the idempotency ledger and its four outcomes |
| BULK | 4 | the bulk envelope, and the case with no identifiable loser |
| ENTITY | 3 | the ledger's decided-gate is entity-type aware |
| CREATE | 2 | the create statement, and its duplicate-id behaviour |
| LOCK | 1 | the per-household advisory lock, on a `uuid` parameter |

Plus the two checks above: the schema, and the drift check.

The full list, with what each one proves, is in `docs/project.md` §16.4.

## Changing it

**A change to the document's SQL changes this fixture's outcome.** That is the
intended behaviour: the fixture is the specification's executable form.

When the document's SQL changes:

1. run the fixture — the drift check tells you the document moved;
2. re-verify every scenario still holds;
3. update the reference copies so the drift check passes again;
4. say in the pull request what changed and why the outcomes did not (or did).
