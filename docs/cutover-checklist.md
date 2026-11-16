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
- **A build in a tree whose `node_modules` is a symlink fails as if the
  build were broken.** Turbopack rejects a `node_modules` symlink whose
  target is outside the project root — "Symlink [project]/node_modules is
  invalid, it points out of the filesystem root" — so a job that ever sees a
  tree like that fails on the build rather than on the code. Install the
  dependencies in the tree the build runs in.
- **The install must not run with `NODE_ENV=production`.** pnpm skips the
  devDependencies, and `pnpm build` then fails with "Cannot find module
  'typescript'". CI overrides `NODE_ENV` for the install only, and the
  deployment has to do the same.
- **There is no `output: 'standalone'`** in `next.config.ts`, so a
  standalone-style Dockerfile will not work: the image needs `node_modules`
  and `pnpm start`.
- **The build needs no database.** The check that refuses a privileged
  connection runs when the application starts, not when it is built, so
  `pnpm build` works with no `DATABASE_URL` at all.

### The two connection strings

Two, for two different jobs:

- **Set `DATABASE_URL` to the non-owner `app` role** — the policies apply
  to it, which is the point of them. (The application connects as whatever
  the string names; this is what makes the policies apply.)
- **The verification needs the owner role**: the §10.8 fixture creates its
  own schema, and the backup-restore rehearsal creates a database as well.
  The fixture needs CREATE on the database it runs against, and with that
  it runs as the application role — measured: 44 scenarios, 270 assertions,
  all passed against the instance as `app` — so the next operator does not
  go looking for an owner's password they do not need. The rehearsal is
  what creates a database, and that is what needs the owner. The owner
  bypasses row-level security, which is exactly why it is not what the
  application uses.

**The `sslmode` is not the same for every server and every tool.** Against
the Supabase pooler the deployment's `DATABASE_URL` carries
`?sslmode=verify-full`, and the deployment points `NODE_EXTRA_CA_CERTS` at
Supabase's root certificate — `deploy/prod-ca-2021.crt` in the repository,
the file the dashboard offers under Project Settings -> Database -> SSL
Configuration. The pooler's certificate chains to it and nothing else on
the system trusts it, so without the file the connection is refused with
"self-signed certificate in certificate chain". Node reads
`NODE_EXTRA_CA_CERTS` when it starts, so the deployment has to have it set,
not only the connection string.

`psql` is told the same certificate its own way: `?sslmode=verify-full`
with `sslrootcert` pointing at that file. `sslrootcert=system` does not
help — the system's roots do not carry Supabase's.

A deployment that cannot carry the file can use `?sslmode=no-verify`, which
encrypts the traffic without authenticating the pooler: an attacker on the
network path could impersonate it. `?sslmode=require` is not the answer
either — `pg` treats it as `verify-full`, so the chain is refused.

Against a local database there is no mode at all: the local PostgreSQL
offers no TLS, so both `verify-full` and `require` are refused, and the
connection string that connects is the one with no mode.

### The pool's size and the pooler's pool

The application opens up to ten connections at once — `max: 10` in
`src/db/index.ts` — and the pooler is Supavisor's, whose pool for the
tenant is set in the dashboard (Project Settings -> Database -> Pooler).
**Size both pools for the configured mode and the total demand**: in session
mode, which the deployment's `DATABASE_URL` uses, the pooler queues a client
that finds no free backend connection for up to a minute, so a pool smaller
than the application's `max` makes the excess clients wait in that queue; in
transaction mode, the pooler adds backend connections only when it needs
them, so the application's ten can share fewer.

**The symptom that was observed when the two did not match is a TLS
handshake failure**, and it says nothing about the cause: *"There was an
error establishing an SSL connection"* from the application's own pool, a
burst of them, and then the pool stops working altogether — the instance
holds no session from the application while the application is still
running, and the requests that read the database time out instead of
answering. It reads like the certificate's mistake, because the message is
the same one the certificate produces. The pools' sizes are the first thing
to check, before the window and not during it — though the mechanism inside
the pooler is not established: the instance was holding a backlog of stale
sessions at the time, and it reaped them during the run.

**The application does not wait for the database for ever.** The pool has a
connection timeout, a query timeout and an idle timeout, so a request that
cannot reach the database answers with an error in seconds instead of
hanging, a query that overruns is cancelled on the server, and a connection
the pooler has dropped is closed by the application instead of being handed
to the next request. Measured against a database that accepts the connection
and then says nothing: the request had not answered after sixty seconds
before the timeouts, and answers with a 500 in twelve. A request that hangs
during the window is therefore a defect in the application, not the pooler's
patience.

### The check at the door

The application refuses to serve when the role `DATABASE_URL` names is
privileged, because then the policies are not enforced at all.

