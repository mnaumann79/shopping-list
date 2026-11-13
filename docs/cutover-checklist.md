# The cutover checklist

This is the list the person performing the cutover works through, in order.
Every item says what to do and what "done" looks like. The procedure behind
the items is §13.2a of [`docs/project.md`](./project.md) — this is the
checklist for it, not the procedure.

**The one thing to hold on to: the rollback is a configuration change, not a
restore, and it is available for fourteen days.** Nothing is deleted from
Neon until the window closes, and reverting means putting the environment
back and deploying the previous release.

The times are relative to the maintenance window (**T−0**).

---

## The environment

What the deployment has to be configured with, before anything else. The
variable list is what the code reads — `git grep process.env` over `src/` —
and the rest of this section is what was learned the hard way.

### The variables

| Variable | Needed | Secret | What it is for |
| --- | --- | --- | --- |
| `DATABASE_URL` | yes | yes | **set it to the non-owner `app` role** — the policies apply to it, which is the point of them |
| `NEXT_PUBLIC_SUPABASE_URL` | yes | no | the Supabase project the application authenticates against — **inlined at build time** |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | no | the publishable key (`sb_publishable_…`) — **inlined at build time** |
| `SUPABASE_SERVICE_ROLE_KEY` | yes, during the transitional window | **yes** | it bypasses row-level security; the transitional sign-in and the admin console read it |
| `RESEND_API_KEY` | for invitations | **yes** | the invitation mailer |
| `RESEND_FROM_EMAIL` | for invitations | no | the address the invitation comes from |
| `NEXT_PUBLIC_APP_URL` | yes | no | the public base URL — join links and invitation links — **inlined at build time** |
| `ADMIN_EMAIL` | optional | no | without it the admin console answers 403 |

### The build

- **The `NEXT_PUBLIC_*` variables have to be present in the build
  environment, not only at runtime.** Next.js inlines them when the
  application is built, so a runtime-only setting leaves the browser
  bundle carrying `undefined`.
- **Node 24 and pnpm 9.** The lockfile is `lockfileVersion: '9.0'`, and
  pnpm 10 and later can fail `--frozen-lockfile` against it. The CI
  workflow pins both.
- **The install must not run with `NODE_ENV=production`.** pnpm skips the
  devDependencies, and `pnpm build` then fails with "Cannot find module
  'typescript'". CI overrides `NODE_ENV` for the install only, and the
  deployment has to do the same.
- **There is no `output: 'standalone'`** in `next.config.ts`, so a
  standalone-style Dockerfile will not work: the image needs `node_modules`
  and `pnpm start`.

### The two connection strings

Two, for two different jobs:

- **Set `DATABASE_URL` to the non-owner `app` role** — the policies apply
  to it, which is the point of them. (The application connects as whatever
  the string names; this is what makes the policies apply.)
- **The verification needs the owner role**: the §10.8 fixture and the
  backup-restore rehearsal create a scratch database and their own schema,
  which the application role may not do. The owner bypasses row-level
  security, which is exactly why it is not what the application uses.

### The URL rules

Each of these cost an hour:

- **The username is tenant-qualified**: `app.<project-ref>`, not `app`. A
  pooler rejects a tenant-less username.
- **The host is the pooler, on port 5432.** The direct host is IPv6-only
  for this project.
- **The password is percent-encoded**, and libpq splits a connection URL
  at the **first** `@`: an unencoded `@` in a password turns the rest of it
  into a host name. Prefer a password with no `@ : / ? # %` in it at all.

### On a fresh instance, in this order

1. **Apply the repository's migrations first, with the owner's
   connection.** Migration `0005` creates the `app` role — and creates it
   without a password. The files go in with `psql`, as the owner: the
   runner is a development-side tool, it refuses a host it cannot prove is
   local (`DB_MIGRATE_ALLOW_ANY_HOST=1` is its opt-in), and the cutover
   does not run it against the target in any case.
2. **Then set the role's password**, through the flow that re-syncs the
   pooler. The pooler authenticates the application role by fetching the
   role's credential, and it does not always see the instance's copy: the
   credential on the instance and the pooler's copy of it can come apart,
   and a change to the role's password alone does not re-sync it.
3. **Then put the connection string in `DATABASE_URL`** — the
   application's role, not the owner's.

