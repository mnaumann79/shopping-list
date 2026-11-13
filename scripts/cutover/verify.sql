-- The verification queries the cutover ends with.
--
-- A restore that puts the rows back without checking the mapping proves
-- nothing about the mapping. These queries are what prove it: every
-- household id resolves to a household, every identity resolves to a GoTrue
-- user, and every table holds what it held before.
--
-- Each row is a count that must be zero, or a count that must match the
-- source. `scripts/cutover/rehearse.mjs` reads them and fails on any
-- mismatch.

-- Every household id resolves to a household.
SELECT 'items.orphans' AS check, count(*) FROM items i
  WHERE i.household_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM households h WHERE h.id = i.household_id)
UNION ALL
SELECT 'categories.orphans', count(*) FROM categories c
  WHERE c.household_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM households h WHERE h.id = c.household_id)
UNION ALL
SELECT 'stores.orphans', count(*) FROM stores s
  WHERE s.household_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM households h WHERE h.id = s.household_id)
UNION ALL
SELECT 'household_join_links.orphans', count(*) FROM household_join_links l
  WHERE l.household_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM households h WHERE h.id = l.household_id);

-- Every identity resolves to a GoTrue user.
SELECT 'items.identity_orphans' AS check, count(*) FROM items i
  WHERE i.created_by_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = i.created_by_id)
UNION ALL
SELECT 'household_join_links.identity_orphans', count(*) FROM household_join_links l
  WHERE l.created_by_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = l.created_by_id)
UNION ALL
SELECT 'household_members.identity_orphans', count(*) FROM household_members m
  WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = m.user_id);

-- Every membership resolves to a household, and every household has at least
-- one member: a household nobody is a member of is a household nobody can see.
SELECT 'household_members.orphans' AS check, count(*) FROM household_members m
  WHERE NOT EXISTS (SELECT 1 FROM households h WHERE h.id = m.household_id)
UNION ALL
SELECT 'households.without_members', count(*) FROM households h
  WHERE NOT EXISTS (SELECT 1 FROM household_members m WHERE m.household_id = h.id);

-- The row counts, table by table. The rehearsal compares these with the
-- source's counts.
SELECT 'items.count' AS check, count(*) FROM items
UNION ALL SELECT 'categories.count', count(*) FROM categories
UNION ALL SELECT 'stores.count', count(*) FROM stores
UNION ALL SELECT 'household_join_links.count', count(*) FROM household_join_links
UNION ALL SELECT 'item_stores.count', count(*) FROM item_stores
UNION ALL SELECT 'households.count', count(*) FROM households
UNION ALL SELECT 'household_members.count', count(*) FROM household_members
UNION ALL SELECT 'user.count', count(*) FROM "user";
