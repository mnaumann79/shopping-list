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
| `DATABASE_URL` | the **`app`** role through the pooler: `postgresql://app.eaawnwfrkvjbdigyasbk:<password>@aws-0-us-east-2.pooler.supabase.com:5432/postgres?sslmode=no-verify` |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://eaawnwfrkvjbdigyasbk.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | the publishable key — the one the browser is meant to use |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` |
| `RESEND_API_KEY` | **not set** |
| `SUPABASE_SERVICE_ROLE_KEY` | **not set** |

Two details in that table are the ones that cost time:

- **The pooler is `us-east-2`.** Every other region answers
  `tenant/user … not found` — that is the pooler saying it has no such
  tenant, not a DNS failure, and it is the same answer for a right username
  in the wrong region.
- **`?sslmode=no-verify`, not `require`.** The application's `pg` driver
  treats `require` as verify-full, and the pooler's certificate is signed by
  Supabase's own CA, whose name does not cover the pooler's host — so
  `require` is refused with *"self-signed certificate in certificate chain"*.
  `psql` wants `require`; the application wants `no-verify`. With no mode at
  all, the driver connects unencrypted.

**The run must not use the owner's credential.** `pnpm start` and `pnpm dev`
both run the check at the door ([P0S-T37](project.md#92b-row-level-security-the-second-layer-now-real)),
which refuses a privileged role against a host that is not local. The `app`
role passes it.

## The run

```bash
DATABASE_URL="postgresql://app.eaawnwfrkvjbdigyasbk:…@aws-0-us-east-2.pooler.supabase.com:5432/postgres?sslmode=no-verify" \
NEXT_PUBLIC_SUPABASE_URL="https://eaawnwfrkvjbdigyasbk.supabase.co" \
NEXT_PUBLIC_SUPABASE_ANON_KEY="sb_publishable_…" \
NEXT_PUBLIC_APP_URL="http://localhost:3000" \
pnpm test:e2e
```

`RESEND_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are deliberately absent: the
first means no invitation mail is sent, and the second means the suite never
opens the admin console.

## What the first execution found

The suite had never executed a spec: the last run before this one failed in
the setup, and Playwright reported that 168 of the 169 tests did not run. So
the first execution of the household specs against the local stack is the
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

**An expired join link cannot be told from an unknown one.** The join page
has a branch for it — "Link expired", on a 410 — and the server answers 404
for both. Telling them apart is a migration, so the spec waits for it
(`test.fixme`).

**`.env.test` carried `RESEND_API_KEY=ci-dummy-not-used`.** The invitation
endpoint sends the mail before it answers, so the dummy key turned every
invitation into a 500. The variable is P0S-T52's; the run sets it to empty,
which means "no mail" to the application — and the invitation row is written
before the mail is sent.

## What the run found

<!-- The results, once the run is over. -->

## The instance afterwards

<!-- The counts, compared against the baseline. -->
