/**
 * The admission limit for the transitional sign-in.
 *
 * The route is unauthenticated and every failed attempt costs a scrypt and
 * a lookup of the GoTrue accounts, so without a limit an attacker could
 * make the server do that work on demand — and guess legacy passwords
 * without being throttled.
 *
 * The counts are in memory: the route goes with the legacy code in fourteen
 * days, and nothing here outlives the process. A deployment that fronts
 * the application with a rate limiter does not need this, but the route
 * cannot count on one: the guard in the root `middleware.ts` does not run
 * (§12.1b).
 */

/** How long a failure is remembered. */
const WINDOW_MS = 15 * 60 * 1000;

/** The failures one client may make in the window. */
const MAX_PER_CLIENT = 10;

/** The failures one address may make in the window. */
const MAX_PER_EMAIL = 5;

/** How many counters are kept before the expired ones are dropped. */
const MAX_KEYS = 1000;

type Counter = { count: number; firstAt: number };

const clients = new Map<string, Counter>();
const emails = new Map<string, Counter>();

/** Whether the request may be admitted. */
export function isAdmitted(client: string, email: string): boolean {
  return (
    failures(clients, client) <= MAX_PER_CLIENT &&
    failures(emails, email) <= MAX_PER_EMAIL
  );
}

/** Counts a failed attempt. */
export function recordFailure(client: string, email: string): void {
  count(clients, client);
  count(emails, email);
}

/** Forgets the failures: a sign-in that worked is not a failure any more. */
export function recordSuccess(client: string, email: string): void {
  clients.delete(client);
  emails.delete(email);
}

/** The failures in the window. */
function failures(counters: Map<string, Counter>, key: string): number {
  const counter = counters.get(key);
  if (!counter) {
    return 0;
  }

  if (Date.now() - counter.firstAt > WINDOW_MS) {
    counters.delete(key);
    return 0;
  }

  return counter.count;
}

/** Counts one more failure for the key. */
function count(counters: Map<string, Counter>, key: string): void {
  const counter = counters.get(key);

  if (!counter || Date.now() - counter.firstAt > WINDOW_MS) {
    prune(counters);
    counters.set(key, { count: 1, firstAt: Date.now() });
    return;
  }

  counter.count += 1;
}

/** Drops the counters that are out of date, so the map cannot grow for ever. */
function prune(counters: Map<string, Counter>): void {
  if (counters.size <= MAX_KEYS) {
    return;
  }

  const now = Date.now();
  for (const [key, counter] of counters) {
    if (now - counter.firstAt > WINDOW_MS) {
      counters.delete(key);
    }
  }
}
