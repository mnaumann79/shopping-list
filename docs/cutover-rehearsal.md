# The cutover rehearsal against the development instance

§13.2a's step 3 is a dry run: dump the legacy database, restore it into a
scratch database on the instance, run the identity mapping, verify it, and
compare the row counts table by table. **This is the record of that dry run,
against the development instance**, with the scratch database on the instance
and the restore and the mapping done there.

The scripts are in `scripts/cutover/`, and the procedure behind them is
§13.2a of [`docs/project.md`](./project.md). What the run found is §13.2a's
"What the rehearsal found"; this file is the run itself.

## The run

| | |
| --- | --- |
| **Date** | 2026-11-13, 23:57 UTC |
| **Instance** | the development instance, `eaawnwfrkvjbdigyasbk` — PostgreSQL 17.11, reached through the pooler at `aws-0-us-east-2.pooler.supabase.com:5432` |
| **Source URL** | `postgresql://<role>:<password>@aws-0-us-east-2.pooler.supabase.com:5432/cutover_rehearsal_source_1794614237?sslmode=require` |
| **Target URL** | `postgresql://<role>:<password>@aws-0-us-east-2.pooler.supabase.com:5432/postgres?sslmode=require` |
| **Role** | `rehearsal_cutover` — `LOGIN CREATEDB`, created for this run through the Supabase MCP and dropped when the run was over. Its password lived in the sandbox and nowhere else: not in this repository, not in a message, not in a ledger row. |
| **Scratch database** | `cutover_rehearsal_1794614273930` — created on the instance by the run, dropped by the run's rollback |
| **Command** | `node scripts/cutover/rehearse.mjs --source "$SOURCE_URL" --target "$TARGET_URL"` |

The two URLs differ in the database and in nothing else. The pooler needs
the tenant in the user name (`<role>.<project-ref>`) and rejects a URL
without it.

One thing about the role: the pooler caches a role's privileges, so a role
that is dropped and re-created under the same name is served with the old
ones for a short while — the first attempt to create a database after
re-creating the role was refused with "permission denied to create
database", and the same command worked a few seconds later.

## The source

The source is a scratch database on the instance with the **legacy shape**:
Better Auth's tables and the `organization_id` columns. It is built by
applying the migrations up to but not including `0004_rename_household_id.sql`
— so `0000`, `0001`, `0002` and `0003` — and then putting a row in each of
the tables that hold one: the household, the user, the membership, the
invitation, and the shopping list's own tables:

```sql
INSERT INTO organization (id, name, slug, created_at)
VALUES ('legacy-org-1', 'The Legacy Household', 'legacy-household', now() - interval '2 days');

INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
VALUES ('legacy-user-1', 'Legacy Person', 'legacy.person@example.test', true, now() - interval '2 days', now() - interval '2 days');

INSERT INTO member (id, organization_id, user_id, role, created_at)
VALUES ('legacy-member-1', 'legacy-org-1', 'legacy-user-1', 'owner', now() - interval '2 days');

INSERT INTO categories (id, organization_id, name, is_default, is_active, created_at)
VALUES ('11111111-1111-4111-8111-111111111111', 'legacy-org-1', 'Produce', false, true, now() - interval '2 days');

INSERT INTO stores (id, organization_id, name, is_active, created_at, updated_at)
VALUES ('22222222-2222-4222-8222-222222222222', 'legacy-org-1', 'Corner Shop', true, now() - interval '2 days', now() - interval '2 days');

INSERT INTO items (id, organization_id, name, quantity, note, category_id, is_active, is_checked, created_at, updated_at, created_by_id)
VALUES ('33333333-3333-4333-8333-333333333333', 'legacy-org-1', 'Apples', '6', 'the green ones', '11111111-1111-4111-8111-111111111111', true, false, now() - interval '1 day', now() - interval '1 day', 'legacy-user-1');

INSERT INTO item_stores (item_id, store_id)
VALUES ('33333333-3333-4333-8333-333333333333', '22222222-2222-4222-8222-222222222222');

INSERT INTO household_join_links (id, organization_id, token, created_by_id, expires_at, created_at)
VALUES ('44444444-4444-4444-8444-444444444444', 'legacy-org-1', 'legacy-join-token', 'legacy-user-1', now() + interval '1 day', now() - interval '1 day');

INSERT INTO invitation (id, organization_id, email, role, status, expires_at, inviter_id, created_at)
VALUES ('55555555-5555-4555-8555-555555555555', 'legacy-org-1', 'invited.person@example.test', 'member', 'pending', now() + interval '3 days', 'legacy-user-1', now() - interval '1 day');
```

