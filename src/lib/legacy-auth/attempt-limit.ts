/**
 * The admission limit for the transitional sign-in.
 *
 * The route is unauthenticated and every attempt costs a scrypt and a
 * lookup of the GoTrue accounts, so without a limit an attacker could
 * make the server do that work on demand — and guess legacy passwords
 * without being throttled.
 *
 * Two counters, with different rules:
 *
 * - **The client's** counts the failures from the whole client, and a
 *   successful sign-in does not clear it: a working account must not be a
 *   way to keep guessing at other addresses.
 * - **The address's** counts the failures against that address, and a
 *   successful sign-in does clear it.
 *
 * The counts are in memory: the route goes with the legacy code in fourteen
 * days, and nothing here outlives the process. A deployment that fronts
 * the application with a rate limiter does not need this, but the route
 * cannot count on one: the application has no edge rate limiter — the root
 * middleware is an optimistic redirect for pages, and it limits nothing
 * (§12.1b).
 */

/** How long a failure is remembered. */
const WINDOW_MS = 15 * 60 * 1000;

/** The failures one client may make in the window. */
const MAX_PER_CLIENT = 10;

/** The failures one address may make in the window. */
const MAX_PER_EMAIL = 5;

/**
 * How many counters are kept.
 *
 * A hard cap: a caller that keeps trying new addresses cannot make the
 * map grow, and the oldest window goes when the cap is reached. The maps
 * are separate, so evicting an address never frees a client's quota.
 */
const MAX_KEYS = 1000;

type Counter = {
  /** The failures recorded in the window. */
  failures: number;
  /** When the window started. */
  startedAt: number;
  /** The attempts that were admitted and have not settled yet. */
  inFlight: number;
};

const clients = new Map<string, Counter>();
const emails = new Map<string, Counter>();

/**
 * Admits an attempt, or refuses it.
 *
 * The capacity is reserved in the same step as the check: concurrent
 * requests cannot all be admitted against a counter that has not been
 * updated yet, which is what a check-then-record would let them do.
 */
export function admit(client: string, email: string): boolean {
  // The client's quota is checked first, and an address counter is not
  // created for a caller that is already refused: a blocked caller must not
  // be able to make the map grow by trying new addresses.
  const clientCounter = counter(clients, client);

  if (clientCounter.failures + clientCounter.inFlight >= MAX_PER_CLIENT) {
    return false;
  }

  const emailCounter = counter(emails, email);

  if (emailCounter.failures + emailCounter.inFlight >= MAX_PER_EMAIL) {
    return false;
  }

  clientCounter.inFlight += 1;
  emailCounter.inFlight += 1;
  return true;
}

/**
 * Settles an admitted attempt.
 *
 * A failure is counted. A success clears the failures against that address
 * and nothing else — the client's own failures stay until the window ends.
 */
export function settle(client: string, email: string, succeeded: boolean): void {
  release(clients, client, succeeded, false);
  release(emails, email, succeeded, succeeded);
}

/** The counter for the key, or a fresh one when the window has passed. */
function counter(counters: Map<string, Counter>, key: string): Counter {
  const existing = counters.get(key);

  if (existing && Date.now() - existing.startedAt <= WINDOW_MS) {
    return existing;
  }

  // The map is a hard cap. The entries are inserted in the order their
  // windows started, so the oldest is the first to go — and the expired
  // ones are the oldest, so they are cleaned up on the way.
  if (counters.size >= MAX_KEYS) {
    const oldest = counters.keys().next();
    if (!oldest.done) {
      counters.delete(oldest.value);
    }
  }

  const fresh: Counter = { failures: 0, startedAt: Date.now(), inFlight: 0 };
  counters.set(key, fresh);
  return fresh;
}

/** Settles one counter: the reservation is released, and the failure counted. */
function release(
  counters: Map<string, Counter>,
  key: string,
  succeeded: boolean,
  clearFailures: boolean,
): void {
  const existing = counters.get(key);
  if (!existing) {
    return;
  }

  existing.inFlight = Math.max(0, existing.inFlight - 1);

  if (!succeeded) {
    existing.failures += 1;
    return;
  }

  if (clearFailures) {
    existing.failures = 0;
  }
}

/**
 * How many counters are live.
 *
 * The maps are a hard cap, and this is how a test sees that they are.
 */
export function liveCounters(): number {
  return clients.size + emails.size;
}
