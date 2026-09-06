-- Let campus-living settings admins (Chief Warden) CREATE / EDIT / DELETE
-- physical-room eligibility rules.
--
-- The existing write policies on both tables gate on
--   (SELECT is_super_admin()) OR (SELECT is_admin())
-- and is_admin() resolves purely from profiles.role IN ('admin','super_admin',
-- 'administrator') or profiles.is_super_admin. A Chief Warden is role
-- 'chief_warden' with is_super_admin = false, so every write was refused with
-- 42501 -- even though the role already holds campus_living.settings.edit, and
-- even though the page's own bulk-eligibility RPC self-gates on exactly that key.
-- Hardcoding role names in SQL instead of gating on a permission key is the
-- anti-pattern CLAUDE.md calls out; these additive policies restore the intended
-- behaviour without touching the working admin path.
--
-- Additive: RLS policies are permissive (OR'd), so these can only widen access.
-- No existing role loses anything, and a mistake here cannot lock admins out.
--
-- user_has_permission() carries its own super-admin bypass and is wrapped in a
-- scalar subquery so it evaluates once per statement rather than per row.
--
-- DELETE on the rule_rooms child table is required even for a plain create:
-- RoomEligibilityService.syncRuleRooms always clears the existing set before
-- inserting the new one.
--
-- Scope note: deliberately NOT restricted by user_block_access. Any holder of
-- campus_living.settings.edit may configure rules for any block; the
-- block-scoped variant was considered and rejected. Note that hostel_blocks RLS
-- independently scopes which blocks a warden can even see (role_has_hostel_block_scope),
-- so in practice the Block dropdown still only offers blocks they hold.
--
-- Verified on apply (2026-08-04), all probes rolled back:
--   chief_warden (girlschiefwarden@jkkn.ac.in): rule created, 3 rooms attached,
--     update 1 row, delete 1 row -- all succeed.
--   plain warden (no campus_living.settings.edit): INSERT still 42501.

DROP POLICY IF EXISTS hostel_room_elig_rules_insert_settings_edit      ON public.hostel_room_eligibility_rules;
DROP POLICY IF EXISTS hostel_room_elig_rules_update_settings_edit      ON public.hostel_room_eligibility_rules;
DROP POLICY IF EXISTS hostel_room_elig_rules_delete_settings_edit      ON public.hostel_room_eligibility_rules;
DROP POLICY IF EXISTS hostel_room_elig_rule_rooms_insert_settings_edit ON public.hostel_room_eligibility_rule_rooms;
DROP POLICY IF EXISTS hostel_room_elig_rule_rooms_delete_settings_edit ON public.hostel_room_eligibility_rule_rooms;

CREATE POLICY hostel_room_elig_rules_insert_settings_edit
  ON public.hostel_room_eligibility_rules
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT user_has_permission('campus_living.settings.edit')));

-- UPDATE needs BOTH: USING picks which rows may be updated, WITH CHECK
-- constrains what they may be updated INTO. Omitting WITH CHECK would let a
-- row be edited into a shape the policy would never have admitted.
CREATE POLICY hostel_room_elig_rules_update_settings_edit
  ON public.hostel_room_eligibility_rules
  FOR UPDATE TO authenticated
  USING      ((SELECT user_has_permission('campus_living.settings.edit')))
  WITH CHECK ((SELECT user_has_permission('campus_living.settings.edit')));

CREATE POLICY hostel_room_elig_rules_delete_settings_edit
  ON public.hostel_room_eligibility_rules
  FOR DELETE TO authenticated
  USING ((SELECT user_has_permission('campus_living.settings.edit')));

CREATE POLICY hostel_room_elig_rule_rooms_insert_settings_edit
  ON public.hostel_room_eligibility_rule_rooms
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT user_has_permission('campus_living.settings.edit')));

CREATE POLICY hostel_room_elig_rule_rooms_delete_settings_edit
  ON public.hostel_room_eligibility_rule_rooms
  FOR DELETE TO authenticated
  USING ((SELECT user_has_permission('campus_living.settings.edit')));
