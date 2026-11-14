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
still there, and it is gone, which is what 410 says. The spec runs.

**`.env.test` carried `RESEND_API_KEY=ci-dummy-not-used`.** The invitation
endpoint sends the mail before it answers, so the dummy key turned every
invitation into a 500. P0S-T52 took the key out of the test environment and
out of the workflows; the run sets it to empty, which means "no mail" to the
application — and the invitation row is written before the mail is sent.

## What the run found

**The run is pending.** It waits for the app role's `DATABASE_URL` — the `app`
role through the pooler, and never the owner's credential. The results go
here: the number of tests that ran, the ones that passed, the ones that were
skipped and why.

## The instance afterwards

**Also pending.** The run has to leave the instance as it was: the tables it
touches counted before and after, and what it added removed. The application's
own role cannot read the users table — a SELECT on it would put the password
hashes within the application's reach — so the cleanup is done with another
connection, and the addresses the run registered are written to
`test-results/created-addresses.txt` for it.
