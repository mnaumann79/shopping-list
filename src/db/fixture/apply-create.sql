WITH created AS (
  INSERT INTO items (id, household_id, name, quantity, note, category_id,
                     created_by_id, version, lamport, last_op_id, field_meta)
  VALUES ($entity_id, $household_id, $payload->>'name', $payload->>'quantity',
          $payload->>'note', NULLIF($payload->>'categoryId', '')::uuid,
          $actor_id, 1, $op_lamport, $op_id,
          jsonb_strip_nulls(jsonb_build_object(
            'name',       jsonb_build_object('v', 1, 'lamport', $op_lamport, 'device', $device_id),
            'quantity',   CASE WHEN $payload ? 'quantity'   THEN jsonb_build_object('v', 1, 'lamport', $op_lamport, 'device', $device_id) END,
            'note',       CASE WHEN $payload ? 'note'       THEN jsonb_build_object('v', 1, 'lamport', $op_lamport, 'device', $device_id) END,
            'categoryId', CASE WHEN $payload ? 'categoryId' THEN jsonb_build_object('v', 1, 'lamport', $op_lamport, 'device', $device_id) END,
            'storeIds',   CASE WHEN $payload ? 'storeIds' THEN jsonb_build_object('v', 1, 'lamport', $op_lamport, 'device', $device_id) END
          )))
  ON CONFLICT (id) DO NOTHING
  RETURNING id, household_id, name, quantity, note, category_id,
            is_checked, archived_at, deleted_at, field_meta, version,
            lamport, last_op_id, updated_by_id, updated_at, created_at
),
tags AS (
  INSERT INTO item_stores (item_id, store_id, version, lamport, device_id, deleted_at)
  SELECT c.id, t.store_id::uuid, 1, $op_lamport, $device_id, NULL
    FROM created AS c
    CROSS JOIN LATERAL jsonb_array_elements_text(
                   COALESCE($payload->'storeIds', '[]'::jsonb)) AS t(store_id)
   WHERE t.store_id <> ''
  ON CONFLICT (item_id, store_id) DO NOTHING
  RETURNING item_id, store_id, version
),
tagset AS (
  SELECT COALESCE(
           jsonb_agg(jsonb_build_object('storeId', u.store_id,
                                        'version', u.version,
                                        'present', true)
                     ORDER BY u.store_id),
           '[]'::jsonb) AS ids
    FROM (
      SELECT store_id, version FROM tags
      UNION ALL
      SELECT s.store_id, s.version
        FROM item_stores AS s
       WHERE s.item_id = $entity_id
         AND s.deleted_at IS NULL
         AND s.store_id NOT IN (SELECT store_id FROM tags)
    ) AS u
),
entity_snapshot AS (
  SELECT c.id,
         (c.deleted_at IS NOT NULL) AS deleted,
         jsonb_build_object(
           'id', c.id, 'householdId', c.household_id, 'name', c.name,
           'quantity', c.quantity, 'note', c.note, 'categoryId', c.category_id,
           'isChecked', c.is_checked, 'archivedAt', c.archived_at,
           'deletedAt', c.deleted_at, 'fieldMeta', c.field_meta,
           'version', c.version, 'lamport', c.lamport, 'lastOpId', c.last_op_id,
           'updatedById', c.updated_by_id, 'updatedAt', c.updated_at,
           'createdAt', c.created_at, 'storeIds', ts.ids
         ) AS entity
    FROM created AS c CROSS JOIN tagset AS ts
),
logged AS (
  INSERT INTO sync_changes (household_id, entity_type, entity_id, op_id,
                             version, lamport, device_id, actor_id, payload, deleted)
  SELECT $household_id, $entity_type, e.id, $op_id, (e.entity->>'version')::int,
         $op_lamport, $device_id, $actor_id, e.entity, e.deleted
    FROM entity_snapshot AS e
  RETURNING seq
)
SELECT e.id AS entity_id,
       TRUE AS changed,
       e.entity,
       '[]'::jsonb AS conflicts
  FROM entity_snapshot AS e;
