-- The archived_at column the Drizzle schema declares for items.
--
-- IF NOT EXISTS so the file can also be applied to a database that already
-- has the column - db/init.sql has carried it since before this file
-- existed, and a database bootstrapped from that file must not fail here.

ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "archived_at" timestamp;
