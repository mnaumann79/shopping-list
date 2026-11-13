#!/usr/bin/env node
/**
 * The check at the door.
 *
 * The application connects as whatever DATABASE_URL names. If that role is a
 * superuser, has BYPASSRLS, or owns a table in public, the row-level
 * security policies are not enforced at all: the connection sees every
 * household's rows, and the isolation is the application layer alone - the
 * one layer a bug can get past.
 *
 * This script connects with the same DATABASE_URL the application uses, asks
 * the assertions in scripts/app-role.sql whether the role it authenticated as
 * is fit to be the application's role, and refuses to serve when it is not.
 *
 *   node scripts/assert-connection-role.mjs
 *
 * The assertions are not written twice: scripts/app-role.sql holds them, and
 * this script runs that file against the role the connection authenticated
 * as. The role named `app` is what the file asserts by default.
 *
 * A privileged role against a host the repository cannot prove is local ends
 * the process: a deployment that serves every household's rows to every
 * session is worse than one that does not start. The same finding against a
 * local host is reported and the process continues - the local stack's own
 * postgres is a superuser, and the developer asked for it.
 */
import { readFile } from "node:fs/promises";
import pg from "pg";
import { isDevelopmentHost } from "./local-host.mjs";

const { Client } = pg;

// The SQLSTATE the assertions raise when the role is privileged. It is what
// tells the two findings apart: a privileged role is the case the local-host
// rule decides, and everything else refuses.
const PRIVILEGED = "PRIV1";

// The advice the role finding gives. A finding about the connection itself
// gives advice about the connection instead, so this is the default rather
// than the rule.
const ROLE_ADVICE =
  "Set DATABASE_URL to the non-owner role the migrations create (`app`), or to a\n" +
  "role with the same privileges.";

/**
 * What the findings mean for the operator.
 *
 * The refusal says what was found and what it costs, because a deployment
 * that refuses to start is only useful if the operator can see why.
 */
function refuse(message, cost, advice = ROLE_ADVICE) {
  console.error(`Refusing to serve: ${message}.`);
  if (cost) {
    console.error(cost);
  }
  console.error(advice);
  return 1;
}

/**
 * Whether this is a deployment rather than a developer's machine.
 *
 * The host decides it when there is one, and the host is what decides the
 * case that matters: the pooler's host is not a development host, so a
 * deployment that cannot reach it refuses to serve whatever NODE_ENV says.
 *
 * With no DATABASE_URL there is no host to read, so the environment decides
 * instead - the deployment runs with NODE_ENV=production, which the cutover
 * checklist tells the operator to override for the install alone, and a
 * developer's machine does not. This is the corner case: the shell that runs
 * `pnpm start` need not carry NODE_ENV, because Next.js sets it when it
 * starts and this check runs before that, so a deployment whose environment
 * does not set it gets a warning here rather than a refusal.
 */
function isDeployment(host) {
  if (host === undefined) {
    return process.env.NODE_ENV === "production";
  }
  return !isDevelopmentHost(host);
}

function report(error, host) {
  if (error.code !== PRIVILEGED) {
    // The role cannot do the application's work: the policies would fail at
    // runtime, on every request that touches a protected row.
    return refuse(
      error.message,
      "The application needs a role that can execute auth.uid() and that holds the\n" +
        "privileges on its own tables. Without them the row-level security\n" +
        "policies fail at runtime.",
    );
  }

  if (isDevelopmentHost(host)) {
    console.log(`${error.message}.`);
    console.log(
      `The host "${host}" is local, so the application starts: a development\n` +
        "database is allowed to be privileged, and the local stack's own postgres is\n" +
        "a superuser. A deployment is not local, and against one this check\n" +
        "refuses to serve.",
    );
    return 0;
  }

  return refuse(
    error.message,
    "A superuser, a role with BYPASSRLS, and the owner of a table all bypass the\n" +
      "row-level security policies. The household isolation is not being enforced\n" +
      "by the database: this connection sees every household's rows.",
  );
}

async function main() {
  const connectionString = process.env.DATABASE_URL?.trim();

  if (!connectionString) {
    if (isDeployment()) {
      // Against a deployment the variable is not optional: there is no role
      // to check, and every request that needs the database fails.
      return refuse(
        "DATABASE_URL is not set",
        "A deployment needs it: the connection role cannot be checked without it,\n" +
          "and every request that needs the database fails without it.",
        "Set DATABASE_URL to the non-owner role the migrations create (`app`), and to a\n" +
          "reachable instance.",
      );
    }
    // The application builds its client lazily, so a missing DATABASE_URL is
    // a request-time error on a developer's machine. The check does not change
    // that: there is no role to look at.
    console.warn(
      "DATABASE_URL is not set: the connection role cannot be checked. The\n" +
        "application will fail on the first request that needs the database.",
    );
    return 0;
  }

  const client = new Client({ connectionString, connectionTimeoutMillis: 10_000 });

  try {
    await client.connect();
  } catch (error) {
    if (isDeployment(client.connectionParameters.host)) {
      // Against a deployment, a database it cannot reach is the same shape of
      // harm as a privileged role: the process would start, the health check
      // would pass, and every request would fail.
      return refuse(
        `the database could not be reached: ${error.message}`,
        "A deployment that cannot reach its database serves nothing, and it fails\n" +
          "on every request instead of on start.",
        "Check that DATABASE_URL names a reachable database, and that\n" +
          "NODE_EXTRA_CA_CERTS points at Supabase's root certificate: the pooler's\n" +
          "certificate chains to it, and without it the connection is refused with\n" +
          '"self-signed certificate in certificate chain".',
      );
    }
    // The database is unreachable, so nothing is served against it either
    // way. The application reports the connection itself, on the first
    // request that needs it.
    console.warn(
      `The database could not be reached, so the connection role cannot be\nchecked: ${error.message}`,
    );
    return 0;
  }

  try {
    const host = client.connectionParameters.host;
    const { rows } = await client.query("SELECT current_user AS role");
    const role = rows[0].role;

    // The subject of the assertions: the role this connection authenticated
    // as. The same file asserts the role named `app` by default.
    await client.query("SELECT set_config('shopping_list.role', $1, false)", [role]);

    const assertions = await readFile(new URL("./app-role.sql", import.meta.url), "utf8");

    try {
      await client.query(assertions);
    } catch (error) {
      return report(error, host);
    }

    console.log(
      `The connection role "${role}" is fit to be the application's role: the\n` +
        "row-level security policies apply to it.",
    );
    return 0;
  } finally {
    await client.end();
  }
}

process.exitCode = await main();
