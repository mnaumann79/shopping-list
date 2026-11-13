-- The three operations the membership flows need and the policies cannot
-- express.
--
-- The policies are not wrong here: a user who follows a join link or accepts
-- an invitation is neither an owner nor the creator, so the membership policy
-- refuses the row the flow exists to write. These functions are the sanctioned
-- server-side operations, and they are the only way in.
--
-- Each is SECURITY DEFINER and owned by the role that owns the tables, so it
-- reads them with the owner's rights and the policies do not apply to it.
-- Each sets `search_path`, because a SECURITY DEFINER function that resolves
-- its names through a caller-controlled search path is a hole.
--
-- None of them takes a user id. They use auth.uid() internally, so a caller
-- cannot act for somebody else - the same class of hole the bare
-- "user_id = auth.uid()" policy had.

-- The stub auth.users table of a plain PostgreSQL has only an id: the
-- foreign keys need nothing more. The display function needs an email and a
-- name, so the stub grows the two columns GoTrue's table has. On the
-- instance the columns are already there and this does nothing.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'auth')
     AND EXISTS (SELECT 1 FROM pg_class c
                  JOIN pg_namespace n ON n.oid = c.relnamespace
                 WHERE n.nspname = 'auth' AND c.relname = 'users') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_attribute
       WHERE attrelid = 'auth.users'::regclass AND attname = 'email'
    ) THEN
      ALTER TABLE auth.users ADD COLUMN email text;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_attribute
       WHERE attrelid = 'auth.users'::regclass
         AND attname = 'raw_user_meta_data'
    ) THEN
      ALTER TABLE auth.users ADD COLUMN raw_user_meta_data jsonb;
    END IF;
  END IF;
END $$;

-- The display fields of a user, and nothing else.
--
-- The application role has USAGE on the auth schema and EXECUTE on
-- auth.uid(), and nothing else: auth.users is GoTrue's table, and a SELECT on
-- it would put encrypted_password within the application's reach. One
-- mistake elsewhere, and every user's hash is readable. This function
-- exposes a name and an email and nothing more.
CREATE OR REPLACE FUNCTION app_user_display(p_user_id uuid)
RETURNS TABLE(name text, email text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT COALESCE(u.raw_user_meta_data ->> 'name', u.email), u.email
    FROM auth.users u
   WHERE u.id = p_user_id;
$fn$;

-- Accept an invitation, and join the household it was sent for.
--
-- The invitation must be live - not accepted, not revoked, not expired - and
-- it must be addressed to the caller: the caller's email is the one the
-- invitation names. The role comes from the invitation, and the membership
-- row is written with the owner's rights, so the policy is not part of this
-- path at all.
--
-- The distinction between "not live" and "not yours" is the caller's to
-- make, and the invitation table is not readable by somebody who is not yet
-- a member - so the function carries it: a live invitation addressed to
-- somebody else is an error (42501), and an invitation that is not live is
-- no invitation at all (NULL).
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

-- Join a household with a link.
--
-- The link must be live - it exists and it has not expired - and it grants
-- 'member'. Never owner, never admin: a link is a way in for a person, not
-- an authority the link's maker can hand out.
CREATE OR REPLACE FUNCTION app_join_household_by_link(p_token text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_user uuid := auth.uid();
  v_household uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not signed in' USING ERRCODE = '42501';
  END IF;

  SELECT l.household_id
    INTO v_household
    FROM household_join_links l
   WHERE l.token = p_token
     AND l.expires_at > now();

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  INSERT INTO household_members (household_id, user_id, role)
  VALUES (v_household, v_user, 'member')
  ON CONFLICT (household_id, user_id) DO NOTHING;

  RETURN v_household;
END;
$fn$;

-- PUBLIC gets no execute right on any of them. They write membership rows
-- and read GoTrue's users, and the application role is the one that may do
-- that: the inherited authenticated role as well, so a PostgREST connection
-- that assumes that role still reaches them.
REVOKE ALL ON FUNCTION app_user_display(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_accept_household_invitation(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_join_household_by_link(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_user_display(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION app_accept_household_invitation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION app_join_household_by_link(text) TO authenticated;
GRANT EXECUTE ON FUNCTION app_user_display(uuid) TO app;
GRANT EXECUTE ON FUNCTION app_accept_household_invitation(uuid) TO app;
GRANT EXECUTE ON FUNCTION app_join_household_by_link(text) TO app;
