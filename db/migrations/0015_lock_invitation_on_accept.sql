-- The invitation is locked while it is being accepted.
--
-- The accept path read the invitation, decided, and then wrote to it with no
-- lock and no condition: `UPDATE household_invitations SET accepted_at =
-- now() WHERE id = p_invitation_id`. Two things could go wrong in the window
-- between the read and the write:
--
-- - a revocation that committed in between was written over. The invitation
--   ended up accepted *and* revoked, and the caller was in the household the
--   operator believed they had taken back;
-- - two concurrent accepts both passed the check and both wrote. The
--   membership row was written once - the insert is `ON CONFLICT DO NOTHING` -
--   but both callers were told they had joined.
--
-- The fix has two halves, and the first is what the second depends on.
--
-- `SELECT ... FOR UPDATE` takes the invitation row's lock before the
-- decision is made, so a concurrent revocation waits for the accept instead
-- of overtaking it: the two are ordered, and the accept's decision is made
-- against a row that cannot change underneath it. The final `UPDATE` then
-- carries the condition the decision was made on - the row must still be
-- unaccepted and unrevoked - so a row that changed in the meantime is never
-- written over.
--
-- The function keeps its name, its signature, its return value and its error
-- behaviour: `42501` when there is no signed-in user, and the errors that
-- exist today for an invitation that cannot be accepted. The caller sees no
-- difference except that a revoked invitation is refused.
--
-- This is migration 0006's body with the two changes; the statements are
-- otherwise unchanged.
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
     AND i.expires_at > now()
   FOR UPDATE;

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
   WHERE id = p_invitation_id
     AND accepted_at IS NULL
     AND revoked_at IS NULL;

  RETURN v_household;
END;
$fn$;
