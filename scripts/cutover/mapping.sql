-- §13.2b — the identity mapping.
--
-- Two kinds of legacy id become uuids: the households (Better Auth's
-- `organization` rows) and the users (Better Auth's `user` rows). A Better
-- Auth id is a string and the new columns are uuids, so the ids have to be
-- replaced before the columns can be cast. This file does it in that order:
-- build the mappings, create the new rows, rename the columns, replace the
-- ids through the mappings, and cast last.
--
-- The mappings are supplied, not derived here: the households get fresh
-- uuids, and at the cutover the users' uuids are the ones GoTrue issued when
-- the accounts were provisioned (cutover step 2). The rehearsal issues its
-- own, because it may not write to GoTrue's table. Either way,
-- `scripts/cutover/rehearse.mjs` fills the two placeholders.

BEGIN;

CREATE TEMP TABLE user_map (old_id text PRIMARY KEY, new_id uuid NOT NULL);
CREATE TEMP TABLE organization_map (old_id text PRIMARY KEY, new_id uuid NOT NULL);

INSERT INTO user_map (old_id, new_id) VALUES
__USER_MAP_VALUES__;

INSERT INTO organization_map (old_id, new_id) VALUES
__ORGANIZATION_MAP_VALUES__;

-- 1. The households. A legacy `organization` row becomes a household with a
--    fresh uuid. The legacy table has no creator, so the household's creator
--    is the member who owned it.
INSERT INTO households (id, name, created_by)
SELECT m.new_id,
       o.name,
       owner.new_id
  FROM organization o
  JOIN organization_map m ON m.old_id = o.id
  JOIN LATERAL (
       SELECT u.new_id
         FROM member mem
         JOIN user_map u ON u.old_id = mem.user_id
        WHERE mem.organization_id = o.id
        ORDER BY CASE mem.role WHEN 'owner' THEN 0 ELSE 1 END, mem.created_at
        LIMIT 1
  ) owner ON true;

-- 2. The memberships.
INSERT INTO household_members (household_id, user_id, role, created_at)
SELECT om.new_id, um.new_id, mem.role, mem.created_at
  FROM member mem
  JOIN organization_map om ON om.old_id = mem.organization_id
  JOIN user_map um ON um.old_id = mem.user_id;

-- 3. The legacy foreign keys point at Better Auth's tables: the household
--    columns at `organization`, the identity columns at `user`. Once the
--    columns hold uuids, those constraints point at the wrong table with the
--    wrong kind of id — a uuid in a column whose constraint still expects a
--    text organization id — and the update below fails on the constraint
--    rather than on the cast. The new foreign keys (to `households` and to
--    `auth.users`) are added by the rename migration, which owns the schema.
ALTER TABLE items DROP CONSTRAINT items_organization_id_organization_id_fk;
ALTER TABLE categories DROP CONSTRAINT categories_organization_id_organization_id_fk;
ALTER TABLE stores DROP CONSTRAINT stores_organization_id_organization_id_fk;
ALTER TABLE household_join_links DROP CONSTRAINT household_join_links_organization_id_organization_id_fk;
ALTER TABLE items DROP CONSTRAINT items_created_by_id_user_id_fk;
ALTER TABLE household_join_links DROP CONSTRAINT household_join_links_created_by_id_user_id_fk;

-- 4. Rename the columns, so the updates below read the new name.
ALTER TABLE items RENAME COLUMN organization_id TO household_id;
ALTER TABLE categories RENAME COLUMN organization_id TO household_id;
ALTER TABLE stores RENAME COLUMN organization_id TO household_id;
ALTER TABLE household_join_links RENAME COLUMN organization_id TO household_id;

-- 5. The household ids, replaced through the mapping.
UPDATE items SET household_id = m.new_id FROM organization_map m WHERE m.old_id = items.household_id;
UPDATE categories SET household_id = m.new_id FROM organization_map m WHERE m.old_id = categories.household_id;
UPDATE stores SET household_id = m.new_id FROM organization_map m WHERE m.old_id = stores.household_id;
UPDATE household_join_links SET household_id = m.new_id FROM organization_map m WHERE m.old_id = household_join_links.household_id;

-- 6. The identity columns, replaced through the user mapping.
UPDATE items SET created_by_id = u.new_id FROM user_map u WHERE u.old_id = items.created_by_id;
UPDATE household_join_links SET created_by_id = u.new_id FROM user_map u WHERE u.old_id = household_join_links.created_by_id;

-- 7. The casts, last. They succeed only because steps 4 and 5 replaced every
--    legacy id with a uuid.
ALTER TABLE items ALTER COLUMN household_id TYPE uuid USING household_id::uuid;
ALTER TABLE categories ALTER COLUMN household_id TYPE uuid USING household_id::uuid;
ALTER TABLE stores ALTER COLUMN household_id TYPE uuid USING household_id::uuid;
ALTER TABLE household_join_links ALTER COLUMN household_id TYPE uuid USING household_id::uuid;
ALTER TABLE items ALTER COLUMN created_by_id TYPE uuid USING created_by_id::uuid;
ALTER TABLE household_join_links ALTER COLUMN created_by_id TYPE uuid USING created_by_id::uuid;

-- 8. The invitations. A pending invitation is a person waiting to join, and
--    the household's list of invitations is where that person is. An accepted
--    invitation is already a membership — the `member` row of step 2 — and a
--    rejected or cancelled one is a refusal that needs nothing carried.
--
--    The role carries over unchanged: the legacy column is nullable, so it is
--    `coalesce`d to 'member', and the two vocabularies are the same three
--    ('owner', 'admin', 'member' — §12.5's and the CHECK constraint's).
--
--    The token is minted fresh. The legacy table has no token column, so
--    there is nothing to carry, and the new one is not null and unique: the
--    same shape the application issues, 32 random bytes hex-encoded — two
--    version 4 uuids, which is what the core has to offer. The consequence
--    is written down in §13.2b: a carried invitation keeps the person
--    pending in the household's list, but the link in the old email does
--    not work — the token is the new one, and the invitation can be sent
--    again.
--
--    An invitation whose inviter is not in the mapping has no `invited_by` to
--    point at, so it is skipped. It is counted, not carried.
INSERT INTO household_invitations (household_id, email, role, token, invited_by, expires_at, accepted_at, revoked_at, created_at)
SELECT om.new_id,
       i.email,
       coalesce(i.role, 'member'),
       replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
       um.new_id,
       i.expires_at,
       NULL,
       NULL,
       i.created_at
  FROM invitation i
  JOIN organization_map om ON om.old_id = i.organization_id
  JOIN user_map um ON um.old_id = i.inviter_id
 WHERE i.status = 'pending';

COMMIT;

-- The invitations, counted: how many were pending in the legacy table, how
-- many were carried over, and how many were skipped. The three numbers are
-- what the rehearsal's check compares, and what the person performing the
-- cutover reads — a skipped invitation is a person who is not waiting in the
-- household any more.
DO $$
DECLARE
  pending bigint;
  carried bigint;
BEGIN
  SELECT count(*) INTO pending FROM invitation WHERE status = 'pending';
  SELECT count(*) INTO carried FROM household_invitations;
  RAISE NOTICE 'invitations: % pending, % carried, % skipped', pending, carried, pending - carried;
END $$;
