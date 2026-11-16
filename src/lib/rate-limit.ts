/**
 * The application's own admission limit.
 *
 * A limit is a flood guard, not a quota. It stops one caller from making
 * the server do the same expensive thing over and over; it does not say how
 * much a household may do in total, and a caller that is refused is not
 * punished beyond the window.
 *
 * **The counters live in the process.** A deployment that runs several
 * instances gives each of them its own counters, so the limit is a floor per
 * instance rather than a global one — the transitional sign-in's limit says
 * the same about its own counters. What a limit stops is a flood from one
 * place, and a flood is answered by the instance it reaches.
 *
 * **The limit is applied after the authorization, never before it.** A
 * caller who may not act is not a caller to be counted: a 429 where a 403
 * belongs tells the caller the wrong thing, and it spends a household's
 * quota on a refusal.
 */
export type Limit = {
  /** The calls one key may make in the window. */
  readonly max: number;
  /** How long the window lasts. */
  readonly windowMs: number;
};

/** What the limit says about one call. */
export type Admission =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly retryAfterSeconds: number };

/**
 * The limit the invitation route uses.
 *
 * The route is not the application's most expensive one, but it is the only
 * one that calls somebody else's server for every request: an invitation
 * sends a mail. A household invites people — a handful, over a week — and a
 * script that calls the route in a loop sends mail for as long as it runs.
 * The limit is per household, so the administrators of one household share
 * one quota and a household is not affected by anybody else's.
 */
export const INVITATION_LIMIT: Limit = { max: 20, windowMs: 60 * 60 * 1000 };

/**
 * The limit the join-link route uses.
 *
 * A link is a credential: whoever holds it may join the household. A
 * household mints a link to let somebody in — a handful, over a week — and
 * the limit stops a caller from minting them without end. It is per
 * household, so one household's links are nobody else's business.
 */
export const JOIN_LINK_LIMIT: Limit = { max: 20, windowMs: 60 * 60 * 1000 };

/**
 * How many counters are kept.
 *
 * A hard cap: the map is as big as the number of keys that made a call, and
 * nothing removes a counter but its window or the cap. A caller that keeps
 * trying new keys must not be able to make the map grow without end.
 */
const MAX_KEYS = 10_000;

type Counter = {
  /** The calls admitted since the window started. */
  calls: number;
  /** When the window ends. */
  expiresAt: number;
};

const counters = new Map<string, Counter>();

/**
 * Admits a call, or refuses it.
 *
 * The call is counted in the same step as the check, so two calls that
 * arrive together cannot both pass a check that has not been counted yet.
 */
export function admit(key: string, limit: Limit): Admission {
  const now = Date.now();
  const existing = counters.get(key);

  // A window that has run out starts again with this call.
  if (!existing || now >= existing.expiresAt) {
    makeRoom();
    counters.set(key, { calls: 1, expiresAt: now + limit.windowMs });
    return { allowed: true };
  }

  if (existing.calls >= limit.max) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.expiresAt - now) / 1000)),
    };
  }

  existing.calls += 1;
  return { allowed: true };
}

/**
 * Makes room for a new counter.
 *
 * The counters whose window has run out go first — they protect nobody. If
 * the map is still full, the oldest counter goes: a household that has not
 * called for a while has a quota nobody is spending, and refusing the new
 * key instead would refuse a household that has done nothing wrong.
 */
function makeRoom(): void {
  const now = Date.now();

  for (const [key, counter] of counters) {
    if (now >= counter.expiresAt) {
      counters.delete(key);
    }
  }

  while (counters.size >= MAX_KEYS) {
    let oldestKey: string | null = null;
    let oldest = Number.POSITIVE_INFINITY;

    for (const [key, counter] of counters) {
      if (counter.expiresAt < oldest) {
        oldest = counter.expiresAt;
        oldestKey = key;
      }
    }

    if (oldestKey === null) {
      return;
    }

    counters.delete(oldestKey);
  }
}
