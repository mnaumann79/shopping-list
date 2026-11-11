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

export const db = buildDb();
