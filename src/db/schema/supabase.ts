import { pgSchema, uuid } from "drizzle-orm/pg-core";

/**
 * GoTrue's users table.
 *
 * It is declared here, and only here, so that the foreign keys that point at
 * a Supabase Auth user have a column to point at. GoTrue owns the table on
 * the instance; the migration creates a stub with the same id column on a
 * plain PostgreSQL, so the schema is the same in every environment.
 */
export const authUsers = pgSchema("auth").table("users", {
  id: uuid("id").primaryKey().defaultRandom(),
});
