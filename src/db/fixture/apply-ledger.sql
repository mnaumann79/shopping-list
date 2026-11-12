-- One ledger row per OPERATION, written once, at the end of the batch.
--
-- The envelope is DERIVED HERE, not passed in: a batch's statements are
-- pre-built, so their parameters are fixed before the transaction starts.
-- What the operation won, whether the compare-and-swap matched, and which
-- conflicts arose are all decided INSIDE that transaction, and only the rows
-- the transaction wrote can say. A second round trip after the batch would
-- break INV-12's atomicity: a crash between the two would leave a change
-- applied but unrecorded, and the retry would re-apply it.
--
-- The 'skipped' count is the candidates that left NO trace: neither a
-- change-log row nor a conflict row. A candidate whose compare-and-swap
-- matched but whose every field was lost is CONTESTED, not skipped -- it
-- leaves a conflict row -- so counting only the change-log rows would
-- misreport it as skipped.
--
-- It cannot raise: a duplicate opId is a no-op, because a replay is
-- recognised by the pre-batch ledger check and never reaches the batch.
INSERT INTO sync_operations (op_id, household_id, device_id, actor_id,
                             entity_type, entity_id, op_type, lamport,
                             payload, result, outcome)
SELECT $op_id, $household_id, $device_id, $actor_id, $entity_type, $entity_id,
       $op_type, $op_lamport, $payload,
       jsonb_build_object(
         'entities', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                     'entityId', c.entity_id, 'entity', c.payload)
                   ORDER BY c.seq)
              FROM sync_changes c
             WHERE c.op_id = $op_id), '[]'::jsonb),
         'conflicts', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                     'id', x.id, 'field', x.field, 'storeId', x.store_id,
                     'localValue', x.local_value, 'serverValue', x.server_value,
                     'resolution', x.resolution,
                     'winnerDeviceId', x.winner_device_id,
                     'winnerLamport', x.winner_lamport)
                   ORDER BY x.id)
              FROM entity_conflicts x
             WHERE x.op_id = $op_id AND x.device_id = $device_id), '[]'::jsonb),
         'skipped', GREATEST(
           0,
           CASE WHEN jsonb_typeof($payload->'versions') = 'object'
                THEN (SELECT count(*) FROM jsonb_object_keys($payload->'versions'))
                ELSE 0 END
           - (SELECT count(DISTINCT u.entity_id)
                FROM (SELECT entity_id FROM sync_changes WHERE op_id = $op_id
                      UNION ALL
                      SELECT entity_id FROM entity_conflicts WHERE op_id = $op_id) AS u)
         )
       ) AS result,
       CASE
         WHEN (SELECT count(*) FROM sync_changes WHERE op_id = $op_id) > 0
          AND (SELECT count(*) FROM entity_conflicts
                WHERE op_id = $op_id AND device_id = $device_id) > 0
           THEN 'partial'
         WHEN (SELECT count(*) FROM sync_changes WHERE op_id = $op_id) > 0
           THEN 'applied'
         ELSE 'rejected'
       END AS outcome
  FROM (SELECT 1) AS one
 WHERE CASE
         -- A multi-entity operation (its payload carries a versions map) is
         -- ALWAYS decided: each candidate's outcome is either archived or
         -- skipped, and both are specified outcomes (S11), not races.
         WHEN jsonb_typeof($payload->'versions') = 'object' THEN TRUE
         -- A single-entity operation is decided iff its compare-and-swap
         -- matched, which the row records in last_op_id. If it did not
         -- match, the operation must stay retryable and no ledger row is
         -- written -- a ledger row would make the retry look like a
         -- duplicate.
         ELSE EXISTS (SELECT 1 FROM items
                       WHERE $entity_type = 'item'
                         AND id = $entity_id AND last_op_id = $op_id)
            OR EXISTS (SELECT 1 FROM categories
                       WHERE $entity_type = 'category'
                         AND id = $entity_id AND last_op_id = $op_id)
            OR EXISTS (SELECT 1 FROM stores
                       WHERE $entity_type = 'store'
                         AND id = $entity_id AND last_op_id = $op_id)
       END
ON CONFLICT (op_id) DO NOTHING;
