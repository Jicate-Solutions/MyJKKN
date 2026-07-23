-- Resident own-row RLS branches for My Hostel (SELECT-own + own profile read/write).
-- Each policy preserves the existing admin branch and appends an own-row OR.
-- Leave/gate-pass own-INSERT is intentionally NOT here (handled in a later task,
-- self-bound by learner_id = auth.uid()).

-- ── hostel_leave_requests: residents READ own ────────────────────────
DROP POLICY IF EXISTS hostel_leave_requests_select_permission ON public.hostel_leave_requests;
CREATE POLICY hostel_leave_requests_select_permission ON public.hostel_leave_requests
FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('campus_living.leave.view') AND role_has_institution_access(institution_id) AND role_has_block_access(block_id))
  OR (user_has_permission('campus_living.leave.view_own') AND learner_id = auth.uid())
);

-- ── hostel_gate_passes: residents READ own ───────────────────────────
DROP POLICY IF EXISTS hostel_gate_passes_select_permission ON public.hostel_gate_passes;
CREATE POLICY hostel_gate_passes_select_permission ON public.hostel_gate_passes
FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('campus_living.gate_passes.view') AND role_has_institution_access(institution_id))
  OR (user_has_permission('campus_living.gate_passes.view_own') AND learner_id = auth.uid())
);

-- ── learner_hostel_profiles: residents read + upsert OWN ──────────────
DROP POLICY IF EXISTS lhp_select_permission ON public.learner_hostel_profiles;
CREATE POLICY lhp_select_permission ON public.learner_hostel_profiles
FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR EXISTS (SELECT 1 FROM learners_profiles lp
             WHERE lp.id = learner_hostel_profiles.learner_id
               AND user_has_permission('campus_living.residents.view')
               AND role_has_institution_access(lp.institution_id))
  OR (user_has_permission('campus_living.profile.view_own') AND learner_id = public.get_my_learner_id())
);

DROP POLICY IF EXISTS lhp_update_permission ON public.learner_hostel_profiles;
CREATE POLICY lhp_update_permission ON public.learner_hostel_profiles
FOR UPDATE USING (
  is_super_admin() OR is_admin()
  OR EXISTS (SELECT 1 FROM learners_profiles lp
             WHERE lp.id = learner_hostel_profiles.learner_id
               AND user_has_permission('campus_living.residents.edit')
               AND role_has_institution_access(lp.institution_id))
  OR (user_has_permission('campus_living.profile.edit_own') AND learner_id = public.get_my_learner_id())
)
WITH CHECK (
  is_super_admin() OR is_admin()
  OR EXISTS (SELECT 1 FROM learners_profiles lp
             WHERE lp.id = learner_hostel_profiles.learner_id
               AND user_has_permission('campus_living.residents.edit')
               AND role_has_institution_access(lp.institution_id))
  OR (user_has_permission('campus_living.profile.edit_own') AND learner_id = public.get_my_learner_id())
);

DROP POLICY IF EXISTS lhp_insert_permission ON public.learner_hostel_profiles;
CREATE POLICY lhp_insert_permission ON public.learner_hostel_profiles
FOR INSERT WITH CHECK (
  is_super_admin() OR is_admin()
  OR EXISTS (SELECT 1 FROM learners_profiles lp
             WHERE lp.id = learner_hostel_profiles.learner_id
               AND user_has_permission('campus_living.residents.edit')
               AND role_has_institution_access(lp.institution_id))
  OR (user_has_permission('campus_living.profile.edit_own') AND learner_id = public.get_my_learner_id())
);

-- ── hostel_allocations: residents READ own (table empty today) ────────
DROP POLICY IF EXISTS hostel_allocations_select_permission ON public.hostel_allocations;
CREATE POLICY hostel_allocations_select_permission ON public.hostel_allocations
FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('campus_living.allocations.view') AND role_has_institution_access(institution_id) AND role_has_block_access(block_id))
  OR (user_has_permission('campus_living.allocations.view_own') AND learner_id = auth.uid())
);
