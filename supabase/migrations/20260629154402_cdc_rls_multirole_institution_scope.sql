-- 2026-06-29 — CDC RLS: recognise multi-role coordinators + scope them to their institution.
--
-- PROBLEM (pre-existing, live on prod): the CDC write rule is_cdc_staff() — and the
-- head-only rule is_cdc_head_or_super() — read the LEGACY single-role column
-- profiles.role. A user whose CDC role lives in the multi-role user_roles table
-- (e.g. profiles.role='staff' but user_roles has cdc_coordinator) is invisible to
-- both, so EVERY CDC write policy rejects them. That is why
-- cdc_training_semester_schedules has 0 rows in all of production — no multi-role
-- coordinator could ever save. (Feature A's recruiter add worked only because it
-- uses a service-role API route that bypasses RLS.)
--
-- A naive fix — just OR-ing user_roles into is_cdc_staff() — would ALSO hand
-- multi-role coordinators cross-institution READ on cdc_placements (salary,
-- community category, address — the placement-PII class flagged in
-- reference_cdc_naac_aicte_export_pii_leak). So recognition MUST come with scope.
--
-- FIX (the platform's own documented Standardized RLS pattern):
--   is_super_admin() OR (is_cdc_staff() AND role_has_institution_access(<inst>))
-- role_has_institution_access() is already multi-role aware + institution-scoped:
--   • super_admin / any scope='all' role (cdc_head) -> true for every institution
--   • cdc_coordinator (scope='own')                 -> true only for own inst (+ CAS sibling)
--   • NULL institution_id (cross-college rows)       -> true (system-wide)
-- Verified live 2026-06-29: as coordinator Muthazhahan, own inst -> true, other inst -> false.
--
-- SCOPING MODEL by subtree:
--   • Institution-bound (training, clubs) + student PII (placements, idp) -> SCOPED.
--   • Drives subtree (cdc_drives has NO institution_id — a campus drive is
--     inherently multi-college) -> recognition-only; no institution scope. These
--     policies are NOT rewritten here; they inherit multi-role recognition from the
--     is_cdc_staff() redefinition below, matching today's cross-college behaviour.

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Make the CDC role checks multi-role aware (recognise user_roles, keep the
--    legacy profiles.role path for back-compat). Pure additive recognition —
--    no single-role user loses access.
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_cdc_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    public.is_super_admin()
    OR (SELECT role IN ('cdc_head','cdc_coordinator') FROM public.profiles WHERE id = auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.user_roles ur
      JOIN public.custom_roles cr ON cr.id = ur.role_id
      WHERE ur.user_id = auth.uid()
        AND cr.role_key IN ('cdc_head','cdc_coordinator')
    ),
    false
  );
$function$;

CREATE OR REPLACE FUNCTION public.is_cdc_head_or_super()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    public.is_super_admin()
    OR (SELECT role = 'cdc_head' FROM public.profiles WHERE id = auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.user_roles ur
      JOIN public.custom_roles cr ON cr.id = ur.role_id
      WHERE ur.user_id = auth.uid()
        AND cr.role_key = 'cdc_head'
    ),
    false
  );
$function$;

