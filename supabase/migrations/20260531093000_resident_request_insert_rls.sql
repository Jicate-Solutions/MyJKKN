-- Resident self-INSERT for leave + gate passes. Self-bound by learner_id = auth.uid().
-- gate-pass staff branch re-expressed on gate_passes.approve (every current .create
-- holder also holds .approve), so residents (who hold .create but not .approve) can
-- only insert their OWN rows, not classmates'.
DROP POLICY IF EXISTS hostel_leave_requests_insert_permission ON public.hostel_leave_requests;
CREATE POLICY hostel_leave_requests_insert_permission ON public.hostel_leave_requests
FOR INSERT WITH CHECK (
  is_super_admin() OR is_admin()
  OR (user_has_permission('campus_living.leave.create') AND role_has_institution_access(institution_id) AND role_has_block_access(block_id))
  OR (user_has_permission('campus_living.leave.request') AND learner_id = auth.uid())
);

DROP POLICY IF EXISTS hostel_gate_passes_insert_permission ON public.hostel_gate_passes;
CREATE POLICY hostel_gate_passes_insert_permission ON public.hostel_gate_passes
FOR INSERT WITH CHECK (
  is_super_admin() OR is_admin()
  OR (user_has_permission('campus_living.gate_passes.approve') AND role_has_institution_access(institution_id))
  OR (user_has_permission('campus_living.gate_passes.create') AND learner_id = auth.uid())
);
