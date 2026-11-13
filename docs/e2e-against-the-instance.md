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

## What the run found

<!-- The results, once the run is over. -->

## The instance afterwards

<!-- The counts, compared against the baseline. -->
