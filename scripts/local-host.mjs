/**
 * The hosts the repository treats as local.
 *
 * An allowlist, not a denylist. This project's production database is a Neon
 * host (ep-....aws.neon.tech), and no "prod" or "prd" substring would ever
 * catch it - the runner would migrate production and call it a day. So the
 * rule is the other way round: only a host that is provably local counts,
 * and every other host is refused unless the operator opts in.
 *
 * It was the migration runner's rule alone. The check at the door
 * (scripts/assert-connection-role.mjs) needs the same notion of "local" - a
 * privileged connection is allowed against a development database and refused
 * against a deployment - so the rule lives here and both use it.
 */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

export function isDevelopmentHost(host) {
  const name = host.toLowerCase();
  // A Unix socket is a path on this machine, so it is local by definition.
  if (name.startsWith('/')) {
    return true;
  }
  return LOCAL_HOSTS.has(name) || name.endsWith('.local') || name.endsWith('.localhost');
}
