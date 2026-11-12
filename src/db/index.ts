import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import { drizzle as drizzleNode } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

// Pick the driver explicitly via DB_DRIVER:
//   - "node-postgres"  → use the local `pg` driver (regular Postgres over TCP)
//   - anything else    → use @neondatabase/serverless (Neon HTTP/WebSocket)
//
// Production and Vercel deployments leave DB_DRIVER unset and use Neon.
// The perf-audit CI workflow sets DB_DRIVER=node-postgres so it can
// talk to the local Postgres service container.
function buildDb() {
  const driver = process.env.DB_DRIVER ?? "neon-http";
  if (driver === "node-postgres") {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL! });
    return drizzleNode(pool, { schema });
  }
  const sql = neon(process.env.DATABASE_URL!);
  return drizzleNeon(sql, { schema });
}

type Db = ReturnType<typeof buildDb>;

// The client is built on first use, not at import time. `next build` imports
// every route module, so building it eagerly would make a production build
// depend on a live database — and crash it outright when DATABASE_URL is unset.
let client: Db | undefined;

// Both drivers need a connection string at hand. `neon()` refuses to build a
// client without one, and `pg` would silently fall back to the ambient PG*
// variables — which is how a missing DATABASE_URL used to turn into a
// confusing "no such host" at query time instead of a clear error.
function assertDatabaseUrl() {
  const url = process.env.DATABASE_URL;

  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Set it to a PostgreSQL connection string, e.g. postgresql://user:password@host/dbname."
    );
  }

  if (!url.startsWith("postgres://") && !url.startsWith("postgresql://")) {
    throw new Error(
      "DATABASE_URL is not a PostgreSQL connection string. It must start with postgres:// or postgresql://."
    );
  }
}

function getClient(): Db {
  if (!client) {
    assertDatabaseUrl();
    client = buildDb();
  }
  return client;
}

// `db` keeps the type it always had — the proxy only defers *when* the client
// is built, not what it is — so every `db.select()` / `db.insert()` call site
// keeps working unchanged. A missing DATABASE_URL now surfaces as a
// request-time error instead of a crash while the module is being imported.
export const db: Db = new Proxy({} as Db, {
  get(_target, property) {
    const instance = getClient();
    const value = Reflect.get(instance, property, instance);
    return typeof value === "function" ? value.bind(instance) : value;
  },
});