---

## Before the window

### T−7 days — the target is verified

- [ ] **The instance's PostgreSQL major version is recorded**, and it is the
      same major version the dump will come from. A dump restored across a
      major version is not a dump.
- [ ] **The §10.8 statements pass against the instance** with the §9 DDL —
      the server-side fixture is the check (`src/db/fixture/verify.py`).
- [ ] **A restore from the instance's own backup was performed and read
      back.** A backup nobody has restored is a hope, not a backup.
- [ ] **The three membership functions exist** in the instance — migration
      `0006` creates them: `app_user_display`,
      `app_accept_household_invitation` and `app_join_household_by_link`,
      and the application calls all three.
- [ ] **`db/init.sql` carries those three functions.** It does **not** today
      — the file's header promises the snapshot and the migrations agree,
      and they do not (P0S-T28). **Until that merges, do not bootstrap an
      instance from `db/init.sql`**: it is a snapshot of an older schema.
- [ ] **The application role's password is not in the ledger.** It is read
      from the environment, not written down (P0S-T26).
- [ ] **The pooler's credential matches the instance's.** The pooler
      authenticates the application role by fetching the role's credential,
      and it does not always see the instance's copy of it: the credential
      on the instance and the pooler's copy can come apart, and a change to
      the role's password alone does not re-sync it. The application
      connects as the role, so the pooler is what decides whether it can.

### T−1 day — the accounts are provisioned

- [ ] **Every legacy user has a GoTrue account** with `email_confirm: true`
      and the legacy display name in `user_metadata`.
- [ ] **`user_map (old_id text, new_id uuid)` is recorded** — the old id
      against the id GoTrue issued.
- [ ] **No password was carried across.** Better Auth's scrypt hash cannot
      become GoTrue's bcrypt, so every provisioned account holds the
      cutover's random, unusable password. The transitional sign-in is what
      carries a password across later, at sign-in, not here (§13.2c).
- [ ] **The list of accounts that have never signed in is kept.** Those are
      the accounts the transitional route exists for, and the decommission
      step depends on knowing which they are.

### T−1 day — the dry run

- [ ] **The dump is taken from Neon and restored into a scratch database on
      the instance** — scoped to the shopping list's tables. The scripts do
      this: `scripts/cutover/rehearse.mjs`.

      ```bash
      node scripts/cutover/rehearse.mjs \
        --source "postgresql://…@neon…/postgres" \
        --target "postgresql://…@the-instance…/postgres"
      ```

- [ ] **The rehearsal's guards were not tripped, and its writes were
      expected.** It refuses the Neon **production** host family — these
      scripts move data and may only touch the development instance — it
      writes to a scratch database whose name starts with
      `cutover_rehearsal_` (it creates one), and it refuses a target
      without an `auth` schema, because a plain PostgreSQL would take the
      data and silently lose the identities.
      **It also writes to the target, and that write stays.** The GoTrue
      accounts the rehearsal needs are inserted into the target's
      `auth.users` — an account that already exists is reused, so a
      rehearsal may be run more than once — and those rows are not in the
      scratch database, so dropping the scratch does not remove them. The
      target is therefore the **development instance**, and the rehearsal
      is not something to point at production.
- [ ] **The rehearsal passes.** It compares the row counts of six tables —
      `items`, `categories`, `stores`, `household_join_links`, `item_stores`
      and the legacy `user` — checks that no identity is orphaned, and fails
      on a mismatch in those six counts. It does **not** compare the
      households or the memberships against the source: those two counts are
      printed and are not checked, so read them.
- [ ] **The rehearsal's output has been read**, not just run. It is a dry
      run; a dry run that nobody read is a rehearsal that found nothing
      because nobody looked.
- [ ] **The summary is attached to the pull request, not the raw output.**
      The rehearsal prints counts only — the ids are in the mapping table —
      and this repository is public.

### T−1 day — the guard that ships

- [ ] **The guard that ships replaces the root middleware, and preserves the
      destination.** The decision is made: the root `middleware.ts` — the
      optimistic check on the cookie's *presence* — is replaced by a real
      guard that validates the session and keeps the destination for every
      protected route (P0S-T32). Confirm the deployment carries the
      replacement, that the replacement still carries the destination back
      after a sign-in, and that the optimistic cookie check is gone.

      If this has not landed when the window is scheduled, it is an **open
      item** below, with a name against it — not an assumption.

