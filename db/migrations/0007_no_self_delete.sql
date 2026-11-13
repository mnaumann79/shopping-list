-- Nobody may remove themselves.
--
-- Section 12.5's rule is the product's: nobody removes themselves, because the
-- owner cannot be recreated - an invitation grants 'admin' or 'member', and
-- only the creator's bootstrap makes an owner - so a self-delete is
-- irreversible.
--
-- The membership policy of section 9.2b does not refuse that by itself. Its
-- USING clause has no command qualifier, so it also governs DELETE, and it
-- admits the caller's own row ("a read may be answered by the caller's own
-- membership row"). Measured as the application role on a fresh stack, a
-- member deleting their own row removed it, and so did the owner.
--
-- So the rule gets its own policy. It is RESTRICTIVE: it narrows the
-- permissive policy instead of replacing it, and the two are combined with
-- AND. A row is deletable when the membership policy admits it *and* it is
-- not the caller's own.
--
-- The cascade is unaffected. A household's membership rows still go with the
-- household: the referential action runs with the table owner's rights, and
-- an owner bypasses row-level security.
DROP POLICY IF EXISTS household_members_no_self_delete ON household_members;

CREATE POLICY household_members_no_self_delete ON household_members
  AS RESTRICTIVE
  FOR DELETE
  USING (user_id <> auth.uid());
