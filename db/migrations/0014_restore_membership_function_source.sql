-- The instance's copy of the invitation function carries an older source.
--
-- The instance applied migration 0006 from an earlier revision of the file,
-- before the file carried the comment that explains why the membership row
-- is written only if there is none. The statements and the behaviour are
-- identical; only the source text differs, and a comment in a plpgsql body
-- is not behaviour.
--
-- The runner's checksum rule would have caught this on a database it
-- migrated - "0006_membership_functions.sql changed after it was applied" -
-- and it was not caught, because the instance's migrations were applied
-- through the MCP, whose ledger records the statement text and no checksum.
--
-- So the instance's function source is not the repository's, and the
-- repository's migrations are the source of truth. The function is recreated
-- here with the text migration 0006 carries today, which makes the two
-- identical - and this file is the record of it.
--
-- The statements are unchanged. Only the comment inside the body is added.
CREATE OR REPLACE FUNCTION app_accept_household_invitation(p_invitation_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_user uuid := auth.uid();
  v_household uuid;
  v_invited_email text;
  v_caller_email text;
  v_role text;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not signed in' USING ERRCODE = '42501';
  END IF;

  SELECT i.household_id, i.role, i.email
    INTO v_household, v_role, v_invited_email
    FROM household_invitations i
   WHERE i.id = p_invitation_id
     AND i.accepted_at IS NULL
     AND i.revoked_at IS NULL
     AND i.expires_at > now();

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT u.email INTO v_caller_email
    FROM auth.users u
   WHERE u.id = v_user;

  IF v_caller_email IS NULL
     OR lower(v_caller_email) <> lower(v_invited_email) THEN
    RAISE EXCEPTION 'the invitation is addressed to somebody else'
      USING ERRCODE = '42501';
  END IF;

  -- The membership row is written only if there is none: a member who
  -- accepts an invitation keeps the role the household gave them, because a
  -- role is the household's to change and not the invitation's (§12.5).
  INSERT INTO household_members (household_id, user_id, role)
  VALUES (v_household, v_user, v_role)
  ON CONFLICT (household_id, user_id) DO NOTHING;

  UPDATE household_invitations
     SET accepted_at = now()
   WHERE id = p_invitation_id;

  RETURN v_household;
END;
$fn$;
