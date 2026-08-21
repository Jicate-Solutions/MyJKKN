-- =====================================================================
-- A person may read their OWN JKKN identity
-- =====================================================================
-- jkkn_identities_select gates on users.jkkn_id.view, an administrative
-- key. An external course participant holds exactly one permission —
-- courses.participant.self — so /my-courses could not read the very
-- number the participant signs in with, and it rendered blank in the
-- header and, worse, blank on the fee receipt they download.
--
-- ADDITIVE. Postgres OR-combines permissive policies, so this widens the
-- existing rule rather than replacing it: administrators keep reading
-- everyone's, and a person gains their own and nobody else's.
--
-- Scoped to profile_id deliberately. That is the anchor for an
-- external_participant identity and equals auth.uid() by this codebase's
-- profiles.id convention. learner_profile_id and team_member_id are NOT
-- covered: learners_profiles.id is disjoint from profiles.id, so matching
-- them would need a join that this predicate — evaluated on every row of
-- every read — should not carry. Learners and staff see their number
-- through their own surfaces.
-- =====================================================================

CREATE POLICY jkkn_identities_select_self ON public.jkkn_identities
  FOR SELECT TO authenticated
  USING (profile_id = (SELECT auth.uid()));

COMMENT ON POLICY jkkn_identities_select_self ON public.jkkn_identities IS
  'A person reads their own profile-anchored JKKN ID. Additive to jkkn_identities_select, which stays administrative.';
