# The cutover checklist

This is the list the person performing the cutover works through, in order.
Every item says what to do and what "done" looks like. The procedure behind
the items is §13.2a of [`docs/project.md`](./project.md) — this is the
checklist for it, not the procedure.

**The one thing to hold on to: the rollback is a configuration change, not a
restore, and it is available for fourteen days.** Nothing is deleted from
Neon until the window closes, and reverting means putting two environment
variables back.

The times are relative to the maintenance window (**T−0**).

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
- [ ] **The three membership functions exist** in the instance — the ones
      migration `0006` creates, and the ones `db/init.sql` has to carry
      (P0S-T28).
- [ ] **The application role's password is not in the ledger.** It is read
      from the environment, not written down (P0S-T26).

### T−1 day — the accounts are provisioned

- [ ] **Every legacy user has a GoTrue account** with `email_confirm: true`
      and the legacy display name in `user_metadata`.
- [ ] **`user_map (old_id text, new_id uuid)` is recorded** — the old id
      against the id GoTrue issued.
- [ ] **No password was carried across.** Better Auth's scrypt hash cannot
      become GoTrue's bcrypt, so every provisioned account holds the
      cutover's random, unusable password. The transitional sign-in is what
      carries a password across later, at sign-in, not here (§13.2c).

### T−1 day — the dry run

- [ ] **The dump is taken from Neon and restored into a scratch database on
      the instance** — scoped to the shopping list's tables. The scripts do
      this: `scripts/cutover/rehearse.mjs`.

      ```bash
      node scripts/cutover/rehearse.mjs \
        --source "postgresql://…@neon…/postgres" \
        --target "postgresql://…@the-instance…/postgres"
      ```

- [ ] **The rehearsal passes**, and its output is attached to the pull
      request. The rehearsal compares the row counts table by table, checks
      that no identity is orphaned, and fails on any mismatch.
- [ ] **The rehearsal's output has been read**, not just run. It is a dry
      run; a dry run that nobody read is a rehearsal that found nothing
      because nobody looked.

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
- [ ] **The mapping runs**: `scripts/cutover/mapping.sql`, with the two
      mapping tables filled in from `user_map` and the household mapping.
- [ ] **The verification queries pass**: `scripts/cutover/verify.sql`. Every
      orphan count is zero, and every row count matches the source.

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
      redeploy.** That is the whole rollback: a configuration change, not a
      restore. Neon was not modified during the window.
- [ ] **Leave the rollback window open.** Neon stays intact for fourteen
      days whatever happens, and the transitional sign-in stays with it.

---

## After the window

### T+14 days — decommission

- [ ] **The legacy tables are dropped** — Better Auth's `user`, `account`,
      `session`, `member` and `organization`.
- [ ] **The transitional sign-in route is removed**:
      `src/app/api/auth/legacy-signin/` and everything under
      `src/lib/legacy-auth/`.
- [ ] **The legacy code is deleted**, and the dependency with it.
- [ ] **The rollback window is closed.** Only now may Neon be decommissioned.

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
