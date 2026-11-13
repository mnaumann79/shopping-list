# Verification against the self-hosted Supabase instance

**Date:** 2026-11-12
**Channel:** the Supabase MCP (the sandbox cannot open a raw TCP connection to
the instance — DNS does not resolve there — so the MCP is the only route).

Everything below was run against the instance. The scratch schema it ran in
and the throwaway `auth.users` row used for the foreign keys were **dropped
afterwards**; the instance's pre-existing `public` tables were not touched.

> **No identifiers.** The project's ref, the scratch schema's name, the
> instance's role names and the names of the other application's tables are
> deliberately not in this file: a committed document is a public document,
> and none of them is needed to read what was verified. What each section
> found is here in full.

> **Update (P0S-T01).** The fixture no longer creates or writes to the
> `auth` schema: it runs in a schema of its own (`fixture`), with
> `fixture.users` standing in for `auth.users`, so it cannot touch GoTrue's
> objects — see `README.md`. The run recorded below was made before that
> change and did use a throwaway `auth.users` row. The statements it
> verified are unchanged.

---

## 1. What the instance is

| | |
| --- | --- |
| PostgreSQL | **17.11** (`server_version_num` 170011) — the exact version the fixture was verified against |
| Schemas | `auth`, `extensions`, `graphql`, `graphql_public`, `public`, `realtime`, `storage`, `supabase_migrations`, `vault` — a full Supabase stack |
| Extensions | `dblink`, `pg_stat_statements`, **`pgcrypto`**, `plpgsql`, `supabase_vault`, `uuid-ossp`, `vector` |
| `auth` schema | GoTrue's, complete: `users`, `identities`, `sessions`, `refresh_tokens`, the MFA tables, the OAuth tables, the SSO tables. RLS is enabled on most of them |
| `search_path` | `"$user", public, extensions` — **`auth` is not in it**, so `auth.users` must be written schema-qualified. The statements do |

## 2. The roles, and what they mean for §9.2b

The instance's roles fall into two groups. Their names are not in this file.

| | `BYPASSRLS` | Consequence |
| --- | --- | --- |
| the roles that serve the application's requests | no | subject to RLS |
| the roles that migrate, back up and administer the instance | **yes** | bypass RLS |

**This confirms the specification's design exactly.** §9.2b says the
application connects as a **dedicated non-owner role** so the policies apply,
and that the role used for migrations, backups and Studio bypasses RLS by
design. The instance says exactly that: the migration role has `BYPASSRLS`. A
connection as that role would have silently bypassed every policy — which is
why the dedicated `app` role is not optional.

Note that the migration role is **not** a superuser on this instance
(`rolsuper = false`), but `BYPASSRLS` is enough to defeat the policies on its
own.

## 3. The RLS mechanism, end to end

The pattern §9.2b specifies is `set_config('request.jwt.claims', …, true)` —
**local to the transaction** — with `auth.uid()` reading it:

```sql
with cte as materialized (
  select set_config('request.jwt.claims',
                    '{"sub":"11111111-2222-4333-8444-555555555555","role":"authenticated"}', true) as claims
)
select auth.uid()::text as auth_uid,
       (auth.uid()::text = '11111111-2222-4333-8444-555555555555') as matches_the_claim
  from cte;
```

```
auth_uid: 11111111-2222-4333-8444-555555555555
matches_the_claim: true
```

**`auth.uid()` resolves on a direct connection.** This is the whole basis of
the RLS design, and it is the thing ADR-12's original objection was about:
the Neon HTTP driver could not do this, because each statement was its own
request with no session state. Here the claim and the query are in one
transaction, so there is no window in which a policy is evaluated without the
caller being known.

## 4. The distinctive constructs

| Construct | Result |
| --- | --- |
| `hashtextextended('<uuid>'::text, 0)` | a 64-bit key, deterministic for the same household, different for another — ADR-05's serialisation primitive, on the `uuid` parameter type §9.1a introduces |
| `jsonb_to_recordset(...) AS t("storeId" uuid, version integer, present boolean)` | `storeId` resolves — the byte-exact, **quoted** alias. An unquoted alias folds to lowercase and silently returns NULL |
| `jsonb_strip_nulls(jsonb_build_object(...))` | the `field_meta` shape, with the NULL entries dropped |
| `auth.uid()` | resolves from the transaction-local claim (above) |

## 5. All three §10.8 statements, executed against the instance

Run against a scratch schema holding the §9 DDL. The statements were
**prepared with their parameters bound** (`PREPARE`/`EXECUTE`), not inlined,
so the bodies are the specification's own.

### The item-row statement

```
name: "Old name" → "Milk", quantity: NULL → "2 kg", version 1 → 2
field_meta: only the won fields, each with v = 2
last_op_id stamped, updated_by_id = the actor's uuid
snapshot key 'householdId' present
conflicts: []
```

### The create statement

```
item "Eggs" created at version 1, quantity "12"
2 tag rows written (both stores)
1 change-log row, whose payload carries householdId and both storeIds
```

### The ledger statement

```
outcome: 'applied'
envelope: {"entities": [{"entityId": …, "entity": {…}}], "conflicts": [], "skipped": 0}
```

**The envelope is derived in SQL**, inside the statement — the NEW-3 shape
exactly. The entity-type-aware decided-gate found the row, and the
`actor_id uuid REFERENCES auth.users(id)` foreign key was satisfied by a real
`auth.users` row.

## 6. The archive-conflict addressee, both branches

This is the behaviour the addressee convention settles.

**A known archiver** — device B archived the item, device A unchecked it:

```
conflict addressee (device_id):        bbbbbbbb-…  ← device B, the ARCHIVER (the loser)
conflict winner  (winner_device_id):   22222222-…  ← device A, the REQUESTER (who won)
resolution: 'rejected'    field: 'archivedAt'    conflict rows: 1
archive reversed: true    is_checked: false
the requester's own conflicts[]: []              ← empty, because it won
```

**An unknown archiver** — a row archived *before* the sync model, with no
`field_meta` entry:

```
conflict rows for this operation: 0
archive reversed: true    is_checked: false
```

The reversal still applies; there is no conflict row, because there is no
identifiable loser to notify. Exactly as §10.8.3 specifies.

## 7. What is **not** verified

- **The full 248-assertion fixture** (165 assertions when this run was
  made). The MCP cannot bind parameters or
  target another database, so the harness — which drives `psql` — cannot run
  against the instance from here. The statements above were run by hand
  through the MCP instead: the item statement's update path, the create
  statement, the ledger statement and both archive-conflict branches. The
  other 33 scenario groups (42 now) remain verified on PostgreSQL 17.11
  locally.
- **A backup, and a restore of that backup.** `pg_dump` and `pg_restore` need
  a direct connection, which the sandbox cannot make.
- **The connection pooling.** The `pg` driver's named prepared statements
  under a transaction-mode pooler are a known hazard, and it could not be
  tested without a direct connection.

## 8. A finding that changes the cutover

**The `public` schema already holds another application's tables.** They are
empty, and the shopping list's table names do not collide with them — but the
implication for §13.2a is real:

> **The dump must be scoped to the shopping list's tables.** A
> whole-database `pg_dump` of the *source* is fine — it is the *restore* that
> must not be. Restoring the `auth`, `storage`, `realtime` or `graphql`
> schemas would replace GoTrue's state and break authentication on the
> instance, and restoring the other application's tables would destroy them.
>
> The `auth` schema is **never** dumped or restored. GoTrue owns it; the
> users are provisioned through the admin API (§13.2a step 2), not by
> copying a table across.
