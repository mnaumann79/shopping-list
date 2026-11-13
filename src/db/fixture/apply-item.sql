WITH before AS (
  SELECT * FROM items
   WHERE id = $entity_id
     AND household_id = $household_id
     AND version = $cas_version
),
pairs AS (
  SELECT t."storeId" AS store_id, t.version AS base_version, t.present
    FROM jsonb_to_recordset(COALESCE($payload->'storeIds', '[]'::jsonb))
         AS t("storeId" uuid, version integer, present boolean)
   WHERE t."storeId" IS NOT NULL
),
cur AS (
  SELECT s.store_id, s.version, s.lamport, s.device_id, s.deleted_at
    FROM item_stores AS s
   WHERE s.item_id = $entity_id
     AND s.store_id IN (SELECT store_id FROM pairs)
),
decide AS (
  SELECT p.store_id, p.base_version, p.present,
         c.version AS cur_version, c.lamport AS cur_lamport,
         c.device_id AS cur_device,
         (c.deleted_at IS NOT NULL) AS cur_absent,
         (c.store_id IS NOT NULL AND p.base_version IS DISTINCT FROM c.version) AS concurrent,
         CASE
           WHEN b.deleted_at IS NOT NULL          THEN false
           WHEN c.store_id IS NULL                 THEN p.present
           WHEN p.base_version = c.version         THEN ($op_lamport, $device_id::text) > (c.lamport, c.device_id::text)
           ELSE NOT p.present
         END AS client_wins
    FROM pairs AS p
    CROSS JOIN before AS b
    LEFT JOIN cur AS c ON c.store_id = p.store_id
),
check_wins AS (
  -- Check-wins, stated once (§11): the uncheck applies iff the operation's
  -- base version already included the check. Every gate that depends on the
  -- uncheck actually winning reads this one comparison.
  SELECT b.*,
         ($op_base_version >= COALESCE((b.field_meta->'isChecked')->>'v','0')::int) AS uncheck_applies
    FROM before AS b
),
wins AS (
  SELECT
    (b.deleted_at IS NULL)                                                         AS row_writable,
    ('name' = ANY($fields) AND b.deleted_at IS NULL
      AND ($op_type = 'item.override'
        OR ($op_type = 'item.update'
            AND ($op_lamport, $device_id::text) >
                (COALESCE((b.field_meta->'name')->>'lamport','0')::bigint,
                 COALESCE((b.field_meta->'name')->>'device','')))))                AS w_name,
    ('quantity' = ANY($fields) AND b.deleted_at IS NULL
      AND ($op_type = 'item.override'
        OR ($op_type = 'item.update'
            AND ($op_lamport, $device_id::text) >
                (COALESCE((b.field_meta->'quantity')->>'lamport','0')::bigint,
                 COALESCE((b.field_meta->'quantity')->>'device','')))))            AS w_quantity,
    ('note' = ANY($fields) AND b.deleted_at IS NULL
      AND ($op_type = 'item.override'
        OR ($op_type = 'item.update'
            AND ($op_lamport, $device_id::text) >
                (COALESCE((b.field_meta->'note')->>'lamport','0')::bigint,
                 COALESCE((b.field_meta->'note')->>'device','')))))                AS w_note,
    ('categoryId' = ANY($fields) AND b.deleted_at IS NULL
      AND ($op_type = 'item.override'
        OR ($op_type = 'item.update'
            AND ($op_lamport, $device_id::text) >
                (COALESCE((b.field_meta->'categoryId')->>'lamport','0')::bigint,
                 COALESCE((b.field_meta->'categoryId')->>'device','')))))          AS w_category,
    (('isChecked' = ANY($fields) AND $op_type = 'item.override' AND b.deleted_at IS NULL)
      OR ($op_type = 'item.check' AND b.deleted_at IS NULL
          AND b.uncheck_applies))                                                  AS w_is_checked,
    ($op_type IN ('item.archive','item.bulkArchive') AND b.deleted_at IS NULL
      AND b.is_checked)                                                            AS w_archived,
    ($op_type IN ('item.unarchive','item.bulkUnarchive') AND b.deleted_at IS NULL) AS w_unarchived,
    ($op_type = 'item.delete' AND b.deleted_at IS NULL)                           AS w_deleted,
    ($op_type = 'item.undelete' AND b.deleted_at IS NOT NULL
      AND COALESCE((b.field_meta->'deletedAt')->>'lamport','0')::bigint <= $op_lamport)
                                                                                  AS w_undeleted,
    ($op_type = 'item.storeTags' AND b.deleted_at IS NULL
      AND EXISTS (SELECT 1 FROM decide AS d WHERE d.client_wins))                AS w_store_ids,
    -- The archive is reversed only by an uncheck that WINS. A stale uncheck
    -- loses to check-wins, and then the item is still checked: the archive's
    -- premise still holds, so reversing it would be wrong (§11).
    ($op_type = 'item.check' AND b.deleted_at IS NULL
      AND b.uncheck_applies
      AND NOT ($payload->>'isChecked')::boolean
      AND b.archived_at IS NOT NULL)                                              AS w_reverses_archive
  FROM check_wins AS b
),
flags AS (
  SELECT w.*,
         (w.w_name OR w.w_quantity OR w.w_note OR w.w_category OR w.w_is_checked
          OR w.w_archived OR w.w_unarchived OR w.w_deleted OR w.w_undeleted
          OR w.w_store_ids OR w.w_reverses_archive) AS row_changed
    FROM wins AS w
),
applied AS (
  UPDATE items AS t
     SET version       = t.version + CASE WHEN w.row_changed THEN 1 ELSE 0 END,
         name          = CASE WHEN w.w_name        THEN $payload->>'name'       ELSE t.name END,
         quantity      = CASE WHEN w.w_quantity    THEN $payload->>'quantity'   ELSE t.quantity END,
         note          = CASE WHEN w.w_note        THEN $payload->>'note'       ELSE t.note END,
         category_id   = CASE WHEN w.w_category    THEN ($payload->>'categoryId')::uuid ELSE t.category_id END,
         is_checked    = CASE WHEN w.w_is_checked  THEN ($payload->>'isChecked')::boolean ELSE t.is_checked END,
         archived_at   = CASE WHEN w.w_archived    THEN now()
                              WHEN w.w_unarchived  THEN NULL
                              WHEN w.w_reverses_archive THEN NULL
                              ELSE t.archived_at END,
         deleted_at    = CASE WHEN w.w_deleted     THEN now()
                              WHEN w.w_undeleted   THEN NULL
                              ELSE t.deleted_at END,
         field_meta    = t.field_meta || jsonb_strip_nulls(jsonb_build_object(
                           'name',       CASE WHEN w.w_name       THEN jsonb_build_object('v', t.version + CASE WHEN w.row_changed THEN 1 ELSE 0 END, 'lamport', $op_lamport, 'device', $device_id) END,
                           'quantity',   CASE WHEN w.w_quantity   THEN jsonb_build_object('v', t.version + CASE WHEN w.row_changed THEN 1 ELSE 0 END, 'lamport', $op_lamport, 'device', $device_id) END,
                           'note',       CASE WHEN w.w_note       THEN jsonb_build_object('v', t.version + CASE WHEN w.row_changed THEN 1 ELSE 0 END, 'lamport', $op_lamport, 'device', $device_id) END,
                           'categoryId', CASE WHEN w.w_category   THEN jsonb_build_object('v', t.version + CASE WHEN w.row_changed THEN 1 ELSE 0 END, 'lamport', $op_lamport, 'device', $device_id) END,
                           'isChecked',  CASE WHEN w.w_is_checked THEN jsonb_build_object('v', t.version + CASE WHEN w.row_changed THEN 1 ELSE 0 END, 'lamport', $op_lamport, 'device', $device_id) END,
                           'deletedAt',  CASE WHEN w.w_deleted OR w.w_undeleted
                                             THEN jsonb_build_object('v', t.version + CASE WHEN w.row_changed THEN 1 ELSE 0 END, 'lamport', $op_lamport, 'device', $device_id) END,
                           'archivedAt', CASE WHEN w.w_archived OR w.w_unarchived OR w.w_reverses_archive
                                             THEN jsonb_build_object('v', t.version + CASE WHEN w.row_changed THEN 1 ELSE 0 END, 'lamport', $op_lamport, 'device', $device_id) END,
                           'storeIds',   CASE WHEN w.w_store_ids
                                             THEN jsonb_build_object('v', t.version + CASE WHEN w.row_changed THEN 1 ELSE 0 END, 'lamport', $op_lamport, 'device', $device_id) END
                         )),
         lamport       = CASE WHEN w.row_changed THEN GREATEST(t.lamport, $op_lamport) ELSE t.lamport END,
         last_op_id    = $op_id,
         updated_at    = CASE WHEN w.row_changed THEN now() ELSE t.updated_at END,
         updated_by_id = CASE WHEN w.row_changed THEN $actor_id ELSE t.updated_by_id END
    FROM before AS b, flags AS w
   WHERE t.id = $entity_id
     AND t.household_id = $household_id
     AND t.version = $cas_version
  RETURNING t.id, t.household_id, t.name, t.quantity, t.note, t.category_id,
            t.is_checked, t.archived_at, t.deleted_at, t.field_meta, t.version,
            t.lamport, t.last_op_id, t.updated_by_id, t.updated_at, t.created_at,
            w.row_changed AS changed
),
fields_now AS (
  -- The row's current value per field, and the device that wrote it. Every
  -- conflict record is written from this pre-image (§10.8.4).
  SELECT f.field,
         CASE f.field WHEN 'name'       THEN to_jsonb(b.name)
                      WHEN 'quantity'   THEN to_jsonb(b.quantity)
                      WHEN 'note'       THEN to_jsonb(b.note)
                      WHEN 'categoryId' THEN to_jsonb(b.category_id)
                      WHEN 'isChecked'  THEN to_jsonb(b.is_checked)
                      WHEN 'deletedAt'  THEN to_jsonb(b.deleted_at)
                      WHEN 'archivedAt' THEN to_jsonb(b.archived_at)
                      END AS value,
         NULLIF((b.field_meta -> f.field) ->> 'device', '')::uuid AS device_id,
         COALESCE((b.field_meta -> f.field) ->> 'lamport', '0')::bigint AS lamport
    FROM before AS b, unnest($fields) AS f(field)
),
lost AS (
  SELECT fv.field,
         to_jsonb($payload -> fv.field) AS local_value,
         fv.value AS server_value,
         fv.device_id AS winner_device_id,
         fv.lamport AS winner_lamport
    FROM fields_now AS fv, wins AS w
   WHERE CASE fv.field
           WHEN 'name'       THEN NOT w.w_name
           WHEN 'quantity'   THEN NOT w.w_quantity
           WHEN 'note'       THEN NOT w.w_note
           WHEN 'categoryId' THEN NOT w.w_category
           WHEN 'isChecked'  THEN NOT w.w_is_checked
           WHEN 'deletedAt'  THEN NOT (w.w_deleted OR w.w_undeleted)
           WHEN 'archivedAt' THEN NOT (w.w_archived OR w.w_unarchived)
           ELSE FALSE END
),
conflicts AS (
  INSERT INTO entity_conflicts (household_id, entity_type, entity_id, field,
                                local_value, server_value, store_id, resolution,
                                winner_device_id, winner_lamport, op_id, device_id)
  SELECT $household_id, $entity_type, $entity_id, l.field,
         l.local_value, l.server_value, NULL,
         CASE WHEN $op_type = 'item.override'                        THEN 'override'
              WHEN b.deleted_at IS NOT NULL AND $op_type <> 'item.undelete'
                                                                     THEN 'delete_wins'
              WHEN l.field = 'isChecked'                             THEN 'check_wins'
              WHEN l.field = 'deletedAt'                             THEN 'rejected'
              ELSE 'lww' END,
         CASE WHEN b.deleted_at IS NOT NULL AND $op_type <> 'item.undelete'
              THEN NULLIF((b.field_meta->'deletedAt')->>'device','')::uuid
              ELSE l.winner_device_id END,
         CASE WHEN b.deleted_at IS NOT NULL AND $op_type <> 'item.undelete'
              THEN COALESCE((b.field_meta->'deletedAt')->>'lamport','0')::bigint
              ELSE l.winner_lamport END,
         $op_id, $device_id
    FROM lost AS l, before AS b
   WHERE NOT EXISTS (SELECT 1 FROM sync_operations o WHERE o.op_id = $op_id)
  RETURNING id, field, store_id, local_value, server_value, resolution,
            winner_device_id, winner_lamport, device_id
),
archive_conflicts AS (
  INSERT INTO entity_conflicts (household_id, entity_type, entity_id, field,
                                local_value, server_value, store_id, resolution,
                                winner_device_id, winner_lamport, op_id, device_id)
  SELECT $household_id, $entity_type, $entity_id, 'archivedAt',
         to_jsonb(b.archived_at), to_jsonb(NULL::timestamptz),
         NULL, 'rejected',
         $device_id,
         $op_lamport,
         $op_id,
         NULLIF((b.field_meta -> 'archivedAt') ->> 'device', '')::uuid
    FROM before AS b, wins AS w
   WHERE w.w_reverses_archive
     AND NULLIF((b.field_meta -> 'archivedAt') ->> 'device', '') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM sync_operations o WHERE o.op_id = $op_id)
  RETURNING id, field, store_id, local_value, server_value, resolution,
            winner_device_id, winner_lamport, device_id
),
override_conflicts AS (
  -- An override discards the value it replaced, and the device that wrote
  -- that value has to be told (§11, §11.2) - otherwise its edit vanishes
  -- with no record on its side. The row is addressed to that device, so it
  -- reaches it through the conflict cursor and not through this response.
  INSERT INTO entity_conflicts (household_id, entity_type, entity_id, field,
                                local_value, server_value, store_id, resolution,
                                winner_device_id, winner_lamport, op_id, device_id)
  SELECT $household_id, $entity_type, $entity_id, fv.field,
         fv.value, to_jsonb($payload -> fv.field),
         NULL, 'override',
         $device_id, $op_lamport, $op_id, fv.device_id
    FROM fields_now AS fv, wins AS w
   WHERE $op_type = 'item.override'
     AND fv.device_id IS NOT NULL
     AND fv.device_id <> $device_id
     AND CASE fv.field
           WHEN 'name'       THEN w.w_name
           WHEN 'quantity'   THEN w.w_quantity
           WHEN 'note'       THEN w.w_note
           WHEN 'categoryId' THEN w.w_category
           WHEN 'isChecked'  THEN w.w_is_checked
           ELSE FALSE END
     AND NOT EXISTS (SELECT 1 FROM sync_operations o WHERE o.op_id = $op_id)
  RETURNING id, field, store_id, local_value, server_value, resolution,
            winner_device_id, winner_lamport, device_id
),
tagged AS (
  INSERT INTO item_stores (item_id, store_id, version, lamport, device_id, deleted_at)
  SELECT $entity_id, d.store_id, COALESCE(d.base_version, 0) + 1, $op_lamport, $device_id, NULL
    FROM decide AS d
   WHERE d.client_wins AND d.present
  ON CONFLICT (item_id, store_id) DO UPDATE
    SET version    = item_stores.version + 1,
        lamport    = $op_lamport,
        device_id  = $device_id,
        deleted_at = NULL
   WHERE ($op_lamport, $device_id::text) > (item_stores.lamport, item_stores.device_id::text)
  RETURNING item_id, store_id, version
),
untagged AS (
  UPDATE item_stores AS s
     SET version    = s.version + 1,
         lamport    = $op_lamport,
         device_id  = $device_id,
         deleted_at = now()
    FROM decide AS d
   WHERE s.item_id = $entity_id
     AND s.store_id = d.store_id
     AND d.client_wins AND NOT d.present
  RETURNING s.item_id, s.store_id, s.version
),
store_ids AS (
  SELECT COALESCE(
           jsonb_agg(jsonb_build_object('storeId', u.store_id,
                                        'version', u.version,
                                        'present', u.present)
                     ORDER BY u.store_id),
           '[]'::jsonb) AS ids
    FROM (
      -- The pairs this statement wrote, then every other pair of the item -
      -- the tombstoned ones included, with present: false. A client that
      -- never learns that a tag was removed sends the pre-removal version
      -- back, and the pair then looks concurrent (§11).
      SELECT t.store_id, t.version, true AS present FROM tagged AS t
      UNION
      SELECT n.store_id, n.version, false AS present FROM untagged AS n
      UNION
      SELECT s.store_id, s.version, (s.deleted_at IS NULL) AS present
        FROM item_stores AS s
       WHERE s.item_id = $entity_id
         AND s.store_id NOT IN (SELECT store_id FROM tagged
                                UNION SELECT store_id FROM untagged)
    ) AS u
),
tag_conflicts AS (
  INSERT INTO entity_conflicts (household_id, entity_type, entity_id, field,
                                local_value, server_value, store_id, resolution,
                                winner_device_id, winner_lamport, op_id, device_id)
  SELECT $household_id, $entity_type, $entity_id, 'storeIds',
         jsonb_build_object('storeId', d.store_id, 'present', d.present),
         jsonb_build_object('storeId', d.store_id, 'present', NOT d.cur_absent,
                            'version', COALESCE(d.cur_version, 0)),
         d.store_id,
         CASE WHEN d.concurrent THEN 'removal_wins' ELSE 'lww' END,
         CASE WHEN d.client_wins THEN $device_id ELSE d.cur_device END,
         CASE WHEN d.client_wins THEN $op_lamport ELSE COALESCE(d.cur_lamport, 0) END,
         $op_id,
         CASE WHEN d.client_wins THEN d.cur_device ELSE $device_id END
    FROM decide AS d
   WHERE NOT d.client_wins AND (d.cur_version IS NOT NULL OR d.present)
     AND NOT EXISTS (SELECT 1 FROM sync_operations o WHERE o.op_id = $op_id)
  RETURNING id, field, store_id, local_value, server_value, resolution,
            winner_device_id, winner_lamport, device_id
),
entity_snapshot AS (
  SELECT a.id,
         (a.deleted_at IS NOT NULL) AS deleted,
         a.changed,
         jsonb_build_object(
           'id', a.id, 'householdId', a.household_id, 'name', a.name,
           'quantity', a.quantity, 'note', a.note, 'categoryId', a.category_id,
           'isChecked', a.is_checked, 'archivedAt', a.archived_at,
           'deletedAt', a.deleted_at, 'fieldMeta', a.field_meta,
           'version', a.version, 'lamport', a.lamport, 'lastOpId', a.last_op_id,
           'updatedById', a.updated_by_id, 'updatedAt', a.updated_at,
           'createdAt', a.created_at, 'storeIds', si.ids
         ) AS entity
    FROM applied AS a CROSS JOIN store_ids AS si
),
logged AS (
  INSERT INTO sync_changes (household_id, entity_type, entity_id, op_id,
                             version, lamport, device_id, actor_id, payload, deleted)
  SELECT $household_id, $entity_type, e.id, $op_id, (e.entity->>'version')::int,
         $op_lamport, $device_id, $actor_id, e.entity, e.deleted
    FROM entity_snapshot AS e
   WHERE e.changed
  RETURNING seq
)
SELECT e.id AS entity_id,
       e.changed,
       e.entity,
       COALESCE((
         SELECT jsonb_agg(jsonb_build_object(
                  'id', x.id, 'field', x.field, 'storeId', x.store_id,
                  'localValue', x.local_value, 'serverValue', x.server_value,
                  'resolution', x.resolution,
                  'winnerDeviceId', x.winner_device_id,
                  'winnerLamport', x.winner_lamport)
                ORDER BY x.id)
           FROM (
             SELECT * FROM conflicts
             UNION ALL
             SELECT * FROM tag_conflicts
             UNION ALL
             SELECT * FROM archive_conflicts
             UNION ALL
             SELECT * FROM override_conflicts
           ) AS x
          WHERE x.device_id = $device_id
       ), '[]'::jsonb) AS conflicts
  FROM entity_snapshot AS e;