-- Anon-lock the redefined CDC role checks. CREATE OR REPLACE does not reset
-- grants, and these were anon-callable already (pre-existing); make the lock
-- explicit per the platform anon-revoke policy. They only read auth.uid() so
-- anon got `false`, never data — but they should not be reachable unauthenticated.
-- RLS evaluates these internally (not via a direct grant), so revoking anon is safe;
-- authenticated keeps EXECUTE for any direct server-side call.
REVOKE EXECUTE ON FUNCTION public.is_cdc_staff()        FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_cdc_head_or_super() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.is_cdc_staff()        TO authenticated;
GRANT  EXECUTE ON FUNCTION public.is_cdc_head_or_super() TO authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. Institution resolvers for child tables (keep policy expressions readable).
--    SECURITY DEFINER so the policy can resolve the parent's institution
--    regardless of the caller's RLS. They return only an institution_id (not PII).
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cdc_learner_institution(p_learner_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$ SELECT institution_id FROM public.learners_profiles WHERE id = p_learner_id $function$;

CREATE OR REPLACE FUNCTION public.cdc_programme_institution(p_programme_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$ SELECT institution_id FROM public.cdc_training_programmes WHERE id = p_programme_id $function$;

CREATE OR REPLACE FUNCTION public.cdc_club_institution(p_club_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$ SELECT institution_id FROM public.cdc_clubs WHERE id = p_club_id $function$;

-- Lock the new resolvers from anon (mandatory anon-revoke rule); authenticated only.
REVOKE EXECUTE ON FUNCTION public.cdc_learner_institution(uuid)   FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cdc_programme_institution(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cdc_club_institution(uuid)      FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.cdc_learner_institution(uuid)   TO authenticated;
GRANT  EXECUTE ON FUNCTION public.cdc_programme_institution(uuid) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.cdc_club_institution(uuid)      TO authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. Scope the institution-bound + PII policies. Each becomes
--    is_cdc_staff() AND role_has_institution_access(<this row's institution>),
--    preserving any existing own-learner self-access branch verbatim.
-- ───────────────────────────────────────────────────────────────────────────

-- cdc_placements (PII: salary, community category, address) — learner-scoped
DROP POLICY IF EXISTS cdc_placements_write ON public.cdc_placements;
CREATE POLICY cdc_placements_write ON public.cdc_placements
  FOR ALL
  USING      (is_cdc_staff() AND role_has_institution_access(cdc_learner_institution(learner_id)))
  WITH CHECK (is_cdc_staff() AND role_has_institution_access(cdc_learner_institution(learner_id)));

DROP POLICY IF EXISTS cdc_placements_read ON public.cdc_placements;
CREATE POLICY cdc_placements_read ON public.cdc_placements
  FOR SELECT
  USING (
    (is_cdc_staff() AND role_has_institution_access(cdc_learner_institution(learner_id)))
    OR EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id = auth.uid() AND pr.learner_id = cdc_placements.learner_id)
  );

-- cdc_placement_snapshots — read scoped (write stays head-only via is_cdc_head_or_super)
DROP POLICY IF EXISTS cdc_placement_snapshots_read ON public.cdc_placement_snapshots;
CREATE POLICY cdc_placement_snapshots_read ON public.cdc_placement_snapshots
  FOR SELECT
  USING (is_cdc_staff() AND role_has_institution_access(cdc_learner_institution(learner_id)));

-- cdc_training_programmes — direct institution_id
DROP POLICY IF EXISTS cdc_training_programmes_write ON public.cdc_training_programmes;
CREATE POLICY cdc_training_programmes_write ON public.cdc_training_programmes
  FOR ALL
  USING      (is_cdc_staff() AND role_has_institution_access(institution_id))
  WITH CHECK (is_cdc_staff() AND role_has_institution_access(institution_id));

-- cdc_training_semester_schedules — via programme
DROP POLICY IF EXISTS cdc_tss_write ON public.cdc_training_semester_schedules;
CREATE POLICY cdc_tss_write ON public.cdc_training_semester_schedules
  FOR ALL
  USING      (is_cdc_staff() AND role_has_institution_access(cdc_programme_institution(programme_id)))
  WITH CHECK (is_cdc_staff() AND role_has_institution_access(cdc_programme_institution(programme_id)));

-- cdc_training_enrollments — via programme (preserve own-learner read branch)
DROP POLICY IF EXISTS cdc_training_enrollments_write ON public.cdc_training_enrollments;
CREATE POLICY cdc_training_enrollments_write ON public.cdc_training_enrollments
  FOR ALL
  USING      (is_cdc_staff() AND role_has_institution_access(cdc_programme_institution(programme_id)))
  WITH CHECK (is_cdc_staff() AND role_has_institution_access(cdc_programme_institution(programme_id)));

DROP POLICY IF EXISTS cdc_training_enrollments_read ON public.cdc_training_enrollments;
CREATE POLICY cdc_training_enrollments_read ON public.cdc_training_enrollments
  FOR SELECT
  USING (
    (is_cdc_staff() AND role_has_institution_access(cdc_programme_institution(programme_id)))
    OR EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id = auth.uid() AND pr.learner_id = cdc_training_enrollments.learner_id)
  );

-- cdc_clubs — direct institution_id
DROP POLICY IF EXISTS cdc_clubs_write ON public.cdc_clubs;
CREATE POLICY cdc_clubs_write ON public.cdc_clubs
  FOR ALL
  USING      (is_cdc_staff() AND role_has_institution_access(institution_id))
  WITH CHECK (is_cdc_staff() AND role_has_institution_access(institution_id));

-- cdc_club_memberships — via club
DROP POLICY IF EXISTS cdc_club_memberships_write ON public.cdc_club_memberships;
CREATE POLICY cdc_club_memberships_write ON public.cdc_club_memberships
  FOR ALL
  USING      (is_cdc_staff() AND role_has_institution_access(cdc_club_institution(club_id)))
  WITH CHECK (is_cdc_staff() AND role_has_institution_access(cdc_club_institution(club_id)));

-- cdc_idp_responses — learner-scoped (preserve own-learner self-service branch)
DROP POLICY IF EXISTS cdc_idp_responses_write ON public.cdc_idp_responses;
CREATE POLICY cdc_idp_responses_write ON public.cdc_idp_responses
  FOR ALL
  USING (
    (is_cdc_staff() AND role_has_institution_access(cdc_learner_institution(learner_id)))
    OR EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id = auth.uid() AND pr.learner_id = cdc_idp_responses.learner_id)
  )
  WITH CHECK (
    (is_cdc_staff() AND role_has_institution_access(cdc_learner_institution(learner_id)))
    OR EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id = auth.uid() AND pr.learner_id = cdc_idp_responses.learner_id)
  );

DROP POLICY IF EXISTS cdc_idp_responses_read ON public.cdc_idp_responses;
CREATE POLICY cdc_idp_responses_read ON public.cdc_idp_responses
  FOR SELECT
  USING (
    (is_cdc_staff() AND role_has_institution_access(cdc_learner_institution(learner_id)))
    OR EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id = auth.uid() AND pr.learner_id = cdc_idp_responses.learner_id)
  );

NOTIFY pgrst, 'reload schema';
