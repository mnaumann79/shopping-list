# PERF-07 audit (bi-monthly)

Auth-aware Lighthouse audit on `/dashboard`. Budgets: **LCP < 2500 ms**, **CLS < 0.1** (mobile, simulated 4G).

## What it is

`scripts/verify-perf-07.mjs` drives a real Lighthouse run against the authenticated dashboard. It signs up a fresh user via the better-auth API, captures the post-login cookies, injects them into a headless Chrome instance, runs Lighthouse against `/dashboard`, and exits non-zero if either budget is exceeded. The full Lighthouse JSON is written to `lighthouse-report-<timestamp>.json` at the repo root.

## Trigger

- **Scheduled**: GitHub Actions cron — `0 3 1 1/2 *` (03:00 UTC on the 1st of every other month: Jan / Mar / May / Jul / Sep / Nov).
- **Manual**: GitHub → Actions → `perf-audit` → Run workflow.

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
   # In one terminal
   pnpm build
   pnpm db:push           # or: pnpm exec drizzle-kit push
   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/shopping_list_perf \
     BETTER_AUTH_SECRET=ci-perf-audit-secret \
     BETTER_AUTH_URL=http://localhost:3000 \
     NEXT_PUBLIC_APP_URL=http://localhost:3000 \
     pnpm start

   # In another terminal
   pnpm exec node scripts/verify-perf-07.mjs
   ```

   (Or use `docker run --rm -p 5432:5432 -e POSTGRES_PASSWORD=postgres postgres:16` to provide the DB.)
4. `git log --since="<last-good-run-date>" --until="<failure-date>"` to find candidate commits.
5. If the failure is a flake (transient DB / network), close the issue — the next scheduled run will re-verify.

## Rerun

GitHub → Actions → `perf-audit` → run → **Re-run all jobs**. The comment thread on the existing `perf-regression` issue captures the full history.

## Common failure modes

- **DB unreachable** — `services.postgres` health check failed. Retry the run; if persistent, the Postgres image or runner image may have shifted.
- **Signup fails** (`signup failed: 4xx`) — better-auth config drift. Verify `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL` env vars are set in the workflow.
- **Cookies not injected** — `chrome-remote-interface` connection error. Confirm Chrome launched; the script's `chromeFlags` (`--headless=new --no-sandbox`) are required for the CI runner.
- **LCP exceeded at random** — cold-start variance. Re-run once; if it persists past three runs, it's a real regression and warrants investigation.
- **`pnpm install --frozen-lockfile` fails** — lockfile out of sync with `package.json`. Run `pnpm install` locally and commit the updated `pnpm-lock.yaml`.
- **drizzle-kit push fails** — schema migration drift. Run `pnpm exec drizzle-kit push` locally to verify, then commit any new migration files.

## Adding this to a new repo

The workflow is self-contained but assumes:

- `pnpm` as the package manager.
- `scripts/verify-perf-07.mjs` exists and writes `lighthouse-report-*.json` to the cwd.
- The app uses Postgres (or a Postgres-compatible service) accessible via `DATABASE_URL`.
- The app exposes `/api/auth/get-session` for the readiness probe.

If any of these don't apply, the workflow needs adaptation before reuse.