The ids are made-up strings and the addresses are `@example.test`, so nothing
in the rehearsal is anybody's data.

## The output

As it was printed:

```text
== Checking the target
target: aws-0-us-east-2.pooler.supabase.com/postgres

== Reading the source
source: 1 organizations, 1 users, 1 memberships

== Dumping the source
dump: /tmp/cutover-sy2jsA/source.dump

== Creating the scratch database
scratch: cutover_rehearsal_1794614273930

== Applying the schema, up to but not including the rename
applied 0000_init.sql
applied 0001_add_categories_unique.sql
applied 0002_add_items_archived_at.sql
applied 0003_household_and_sync_tables.sql

== Restoring the shopping list's tables
restored 12 tables

== Issuing the identities
mapped 1 households and 1 users

== Running the identity mapping

== Applying the rename migration and the rest
applied 0004_rename_household_id.sql
applied 0005_rls_and_app_role.sql
  refused: 0005_rls_and_app_role.sql:111: permission denied to grant role "authenticated"
applied 0005a_allow_migration_role_to_assume_app.sql
  refused: 0005a_allow_migration_role_to_assume_app.sql:25: permission denied to grant role "app"
applied 0006_membership_functions.sql
applied 0007_no_self_delete.sql
applied 0008_auth_schema_grant_account.sql
applied 0009_bootstrap_select.sql
applied 0010_revoke_membership_functions_from_authenticated.sql
applied 0012_add_stores_updated_at.sql
applied 0013_verification_updated_at_nullable.sql
applied 0014_restore_membership_function_source.sql
applied 0015_lock_invitation_on_accept.sql

== Verifying
ok    items.orphans: 0
ok    categories.orphans: 0
ok    stores.orphans: 0
ok    household_join_links.orphans: 0
ok    items.identity_orphans: 0
ok    household_join_links.identity_orphans: 0
ok    household_members.identity_orphans: 0
ok    household_members.orphans: 0
ok    households.without_members: 0
ok    items.count: 1
ok    categories.count: 1
ok    stores.count: 1
ok    household_join_links.count: 1
ok    item_stores.count: 1
ok    households.count: 1
ok    household_members.count: 1
ok    user.count: 1
ok    invitation.count: 1
ok    household_invitations.count: 0

== Comparing the row counts
ok    items: source 1, target 1
ok    categories: source 1, target 1
ok    stores: source 1, target 1
ok    household_join_links: source 1, target 1
ok    item_stores: source 1, target 1
ok    user: source 1, target 1

== Rolling back
dropped cutover_rehearsal_1794614273930

The rehearsal passed.
```

Two lines of that output are refusals, and they are the point of the run
rather than a failure: **the two statements that administer the instance's
cluster-wide roles cannot be run by a role that may create a scratch
database.** Both are properties of the *instance* rather than of a database,
the instance already has both, and the rehearsal must not change them — so
the run prints them instead of hiding them.

## What the run found

Six things. Every one of them is fixed in `scripts/cutover/`, and §13.2a of
`docs/project.md` is corrected where the run showed it wrong.

### 1. The driver and libpq read the same URL differently

The first run never reached the database:

```
Error: self-signed certificate in certificate chain
```

node-postgres reads `sslmode=require` as `verify-full` and refuses the
pooler's certificate, where libpq's `require` encrypts the connection and
does not verify the certificate — which is what psql, pg_dump and pg_restore
do with the very same URL. One URL has to mean one thing to every client in
these scripts.

**Fixed** in `scripts/cutover/lib.mjs`: `driverUrl()` hands the driver the
URL with `uselibpqcompat=true`, which is the switch that tells it to read
`sslmode` the way libpq does (the repository's own runner documents the
same switch in `scripts/db-migrate.mjs`), and `libpqUrl()` takes the
parameter back off for the libpq programs, which refuse a URI that carries
one (`invalid URI query parameter: "uselibpqcompat"`).

### 2. The migrations that follow the rename cannot be applied before it

The scripts applied **every** migration except the rename before the
mapping. The migrations that follow it are written for the renamed schema:
the policies in `0005_rls_and_app_role.sql` name `household_id`, which does
not exist until the mapping or the rename has made it. The scripts were
written when the folder held `0000`–`0003` and the rename migration did not
exist yet; the migrations that came afterwards changed what "every migration
except the rename" means.

