# The browser suite against the development instance

The Playwright suite has only ever run against the local stack
([P0S-T33](../.github/workflows/e2e.yml)). The deployment the operator is
about to make runs the same code against the **development instance**, with
the instance's own GoTrue and the instance's own database. This is the
record of one run of the suite against that instance: what it needed, what
passed, what was skipped, and what the instance looked like afterwards.

## The environment the run needs

Every value is public except the database password, and the password stays in
the environment — none of it goes into the repository. `.env.test` keeps its
local fallbacks, and the instance's values come from the environment.

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | the **`app`** role through the pooler: `postgresql://app.eaawnwfrkvjbdigyasbk:<password>@aws-0-us-east-2.pooler.supabase.com:5432/postgres?sslmode=verify-full` |
| `NODE_EXTRA_CA_CERTS` | the **absolute** path of `deploy/prod-ca-2021.crt` — the root certificate the pooler's chain ends at |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://eaawnwfrkvjbdigyasbk.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | the publishable key — the one the browser is meant to use |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` |
| `RESEND_API_KEY` | **empty** — not absent; see below |
| `SUPABASE_SERVICE_ROLE_KEY` | **not set** |

Three details in that table are the ones that cost time:

- **The pooler is `us-east-2`.** Every other region answers
  `tenant/user … not found` — that is the pooler saying it has no such
  tenant, not a DNS failure, and it is the same answer for a right username
  in the wrong region.
- **The certificate has to be trusted.** The pooler's certificate chains to
  Supabase's own root, and nothing on the system trusts it, so the connection
  is refused with *"self-signed certificate in certificate chain"* unless
  Node is told to: `NODE_EXTRA_CA_CERTS` points at `deploy/prod-ca-2021.crt`
  (the file the dashboard offers under Project Settings → Database → SSL
  Configuration), with an **absolute** path — Node resolves a relative one
  against the process's working directory, so the same string connects from
  the repository root and is refused from anywhere else. The application
  reads the variable when it starts, so it has to be in the environment
  before the application starts. `require` is not the answer: `pg` treats it
  as verify-full. `no-verify` encrypts the traffic without authenticating
  the pooler, and the deployment does not use it.
- **`RESEND_API_KEY` is empty, not absent.** A key that is not a key turns
  every invitation into a 500 — the invitation endpoint sends the mail
  before it answers — and `dotenv` does not override a variable that is
  already set, so a key in the environment beats a key in a file. An empty
  value is "no mail" to the application, and the invitation row is written
  before the mail is sent.

**The certificate path is verified from a development machine.** With
`NODE_EXTRA_CA_CERTS` pointing at `deploy/prod-ca-2021.crt` and
`?sslmode=verify-full`, the pooler completes the handshake and answers
*password authentication failed* — which is the answer a wrong password
gets, and not the certificate refusal an untrusted chain gets. The tenant
name in the URL is right too: the pooler knows `app.eaawnwfrkvjbdigyasbk`.

