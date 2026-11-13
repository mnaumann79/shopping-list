import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

// One driver, one connection path: the standard `pg` driver, straight to the
// instance's PostgreSQL. There is nothing to switch — ADR-16 retires the Neon
// HTTP driver and the DB_DRIVER switch with it.
//
// The pool is the only pooling layer. It is capped, because the instance is
// shared with another application and the app's share of the connection
// budget has to be bounded rather than left to the driver's default.
function buildDb() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL!,
    max: 10,
  });
  return drizzle(pool, { schema });
}

type Db = ReturnType<typeof buildDb>;

// The client is built on first use, not at import time. `next build` imports
// every route module, so building it eagerly would make a production build
// depend on a live database — and crash it outright when DATABASE_URL is unset.
let client: Db | undefined;

// The driver needs a connection string at hand. `pg` would silently fall back
// to the ambient PG* variables — which is how a missing DATABASE_URL used to
// turn into a confusing "no such host" at query time instead of a clear
// error.
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