---

## In the window

### Read-only

- [ ] **The application is in read-only mode.** Nothing writes to Neon while
      the window is open.

### The data

- [ ] **The final dump is taken from Neon.**
- [ ] **It is restored into the instance, scoped to the shopping list's
      tables** — and only those. `auth` is never dumped or restored; the
      instance's `public` schema holds another application's tables; and the
      instance runs a full Supabase stack whose schemas are not ours. The
      restore is a set of `pg_restore --table=…` calls (`scripts/cutover/lib.mjs`,
      `restoreScoped`).
- [ ] **The migrations are applied in the order the rehearsal used them**:
      the schema up to but not including the rename migration, then the
      mapping, then the rename migration and the rest. The rename has to
      find the mapping's work already done, so it cannot go before it.

      ```bash
      psql "$INSTANCE_URL" -v ON_ERROR_STOP=1 -f db/migrations/0000_init.sql
      # … every migration up to but not including 0004_rename_household_id.sql
      psql "$INSTANCE_URL" -v ON_ERROR_STOP=1 -f scripts/cutover/mapping.sql
      psql "$INSTANCE_URL" -v ON_ERROR_STOP=1 -f db/migrations/0004_rename_household_id.sql
      # … and the migrations after it
      ```

- [ ] **The two ledgers are not the same, and neither replaces the other.**
      The instance's schema was applied through the Supabase MCP's migration
      tool, whose ledger is `supabase_migrations.schema_migrations` — eleven
      rows, nine of them the repository's migrations and two the repository
      does not have yet (`0005a_allow_migration_role_to_assume_app` and
      `0007_no_self_delete`, being committed as P0S-T19 and P0S-T34), so the
      instance is *ahead* of the repository. The application's runner keeps a
      second ledger of its own, `db_migrate.applied` — a schema-and-checksum
      table it creates itself — and that schema does not exist on the
      instance, because the runner has never run there.
      **The repository's migrations are the source of truth for the schema.**
      The MCP's ledger is the record of how one particular instance was
      built; the runner's ledger is the record of what the repository's
      migrations produce. Neither replaces the other, and no ledger row
      holds a credential.
- [ ] **The runner is not run against the target.** It is a development-side
      tool, and it refuses a host it cannot prove is local — `localhost`,
      `127.0.0.1`, `::1`, and anything ending in `.local` or `.localhost` —
      before it connects to anything. **The cutover leans on that refusal:**
      the reviewed files are applied by hand, with `psql`, in the order
      above; the runner's own refusal prints exactly those commands.
- [ ] **The resulting schema is verified against the repository**, not
      against a ledger: the §10.8 fixture is the check. The cutover depends
      on neither ledger.
- [ ] **The Supabase CLI's migration commands are not pointed at the target.**
      The CLI's ledger on that instance is the MCP tool's, and it is not the
      repository's to reconcile.
- [ ] **The mapping runs**: `scripts/cutover/mapping.sql`, with the two
      mapping tables filled in from `user_map` and the household mapping.
- [ ] **The verification queries pass**: `scripts/cutover/verify.sql`. Every
      orphan count is zero, and every row count the rehearsal compares
      matches the source.

### The application

- [ ] **`DATABASE_URL` is changed** in the deployment environment to the
      instance's connection — as the **application role**, not as the owner.
- [ ] **The Supabase URL and the two keys are changed** to the instance's.
- [ ] **The application is deployed.**

### The smoke test

This is the one step nothing else can do for you — see the last section.

- [ ] **A migrated user signs in**, with their old password.
- [ ] **Their household loads.**
- [ ] **An item is created and checked.**
- [ ] **The change log records it.**

---

## If it goes wrong

- [ ] **Revert `DATABASE_URL` and the Supabase URL and the two keys, and
      redeploy the previous application release.** Both halves are needed:
      the release this cutover deploys authenticates through Supabase Auth
      and expects the new schema, so against Neon's data it cannot sign
      users in. The configuration revert alone does not restore a working
      application.