**The run must not use the owner's credential.** `pnpm start` and `pnpm dev`
both run the check at the door ([P0S-T37](project.md#92b-row-level-security-the-second-layer-now-real)),
which refuses a privileged role against a host that is not local. The `app`
role passes it.

## The run

```bash
NODE_EXTRA_CA_CERTS="$(pwd)/deploy/prod-ca-2021.crt" \
DATABASE_URL="postgresql://app.eaawnwfrkvjbdigyasbk:…@aws-0-us-east-2.pooler.supabase.com:5432/postgres?sslmode=verify-full" \
NEXT_PUBLIC_SUPABASE_URL="https://eaawnwfrkvjbdigyasbk.supabase.co" \
NEXT_PUBLIC_SUPABASE_ANON_KEY="sb_publishable_…" \
NEXT_PUBLIC_APP_URL="http://localhost:3000" \
RESEND_API_KEY="" \
pnpm test:e2e
```

`SUPABASE_SERVICE_ROLE_KEY` is deliberately absent: the suite never opens the
admin console. Without it the transitional sign-in's *failure* path answers
500 rather than 401 — the route reaches the admin API to look the account
up — and the specs do not notice, because the page shows the same message
either way.

## What the first execution found

The suite had never had a green spec. The last run before this one failed in
the setup, and Playwright reported that 168 of the 169 tests did not run; and
the run on `main` that was allowed to finish (P0S-T45's measurement) reached
17 of the 169 tests before the job's timeout stopped it — and every one of
those 17 was a spec naming a route the application does not serve.

So the first execution of the household specs against the local stack is the
first look at the specs' assumptions, and it found six things.

**The specs named routes the application does not serve.** The household specs
created a household at `/api/auth/organization/create` (the application has
`/api/households`), signed up at `/api/auth/sign-up/email` (the sign-up goes
to the auth server at `/auth/v1/signup`) and posted an invitation to
`/api/households/invite` (the application has `/api/households/invitations`).
A spec that names a route the application does not serve never exercises the
application.

**The invitation form posted to a route that does not exist.** The household
settings page posted to `/api/households/invite`, so every invitation sent
from the page answered 404. Fixed here.

**`/api/invitation-email` read the legacy `invitation` table.** The
application writes `household_invitations`, and nothing has written
Better Auth's table since the auth swap — so the endpoint answered
`{email: null}` for every id the application creates, and the owner of a
household got 200 where the specification says 403. Fixed here: the endpoint
reads `household_invitations` in the caller's active household.

**The join page cancelled its own redirect.** It pushed to `/dashboard` and
then refreshed, and the refresh won the race whenever the page was reached by
a client-side navigation — which is how the sign-up page reaches it. The join
had succeeded ("Joined!" was on the screen) and the page never reached the
dashboard. Fixed here.

**An expired join link could not be told from an unknown one.** The join page
has a branch for it — "Link expired", on a 410 — and the server answered 404
for both. [P0S-T52](project.md) made the answer 410: the link's own row is
still there, and it is gone, which is what 410 says. The spec runs — as a
member of the household: the row is readable by the household's members and
by nobody else, so a caller who is not one gets the 404, because the
application cannot say that a link it cannot see has expired.

**`.env.test` carried `RESEND_API_KEY=ci-dummy-not-used`.** The invitation
endpoint sends the mail before it answers, so the dummy key turned every
invitation into a 500. P0S-T52 took the key out of the test environment and
out of the workflows; the run sets it to empty, which means "no mail" to the
application — and the invitation row is written before the mail is sent.

## What the run found

**The first run** (2026-11-14, against the merged main of that morning —
before P0S-T50's budgets, P0S-T57's guard and P0S-T60's fill helper): **169
tests in 1.7 hours — 83 passed, 79 failed, 7 did not run.**

Every failure has one of four causes, and each was measured rather than
guessed:

- **The edge guard was not there** (P0S-T57). The guard's file was in the
  project root, and the *development server* does not run a file there — only
  the built application does — and the suite runs against the development
  server. So the destination was never carried, and the two specs that ask
  for it (`?returnTo=`) failed in every project.
- **The budgets were Playwright's defaults** (P0S-T50): thirty seconds for a
  test, five for an expectation. Against the instance every request crosses
  the network, and the specs that create a user, a household and an item ran
  out of time.
- **The form lost the value the spec filled into it** (P0S-T60, and the
  product's own defect, P0S-T61). In WebKit and in the phone profile the
  fill lands before the page has hydrated; the hydration takes the value back
  from the server's markup, the page says "Name is required", and the sign-up
  never goes out: "The 'Sign up' form sent no request to /auth/v1/signup".
  The setup never saw it, because a project without a `browserName` runs in
  Chromium.
- **The transitional sign-in's failure path needs the service-role key**,
  which this run deliberately does not carry. The log says so — "SUPABASE_
  SERVICE_ROLE_KEY is not configured" — and the route answers 500 instead of
  401 on that path. The specs do not notice, because the page shows the same
  message either way.

**What the run proved, which is the point of running it against the
instance at all.** The application works against the instance, with the
instance's own GoTrue and the instance's own database:

- the **app role** connects through the pooler with the chain verified
  (`?sslmode=verify-full` and the root certificate), and the application
  refuses to serve a privileged role;
- GoTrue **signs a visitor up and issues a session**, and the invitation and
  join-link journeys work against the instance's tables;
- the **policies hold**: the specs that read the database read it in the
  caller's scope, a plain member is refused with **403** where the
  specification says 403, and the cross-household reads fail as they should.

**The second run** (after P0S-T50, P0S-T57 and P0S-T60, with four workers)
failed differently, and the difference is worth more than a number: the
application's own database pool could not establish connections to the pooler
("There was an error establishing an SSL connection"), the instance ended up
holding **no** session from the application, and the specs that read the
database **timed out** instead of answering. The application's pool is
`new Pool({ connectionString, max: 10 })` — and `pg-pool`'s own source says
what a missing `connectionTimeoutMillis` means: the pool waits **indefinitely**
for a connection. So a request that cannot reach the database does not fail; it
waits. That is P0S-T63.

What was measured: the burst of TLS failures, the instance's sessions going to
zero while the application was still running, and the specs timing out rather
than erroring. **What was not established** is the mechanism inside the pooler.
The instance was holding a backlog of stale sessions at the time — fourteen
idle, the oldest over a day old — which it reaped during the run, and that is
the most likely story; it is still a story. The symptom, and the application's
response to it, are the findings.

## The instance afterwards

The run has to leave the instance as it was: the tables it touches counted
before and after, and what it added removed. The application's own role
cannot read the users table — a SELECT on it would put the password hashes
within the application's reach — so the cleanup is done with another
connection, and the addresses the run registered are written to
`test-results/created-addresses.txt` for it.

**Before the first run** (2026-11-14 03:34:42 UTC): households 1,
household_members 1, items 0, item_stores 0, categories 0, stores 0,
household_invitations 0, household_join_links 0, sync_changes 0,
sync_operations 0, `auth.users` 4 — three of them from before this run, and
one the lead created while probing the sign-up.

**After the first run:** households 40, household_members 60, items 24,
item_stores 16, categories 280, stores 16, household_invitations 25,
household_join_links 24, `auth.users` 66.

**After both runs:** households 55, household_members 75, items 27,
item_stores 16, categories 360, stores 18, household_invitations 32,
household_join_links 30, `auth.users` 87.

**The cleanup:** everything created after the snapshot goes, in the order the
foreign keys require — the item-store rows, then the items, the categories,
the stores, the invitations, the join links, the sync rows, the memberships,
the households, and the accounts the runs registered.

**After the cleanup** (measured again, 2026-11-14 06:00 UTC): households 1,
household_members 1, items 0, item_stores 0, categories 0, stores 0,
household_invitations 0, household_join_links 0, sync_changes 0,
sync_operations 0, `auth.users` 3, `auth.identities` 3, `auth.sessions` 3 —
**the instance is as it was**, with the one household and the one membership
that were there before, and the three accounts that were there before (one of
them the lead created while probing the sign-up, which the cleanup removed as
well, so that the count is the three that predate this work).

The procedure, for the next run: count the tables, run, count them again,
delete everything created after the first count in the order above, and count
them a third time. The application's own role cannot read the users table — a
SELECT on it would put the password hashes within the application's reach — so
the cleanup is done with another connection.