The check runs before the server accepts a request — `pnpm start` and
`pnpm dev` both run it first — and it asks the same assertions the CI's own
check uses (`scripts/app-role.sql`), against the role the connection
actually authenticated as. A role that is a superuser, has `BYPASSRLS`, or
owns a table in `public` ends the process, with a message that names the
role and says what it costs: the household isolation is not being enforced
by the database, and the connection sees every household's rows.

It is runnable by hand against any database:

```bash
DATABASE_URL="postgresql://…" node scripts/assert-connection-role.mjs
```

Against a **local** host it reports the same finding and lets the
application start: the local stack's own `postgres` is a superuser, and the
developer asked for it. A deployment is not local, and against one the
check refuses to serve.

### The certificate at runtime

The repository path is not the runtime path. `deploy/prod-ca-2021.crt` is on
disk in a checkout, and `deploy/` is not `public/`, so `next build` copies
none of it into the build output. The runtime image has to carry the file,
and `NODE_EXTRA_CA_CERTS` must carry its **absolute** path there. A relative
path works only while the application runs from the repository root: Node
resolves it against the process's working directory, so the same string
connects from there and is refused from anywhere else.

Node reads `NODE_EXTRA_CA_CERTS` when the process starts, so the variable
has to be in the deployment's environment before the application starts.
The application cannot set it for itself.

**Read "self-signed certificate in certificate chain" as "the path is
wrong", not as "the certificate is absent"** — the two are the same
message. The deployment refuses to start, and the reason is in the log: the
line that says "Refusing to serve" names what could not be reached and
why — read that line, not the advice under it, which names the certificate
whether or not the certificate is what went wrong. A deployment that will
not start is a deployment that cannot serve anybody, which is the better
shape for this to fail in.

