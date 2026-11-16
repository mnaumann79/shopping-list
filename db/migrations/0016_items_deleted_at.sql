-- A tombstone is its own column.
--
-- The delete and the "clear completed" were two names for one mechanism.
-- `DELETE /api/items/[id]` set `is_active = false`, and the History page
-- listed the rows that carry an `archived_at` - so a deleted item was gone
-- from the list and gone from the History, and a cleared item was in the
-- History and could be brought back. The one that should have been
-- recoverable was not, and the one that was recoverable was not a delete
-- (defect B-11).
--
-- `deleted_at` is the tombstone: NULL is a live item, a timestamp is a
-- deleted one. `archived_at` keeps its own meaning - the item was cleared
-- and can be brought back - and the two are orthogonal
-- (docs/project.md §9.1).
--
-- The column is a `timestamp` without a time zone because every other time
-- column on this table is one, and a table that holds both would have two
-- different instants for "now" (docs/project.md §9.1, "One meaning of now
-- per table"). The sync model's migration converts the four of them
-- together, and converts this one with them.
--
-- `is_active` is left in place and unused. It is not kept in step with
-- `deleted_at`, and no trigger keeps them in step either: a dual write is an
-- obligation with no mechanism to enforce it, and it rots. The column is
-- dropped in a later migration (docs/project.md §9.1). Until the service
-- half stops reading it, nothing here changes what the application sees.
--
-- The backfill gives the rows the old flag marked as deleted a tombstone,
-- so a delete that happened before this migration is recoverable in the same
-- way a delete that happens after it is. It is idempotent: the
-- `deleted_at IS NULL` keeps a second run from re-stamping a legacy
-- tombstone with the moment the migration ran, which would silently move
-- the moment of every historical deletion to the day the migration was
-- re-run (docs/project.md §9.4).
--
-- The index is the one the live-item query uses: a household's items that
-- are not tombstones. The items table had no index at all before this.
ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp;

UPDATE "items" SET "deleted_at" = now() WHERE "is_active" = false AND "deleted_at" IS NULL;

CREATE INDEX IF NOT EXISTS "items_active_household" ON "items" ("household_id") WHERE "deleted_at" IS NULL;
