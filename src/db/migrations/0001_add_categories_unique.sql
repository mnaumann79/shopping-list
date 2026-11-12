-- The unique constraint on (organization_id, name) that the Drizzle schema
-- declares for categories. Drizzle names it categories_organization_id_name_unique;
-- db/init.sql used to call it categories_org_name_unique, which is the drift
-- this file reconciles.
--
-- Written to be safe on a database that was bootstrapped from db/init.sql:
-- the constraint is renamed when it is there under the old name, added when
-- it is missing, and left alone when it is already in place. A database that
-- has both names ends up with the canonical one only.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'categories_organization_id_name_unique'
      AND conrelid = 'categories'::regclass
  ) THEN
    IF EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'categories_org_name_unique'
        AND conrelid = 'categories'::regclass
    ) THEN
      EXECUTE 'ALTER TABLE categories DROP CONSTRAINT categories_org_name_unique';
    END IF;
  ELSIF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'categories_org_name_unique'
      AND conrelid = 'categories'::regclass
  ) THEN
    EXECUTE 'ALTER TABLE categories RENAME CONSTRAINT categories_org_name_unique TO categories_organization_id_name_unique';
  ELSE
    ALTER TABLE categories ADD CONSTRAINT categories_organization_id_name_unique UNIQUE ("organization_id", "name");
  END IF;
END $$;