The alternative is an image that installs the certificate into the system's
trust store. With `NODE_OPTIONS=--use-openssl-ca` (Node 22 and later) Node
uses OpenSSL's store instead of its own bundled roots, and then no path is
needed anywhere.

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
2. **Then set the role's password**, and make the pooler take it. The
   pooler authenticates the application role by fetching the role's
   credential, and it does not always see the instance's copy: the
   credential on the instance and the pooler's copy of it can come apart,
   and a change to the role's password alone does not re-sync it.
   **What that means in practice** — the procedure and the check are in
   [the password procedure](#the-application-roles-password), and the check
   is what says the password is ready: the pooler accepting the new
   password, and refusing a wrong one.
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
- [ ] **`db/init.sql` carries those three functions.** It does — the file
      carries what migration `0006` creates, and the two `auth.users`
      columns it needs (P0S-T28), so the snapshot and the migrations
      agree and an instance may be bootstrapped from `db/init.sql`.
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
      **It writes only inside its scratch database, and it drops that
      database when the run completes.** The identities the mapping needs
      are issued by the rehearsal and put in the scratch database's
      `auth.users`, where GoTrue manages nothing; the instance's own
      `auth.users` is GoTrue's, and the rehearsal does not write to it. The
      tables the instance holds are left exactly as they were. The run
      against the development instance is recorded in
      [`docs/cutover-rehearsal.md`](./docs/cutover-rehearsal.md).
      **A run that fails leaves its scratch database behind**, with
      whatever it had restored: the rollback is the last step, and a
      failure skips it. The script prints the database's name; drop it by
      hand with the forced drop the rollback itself uses:
      `psql "$INSTANCE_URL" -v ON_ERROR_STOP=1 -c 'DROP DATABASE IF EXISTS "cutover_rehearsal_…" WITH (FORCE)'`.
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

- [ ] **The deployment carries the guard, the guard keeps the destination,
      and the optimistic cookie check is gone.** The guard is
      `src/middleware.ts`: the file the development server runs *and* the
      built application runs, which is why the browser suite exercises the
      guard the deployment ships — a guard only the built application ran
      was a guard the suite never exercised. Check that the deployment
      carries it, that a sign-in still lands on the destination it was
      going to, and that the optimistic check on the cookie's *presence* is
      gone.

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
      tool, whose ledger is `supabase_migrations.schema_migrations` — one
      row for each of the repository's migrations, so the instance is at the
      repository's schema and not ahead of it (P0S-T19, P0S-T34, P0S-T40).
      The application's runner keeps a second ledger of its own,
      `db_migrate.applied` — a schema-and-checksum table it creates itself —
      and that schema does not exist on the instance, because the runner
      has never run there.
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

- [ ] **The application role's password is set afresh**, through the
      [procedure below](#the-application-roles-password) — a change to the
      role's password alone does not re-sync the pooler. The instance's
      `app` role already has a password — the one the rehearsal used, and
      the one this project's `DATABASE_URL` and the deployment's
      environment file carry. The pooler accepts it as `app` today, so the
      deployment would inherit it as it stands: **the rehearsal's password
      is not carried across.** The new one goes into the deployment's
      environment and nowhere else — not into the ledger, not into this
      document.
- [ ] **The pooler accepts the new password**, checked before the
      connection string changes — [the check is here](#the-application-roles-password).
- [ ] **`DATABASE_URL` is changed** in the deployment environment to the
      instance's connection — as the **application role**, not as the owner,
      and with the **new** password.
- [ ] **The Supabase URL and the two keys are changed** to the instance's.
- [ ] **The application is deployed.**

#### The application role's password

The pooler authenticates the application role by fetching the role's
credential from the instance, and it caches what it fetches. A change to the
role's password on the instance does not necessarily reach that cache, so
the pooler can keep accepting the old password and refusing the new one.
The application connects through the pooler, so the pooler is what decides
whether the application can sign in at all.

**Set the password on the instance**, with the owner's connection. The
password is read from the environment, not written into the command, so it
does not end up in the shell's history or in the process list:

```bash
psql "$OWNER_DATABASE_URL" -v ON_ERROR_STOP=1 <<SQL
ALTER ROLE app WITH PASSWORD '$APP_ROLE_PASSWORD'
SQL
```

**Then let the pooler take it.** The pooler re-reads the role's credential
when its tenant configuration is refreshed, so re-saving the pooling
settings — Project Settings → Database → Connection Pooling → Save — is
what makes it look again. If the pooler still refuses the new password,
pause the project and resume it, and wait for it to come back before
trying again.

**Then check that the pooler accepts it**, before anything points at the
new password:

```bash
psql "postgresql://app.<project-ref>:${APP_ROLE_PASSWORD}@aws-0-us-east-2.pooler.supabase.com:5432/postgres?sslmode=require" \
  -tAc "SELECT current_user"
```

It answers `app`. The check is two-sided, and the second half is what makes
the first half mean something: the same command with a wrong password is
refused. If the new password is refused, the pooler has not taken it yet —
wait, re-save the pooling settings, and do not go on to `DATABASE_URL`.

The password is not recorded anywhere: not in the ledger, not in this
document, not in a message.

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
| **D-11 — the guard that ships** | The guard has landed: P0S-T32 put a real guard in place of the root middleware's optimistic check on the cookie's *presence*, and P0S-T57 moved it to `src/middleware.ts` — the file the development server and the built application both run, so the browser suite exercises the guard the deployment ships. What is left is the product owner's decision: this is the guard that ships, and it preserves the destination for every protected route. | Sara.F, with the product owner |
| **The accounts that have never signed in** | Every provisioned account holds an unusable password until the transitional route verifies the old one. Before the route goes, those accounts need a password reset or a recovery path. | The lead, with the product owner |
| **The writes made after the cutover** | A rollback to Neon drops every write made on Supabase after the cutover. Either those writes are reconciled into Neon before a rollback, or the loss is accepted, with the name of the person who accepted it. | The lead |

---

## What CI tells you, and what it does not

Three jobs run on every pull request:

| Check | What it proves | Gates a merge? |
| --- | --- | --- |
| `lint, type-check, unit tests, build` | The code lints, the types fit, the unit tests pass, the application builds | **Yes** |
| `supabase local stack, migrations, fixture, RLS` | The row-level security policies hold against a real GoTrue | No |
| `playwright, reporting only` | The journey: sign-up, sign-in, the household, the shopping trip, in three browsers and a phone profile | No |

**The browser suite's job's runtime is established.** The four-worker run
finished in **23.4 minutes** — the 169 specs in 10 files, on the CI runner
against the local stack — inside the job's 45-minute budget and the
suite's own 35-minute budget. A loaded runner is slower: that is the
runner's figure, not a promise. It runs against the local stack in CI, not
against a deployment.

**A red browser suite is a finding, not a blocker.** It does not gate a
merge, and it opens an issue so that a person notices. That job exists
because no lint, type-check, unit test, build or RLS scenario can see a
defect in the journey: thirteen individually-green pull requests once landed
while the application could not create a household at all.

**What no check does: run the journey against the deployed environment.**
The browser suite runs against the local stack in CI, and the run against the
**development instance** — the instance the deployment points at, with the
instance's own GoTrue and the instance's own database — is recorded in
`docs/e2e-against-the-instance.md`. **That run is pending**: it waits for the
app role's `DATABASE_URL`, and the record says so until it has happened.
What no check does is run the journey against the *deployed* environment:
the smoke test above is therefore still the only thing that exercises the
deployed journey — which is why it is not a step that can be shortened, and
why the browser suite's job is worth having even while it is red.