- [ ] **Reconcile the writes made after the cutover, or record the loss.**
      Neon holds the data as of the cutover. Every write made on Supabase
      after it — the smoke-test item, and every change a user makes — is not
      in Neon, and a rollback makes it disappear from the application.
      Either those writes are reconciled into Neon first, or the loss is
      recorded as accepted, with the name of the person who accepted it.
- [ ] **Leave the rollback window open.** Neon stays intact for fourteen
      days whatever happens, and the transitional sign-in stays with it.

---

## After the window

### T+14 days — decommission

- [ ] **Every account that has never signed in has been dealt with.** Those
      accounts still hold the cutover's unusable password: the transitional
      route is what verifies their old one, and it is about to go. Either a
      password reset has been sent to them, or a recovery path is kept — or
      a user who returns after this day cannot get in at all.
- [ ] **The legacy tables are dropped** — Better Auth's `user`, `session`,
      `account`, `verification`, `organization`, `member` and `invitation`.
      Seven, and the list is the repository's own: `scripts/cutover/lib.mjs`
      exports it as `RESTORED_TABLES`, and those seven are its **Better
      Auth** entries. The export also lists the application's own five —
      `items`, `categories`, `stores`, `household_join_links` and
      `item_stores` — and **those are not part of this list**: the
      decommission drops the seven legacy tables and nothing else.
      `db/init.sql` creates all seven. A decommission that named five of
      them would leave two behind, holding whatever was in them.
- [ ] **The transitional sign-in route is removed**:
      `src/app/api/auth/legacy-signin/` and everything under
      `src/lib/legacy-auth/`.
- [ ] **The legacy code is deleted**, and the dependency with it.
- [ ] **The rollback window is closed.** Only now may Neon be decommissioned.

---

## Open items

The things that have to be settled before the window is scheduled. Each has a
name against it. None of them is assumed away.

| Item | What has to be settled | Whose it is |
| --- | --- | --- |
| **D-11 — the guard that ships** | The root `middleware.ts` is being replaced by a real guard (P0S-T32, in flight). The deployment has to carry the replacement, and the guard that ships has to preserve the destination. | Sara.F, with the product owner |
| **The accounts that have never signed in** | Every provisioned account holds an unusable password until the transitional route verifies the old one. Before the route goes, those accounts need a password reset or a recovery path. | The lead, with the product owner |
| **`db/init.sql` is missing three functions** | The file's header promises the snapshot and the migrations agree, and they do not: `app_user_display`, `app_accept_household_invitation` and `app_join_household_by_link` are in migration `0006` and not in the file. Until it is fixed, do not bootstrap an instance from `db/init.sql`. | Danny.DB (P0S-T28) |
| **The database does not refuse the self-delete yet** | §9.2b and §12.5 describe `household_members_no_self_delete` as the database's second layer, but no migration creates it: the policy exists only on the instance. Until it is in the repository's migrations, do not claim the database refuses the self-delete. | Danny.DB (P0S-T19) |
| **The writes made after the cutover** | A rollback to Neon drops every write made on Supabase after the cutover. Either those writes are reconciled into Neon before a rollback, or the loss is accepted, with the name of the person who accepted it. | The lead |

---

## What CI tells you, and what it does not

Three jobs run on every pull request:

| Check | What it proves | Gates a merge? |
| --- | --- | --- |
| `lint, type-check, unit tests, build` | The code lints, the types fit, the unit tests pass, the application builds | **Yes** |
| `supabase local stack, migrations, fixture, RLS` | The row-level security policies hold against a real GoTrue | No |
| `playwright, reporting only` | The journey: sign-up, sign-in, the household, the shopping trip, in three browsers and a phone profile | No |

**The browser suite's job takes about five minutes** — a minute and three
quarters for the browsers, under a minute for the local stack, and the suite
itself. It runs against the local stack, not against a deployment.

**A red browser suite is a finding, not a blocker.** It does not gate a
merge, and it opens an issue so that a person notices. That job exists
because no lint, type-check, unit test, build or RLS scenario can see a
defect in the journey: thirteen individually-green pull requests once landed
while the application could not create a household at all.

**What no check does: run the journey against the deployed environment.**
The browser suite runs against the local stack in CI, and nothing runs it
against the deployment. The smoke test above is therefore the only thing
that exercises the deployed journey — which is why it is not a step that can
be shortened, and why the browser suite's job is worth having even while it
is red.
