# PERF-07 audit (bi-monthly)

Auth-aware Lighthouse audit on `/dashboard`. Budgets: **LCP < 2500 ms**, **CLS < 0.1** (mobile, simulated 4G).

## What it is

`scripts/verify-perf-07.mjs` drives a real Lighthouse run against the authenticated dashboard. It signs up a fresh user against the Supabase Auth server, creates a household through the application's own route, seeds three items in it, captures the cookies the application set, injects them into a headless Chrome instance, runs Lighthouse against `/dashboard`, and exits non-zero if either budget is exceeded. The full Lighthouse JSON is written to `lighthouse-report-<timestamp>.json` at the repo root.

**The setup is the product's own journey**, not a stand-in for it: a Supabase Auth sign-up, then `POST /api/households`, which creates the household, makes the caller its owner, and leaves that household active in the `sb-household` cookie. That cookie is what Better Auth's `session.activeOrganizationId` used to do, and the household is what its organization was: one tenant, one list, one signed-in member.

**What is measured has not changed.** Lighthouse runs on the authenticated dashboard with the same emulation (mobile, simulated 4G), the same budgets, and the same numbers read out of the report — LCP, CLS, FCP, TBT, Speed Index and the performance score.

## Trigger

- **Scheduled**: GitHub Actions cron — `0 3 1 1/2 *` (03:00 UTC on the 1st of every other month: Jan / Mar / May / Jul / Sep / Nov).
- **Manual**: GitHub → Actions → `perf-audit` → Run workflow.

## How the run is set up

The job starts the **Supabase local stack** (`supabase start`, the same version the integration job uses) and runs the audit against it. The stack brings both halves of the platform the journey needs: GoTrue, which owns the `auth` schema and writes the signed-up user into the database, and the Postgres the application connects to — the same database, so the household's foreign key resolves.

**The gateway must not be excluded.** The Supabase client addresses the gateway, and the gateway is what serves `/auth/v1`: without it, the browser signs nobody in, and the specs fail in a way that looks like a product defect rather than a missing container. The integration job excludes it because the application there is not exercised over HTTP.

The job takes the two public values the browser client signs up with from the stack itself (`supabase status --output env`: `API_URL` and `PUBLISHABLE_KEY`), so there are no secrets in it and nothing to keep in step. They are read with `grep`/`cut`, not evaluated, and a value that cannot be read stops the job there — with the message `the local stack's url was not read from 'supabase status --output env'` — rather than minutes later, after the stack has started and the app has been built. The schema comes from `db/migrations/**` through `pnpm db:migrate` — the migration folder is the source of truth, and the flat snapshot `db/init.sql` is a mirror of it. The snapshot is not applied on top: it adds its constraints unconditionally, so applying both would fail on the first constraint that already exists.

## Owner

`@mnaumann79`. Failure issues are auto-labeled `perf-regression` and routed here.

## Reading the artifact

Download `lighthouse-report-<timestamp>.json` from the workflow run's **Artifacts** section. The two fields that matter:

- `audits['largest-contentful-paint'].numericValue` (ms)
- `audits['cumulative-layout-shift'].numericValue` (raw)

Both also appear in the run's stdout under "Core Web Vitals (mobile, simulated 4G)". The full report includes per-audit opportunities and diagnostics if a deeper investigation is needed.

## Failure handling

1. The bot opens **one** open `perf-regression` issue per active regression. Re-runs comment on the same issue instead of opening duplicates.
2. Download the artifact and confirm the failure against the budgets above.
3. Run the script locally to reproduce:

   ```bash
   # The local stack: GoTrue, and the Postgres the application connects to.
   npx supabase start
   eval "$(npx supabase status -o env)"

   # One file for both terminals. The audit script reads the Supabase values
   # from its own environment, and an export in one terminal does not reach
   # the other - so both terminals source the same file.
   cat > /tmp/perf-audit.env <<EOF
   export NEXT_PUBLIC_SUPABASE_URL="$API_URL"
   export NEXT_PUBLIC_SUPABASE_ANON_KEY="$PUBLISHABLE_KEY"
   export DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
   EOF

   # In one terminal
   source /tmp/perf-audit.env
   pnpm db:migrate
   pnpm build
   pnpm start

   # In another terminal
   source /tmp/perf-audit.env
   pnpm exec node scripts/verify-perf-07.mjs
   ```

   (The script writes `lighthouse-report-*.json` to the current directory.)
4. `git log --since="<last-good-run-date>" --until="<failure-date>"` to find candidate commits.
5. If the failure is a flake (transient DB / network), close the issue — the next scheduled run will re-verify.

## Rerun

GitHub → Actions → `perf-audit` → run → **Re-run all jobs**. The comment thread on the existing `perf-regression` issue captures the full history.

## Common failure modes

- **The local stack does not start** — the health check failed. Retry the run; if persistent, the runner image may have shifted.
- **The stack's configuration was not read** (`the local stack's url was not read from 'supabase status --output env'`) — the CLI's output shape changed. The job stops there, before it builds anything; the two values are read with `grep`/`cut`, and one of them came back empty.
- **Signup fails** (`signup failed: 4xx`) — the Supabase configuration is wrong: `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` must name the project the application signs up against. In the workflow they come from `supabase status`; locally, from the same command.
- **Sign-up succeeds but the household is not created** (`household create failed`) — the application could not write to the database. Check `DATABASE_URL` and that the schema is applied (`pnpm db:migrate`).
- **The readiness probe times out** — the application did not answer `/api/categories` with 401 or 200 within 60 seconds. The step prints the tail of the app log.
- **Cookies not injected** — `chrome-remote-interface` connection error. Confirm Chrome launched; the script's `chromeFlags` (`--headless=new --no-sandbox`) are required for the CI runner.
- **LCP exceeded at random** — cold-start variance. Re-run once; if it persists past three runs, it's a real regression and warrants investigation.
- **`pnpm install --frozen-lockfile` fails** — lockfile out of sync with `package.json`. Run `pnpm install` locally and commit the updated `pnpm-lock.yaml`.

## Adding this to a new repo

The workflow is self-contained but assumes:

- `pnpm` as the package manager.
- `scripts/verify-perf-07.mjs` exists and writes `lighthouse-report-*.json` to the cwd.
- The app uses Postgres (or a Postgres-compatible service) accessible via `DATABASE_URL`.
- The app authenticates against Supabase Auth, and the audit can sign up against it with the publishable key.
- The app creates a household through `POST /api/households`, and that route leaves the household active in the `sb-household` cookie.
- The app exposes a route the readiness probe can ask — the workflow probes `/api/categories` and accepts `401` (the route wants a session) or `200`.

If any of these don't apply, the workflow needs adaptation before reuse.