**Fixed**: the order is the checklist's now — the schema up to but not
including the rename, the mapping, then the rename and the rest.

### 3. Two statements administer the instance's roles

```
permission denied to grant role "authenticated"
```

`0005_rls_and_app_role.sql` grants the app role the `authenticated` role,
and `0005a_allow_migration_role_to_assume_app.sql` lets the migration role
assume the app role. Both are properties of the *instance* rather than of a
database, the instance already has both, and a role that may create a
scratch database may not administer them.

**Fixed** in `scripts/cutover/lib.mjs`: `applyMigration()` applies the file
with the errors allowed to be, reads them back, and requires every one of
them to be a refusal of that kind. Anything else fails the run, and the
refusals are printed.

### 4. The restore's order is the foreign keys' order

```
pg_restore: error: COPY failed for table "items": ERROR:  insert or update on table "items" violates foreign key constraint "items_category_id_categories_id_fk"
```

The restore is one `pg_restore --table=…` call per table, so the tables come
back in the order of the list — and `items` came before `categories`. A
table restored before the one it points at fails its foreign key as soon as
it holds a row, which the first rehearsal never saw because its source was
empty.

**Fixed**: `RESTORED_TABLES` is in dependency order — `user` and
`organization` first, then the tables that point at them, and `item_stores`
last.

### 5. The rehearsal wrote to the instance's `auth.users`

The script provisioned the users in the **target's main database**, where
GoTrue owns `auth.users`. On the instance that table belongs to
`supabase_auth_admin`, it has row-level security on and **no policies**, so
a rehearsal role can neither read it nor write to it — and a rehearsal has
no business writing there anyway: the instance has to be as it was when the
run is over.

**Fixed**: the rehearsal issues the users' uuids itself and puts them in the
**scratch** database's `auth.users`, which is where the mapping's foreign
keys point and where GoTrue manages nothing. At the cutover the ids are
GoTrue's, provisioned in step 2 and recorded in `user_map`. §13.2a's second
finding is corrected to tell the two apart.

### 6. The pooler keeps a connection to the scratch database

```
error: database "cutover_rehearsal_1794614273930" is being accessed by other users
```

The rollback terminated the sessions and dropped the database, and the drop
was refused: the pooler hands its connection back when the client is gone
and keeps it in its pool, so the scratch database still had a session
attached to it. Terminating it does not help — the pooler opens another
one.

**Fixed**: `DROP DATABASE … WITH (FORCE)` terminates the sessions and drops
the database in one statement, with no window between the two for the pooler
to open another connection in.

## What the run did not cover

**The legacy invitations.** §13.2b says the legacy `invitation` rows become
`household_invitations` rows, and the mapping does not map them: the run
shows `invitation.count: 1` next to `household_invitations.count: 0`. The
source has one pending invitation, so the restore of that table is
exercised, and the mapping leaves it behind. The legacy table is dropped at
the decommission (T+14 days), so the pending invitations of the migrated
households are lost unless the mapping carries them over. That is a gap in
the identity mapping, and it needs a decision the rehearsal cannot make:
which of Better Auth's invitation statuses are worth carrying, what the
role becomes (the new table's check allows `owner`, `admin` and `member`,
and an invitation is never an owner), and what token the carried invitation
gets (the application issues 32 random bytes, hex-encoded).

**The provisioning of the GoTrue users.** That is §13.2a step 2, and it
happens through the admin API before the rehearsal runs. The rehearsal
cannot do it and does not try: the ids it issues are its own.

## The instance afterwards

The run left the instance as it was:

- **no scratch database** — the one the run created was dropped by the
  rollback, and the source and the leftovers of the failed runs were dropped
  afterwards;
- **the tables the instance holds are untouched** — the rehearsal wrote
  nothing outside its scratch database, and `auth.users` holds no account
  from the rehearsal (`SELECT count(*) FROM auth.users WHERE email =
  'legacy.person@example.test'` is 0, and no GoTrue user was created at all
  during the run);
- **the ledger still holds its 16 rows** —
  `supabase_migrations.schema_migrations` was not written to, because the
  run's migrations went into the scratch database and not into the
  instance's own;
- **the rehearsal's role is gone** — `rehearsal_cutover` was dropped when
  the run was over.
