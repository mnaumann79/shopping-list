-- Rename organization_id to household_id, and retype the identity columns.
--
-- Section 9.1a: the household is the tenant, and both the household id and the
-- user id are uuid. The column that carried Better Auth's organization id is
-- renamed and retyped, and the columns that carried Better Auth's user ids
-- point at auth.users(id) instead of the legacy user table.
--
-- The rename and the retype are additive and reversible: ALTER ... RENAME,
-- ALTER ... TYPE ... USING. No table is dropped, no column is dropped and
-- re-added.
--
-- The conversion is a mapping, not a cast. Better Auth's ids are 32-character
-- strings, so organization_id::uuid would fail on every row. The cutover's
-- identity mapping (section 13.2b) turns them into uuids, and it runs first;
-- this migration stops with a message that says so rather than failing on a
-- cast.
--
-- The file is written to be safe on a database that was bootstrapped from
-- db/init.sql: every step checks whether it has already happened.

-- The auth schema and GoTrue's users table.
--
-- On the Supabase instance GoTrue owns both, and this statement does nothing.
-- On a plain PostgreSQL it creates the smallest table the foreign keys below
-- can point at, so that the schema is the same in every environment.
--
-- The whole block is skipped where the schema already exists, and that is not
-- only a convenience: on the instance the auth schema belongs to
-- supabase_admin, and the postgres role has USAGE on it but not CREATE. A
-- "CREATE TABLE IF NOT EXISTS" would still be refused - the privilege check
-- comes before the check for the table - with "permission denied for schema
-- auth", on an instance that already has everything it needs.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'auth') THEN
    CREATE SCHEMA "auth";
    CREATE TABLE "auth"."users" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL
    );
  END IF;
END $$;

-- The rename and the retype, for every table that carries a household id.
--
-- The old foreign key has to go before the column can change type: Postgres
-- will not cast a column that a foreign key depends on. The new one goes on
-- afterwards, pointing at the household table instead of Better Auth's
-- organization table.
DO $$
DECLARE
  v record;
  column_type text;
  legacy_rows bigint;
BEGIN
  FOR v IN
    SELECT * FROM (VALUES
      ('items'::text, 'items_organization_id_organization_id_fk'::text, 'items_household_id_households_id_fk'::text),
      ('categories', 'categories_organization_id_organization_id_fk', 'categories_household_id_households_id_fk'),
      ('stores', 'stores_organization_id_organization_id_fk', 'stores_household_id_households_id_fk'),
      ('household_join_links', 'household_join_links_organization_id_organization_id_fk', 'household_join_links_household_id_households_id_fk')
    ) AS x(tbl, legacy_fk, new_fk)
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = v.tbl AND column_name = 'organization_id'
    ) THEN
      EXECUTE format('ALTER TABLE %I RENAME COLUMN organization_id TO household_id', v.tbl);
    END IF;

    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = v.legacy_fk) THEN
      EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I', v.tbl, v.legacy_fk);
    END IF;

    SELECT format_type(a.atttypid, a.atttypmod) INTO column_type
      FROM pg_attribute a
      JOIN pg_class c ON c.oid = a.attrelid
     WHERE c.relname = v.tbl AND a.attname = 'household_id' AND a.attnum > 0 AND NOT a.attisdropped;

    IF column_type IS DISTINCT FROM 'uuid' THEN
      EXECUTE format(
        'SELECT count(*) FROM %I WHERE household_id IS NOT NULL AND household_id !~ %L',
        v.tbl, '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      ) INTO legacy_rows;
      IF legacy_rows > 0 THEN
        RAISE EXCEPTION
          '%.household_id holds % values that are not uuids. The cutover maps them first (§13.2b, §9.1a); this migration stops here rather than casting a text id into a uuid.',
          v.tbl, legacy_rows;
      END IF;
      EXECUTE format('ALTER TABLE %I ALTER COLUMN household_id TYPE uuid USING household_id::uuid', v.tbl);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = v.new_fk) THEN
      EXECUTE format(
        'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (household_id) REFERENCES "households"("id") ON DELETE cascade ON UPDATE no action',
        v.tbl, v.new_fk
      );
    END IF;
  END LOOP;
END $$;

-- The identity columns: the same retype, for the user ids.
--
-- items.created_by_id is nullable and set to null when the user is deleted;
-- household_join_links.created_by_id is not null and blocks the deletion.
DO $$
DECLARE
  v record;
  column_type text;
  legacy_rows bigint;
BEGIN
  FOR v IN
    SELECT * FROM (VALUES
      ('items'::text, 'items_created_by_id_user_id_fk'::text, 'items_created_by_id_users_id_fk'::text, 'set null'::text),
      ('household_join_links', 'household_join_links_created_by_id_user_id_fk', 'household_join_links_created_by_id_users_id_fk', 'no action')
    ) AS x(tbl, legacy_fk, new_fk, on_delete)
  LOOP
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = v.legacy_fk) THEN
      EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I', v.tbl, v.legacy_fk);
    END IF;

    SELECT format_type(a.atttypid, a.atttypmod) INTO column_type
      FROM pg_attribute a
      JOIN pg_class c ON c.oid = a.attrelid
     WHERE c.relname = v.tbl AND a.attname = 'created_by_id' AND a.attnum > 0 AND NOT a.attisdropped;

    IF column_type IS DISTINCT FROM 'uuid' THEN
      EXECUTE format(
        'SELECT count(*) FROM %I WHERE created_by_id IS NOT NULL AND created_by_id !~ %L',
        v.tbl, '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      ) INTO legacy_rows;
      IF legacy_rows > 0 THEN
        RAISE EXCEPTION
          '%.created_by_id holds % values that are not uuids. The cutover maps them first (§13.2b, §9.1a); this migration stops here rather than casting a text id into a uuid.',
          v.tbl, legacy_rows;
      END IF;
      EXECUTE format('ALTER TABLE %I ALTER COLUMN created_by_id TYPE uuid USING created_by_id::uuid', v.tbl);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = v.new_fk) THEN
      EXECUTE format(
        'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (created_by_id) REFERENCES "auth"."users"("id") ON DELETE %s ON UPDATE no action',
        v.tbl, v.new_fk, v.on_delete
      );
    END IF;
  END LOOP;
END $$;

-- The unique constraint on (household_id, name) keeps its columns - the
-- rename follows the column - but its name said organization_id. The name
-- follows the Drizzle schema, which names it after the column.
--
-- A database that somehow carries both names ends up with the canonical one
-- only.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'categories_organization_id_name_unique'
      AND conrelid = 'categories'::regclass
  ) THEN
    IF EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'categories_household_id_name_unique'
        AND conrelid = 'categories'::regclass
    ) THEN
      ALTER TABLE categories DROP CONSTRAINT categories_organization_id_name_unique;
    ELSE
      ALTER TABLE categories RENAME CONSTRAINT categories_organization_id_name_unique TO categories_household_id_name_unique;
    END IF;
  END IF;
END $$;
