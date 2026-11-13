-- The creator reads the household they just made.
--
-- PostgreSQL applies a table's SELECT policies to the rows an
-- INSERT ... RETURNING returns, and the row that comes back has to pass
-- them. The households table carries two: the bootstrap policy, which lets
-- the creator read the household before any membership row exists, and the
-- member policy, which needs a membership. Neither admitted the row the
-- application had just written, so the insert was refused with
--
--   new row violates row-level security policy for table "households"
--
-- and the application could not create a household at all.
--
-- The bootstrap policy could not admit it, because it asked the wrong
-- question of the wrong table. app_household_bootstrap is a SECURITY DEFINER
-- function over the households table, and a function cannot see the row the
-- statement is writing into it: during the insert, the household is not in
-- the table yet, as far as that function's snapshot is concerned.
--
-- The question the policy means to ask is about the *membership*: the
-- household has no members yet, so its creator may read it back. That
-- question is about another table, and it can be asked of it:
--
--   created_by = auth.uid() AND app_household_has_no_members(id)
--
-- The function is SECURITY DEFINER, so it reads every membership row and not
-- only the caller's, and "no members" means what it meant before: no
-- members at all. That distinction is the whole point. A membership
-- sub-query written into the policy instead would be filtered by the
-- membership table's own row-level security: a caller who is not a member
-- sees no membership rows, so the sub-query would hold for a household that
-- has members - and a creator who had been removed from their household
-- would keep reading it. Measured on the local stack, as the application
-- role:
--
--   the membership sub-query shape   -> the removed creator still saw the
--                                       household they had been removed from
--   this function                    -> they did not
--
-- Everything else is unchanged. The creator still cannot read a household
-- they did not create, and a household that still has members is readable
-- only by its members.

CREATE OR REPLACE FUNCTION app_household_has_no_members(p_household_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT NOT EXISTS (
    SELECT 1 FROM household_members
     WHERE household_id = p_household_id
  );
$fn$;

REVOKE ALL ON FUNCTION app_household_has_no_members(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_household_has_no_members(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION app_household_has_no_members(uuid) TO app;

DROP POLICY IF EXISTS households_bootstrap_select ON households;
CREATE POLICY households_bootstrap_select ON households
  FOR SELECT USING (created_by = auth.uid() AND app_household_has_no_members(id));
