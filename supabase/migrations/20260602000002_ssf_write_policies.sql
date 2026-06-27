-- ============================================================================
-- Startup Studio — Foundations (Level 0) WRITE policies  [PR-3 data-layer companion]
-- Spec: specs/startup-studio-foundations-level0-spec-2026-06-01.md §8 (RLS)
-- Date: 2026-06-22
--
-- WHY THIS EXISTS:
--   The PR-1 substrate migration (20260602000001) granted `authenticated` only
--   SELECT on cohorts/worksheets/enrollments and no INSERT on response_versions.
--   MyJKKN routes always write through the caller's RLS-scoped session client
--   (never service-role — see lib/auth/with-auth.ts), so the management + review +
--   version-history write paths would be DENIED without these policies.
--
--   Every write is gated by the canonical MyJKKN permission triad — exactly the
--   standardized pattern in CLAUDE.md: is_super_admin() OR is_admin() OR
--   user_has_permission(<key>). Role Management UI controls who holds the key.
--   Step-0 verified (2026-06-22): is_super_admin() [no-arg], is_admin() [defaulted],
--   user_has_permission(text) [1-arg overload], ss_mentors.user_id → profiles(id).
--
-- Idempotent: each policy is DROP IF EXISTS-ed first so the migration is re-runnable.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- COHORTS — facilitators with foundations.manage create/edit/archive cohorts
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS ssf_cohorts_insert ON ss_foundations_cohorts;
CREATE POLICY ssf_cohorts_insert ON ss_foundations_cohorts
  FOR INSERT TO authenticated
  WITH CHECK (is_super_admin() OR is_admin() OR user_has_permission('startup_studio.foundations.manage'));

DROP POLICY IF EXISTS ssf_cohorts_update ON ss_foundations_cohorts;
CREATE POLICY ssf_cohorts_update ON ss_foundations_cohorts
  FOR UPDATE TO authenticated
  USING (is_super_admin() OR is_admin() OR user_has_permission('startup_studio.foundations.manage'))
  WITH CHECK (is_super_admin() OR is_admin() OR user_has_permission('startup_studio.foundations.manage'));

DROP POLICY IF EXISTS ssf_cohorts_delete ON ss_foundations_cohorts;
CREATE POLICY ssf_cohorts_delete ON ss_foundations_cohorts
  FOR DELETE TO authenticated
  USING (is_super_admin() OR is_admin() OR user_has_permission('startup_studio.foundations.manage'));

-- ----------------------------------------------------------------------------
-- WORKSHEETS — manage-permission authors cohort-specific overrides / canon edits
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS ssf_worksheets_insert ON ss_foundations_worksheets;
CREATE POLICY ssf_worksheets_insert ON ss_foundations_worksheets
  FOR INSERT TO authenticated
  WITH CHECK (is_super_admin() OR is_admin() OR user_has_permission('startup_studio.foundations.manage'));

DROP POLICY IF EXISTS ssf_worksheets_update ON ss_foundations_worksheets;
CREATE POLICY ssf_worksheets_update ON ss_foundations_worksheets
  FOR UPDATE TO authenticated
  USING (is_super_admin() OR is_admin() OR user_has_permission('startup_studio.foundations.manage'))
  WITH CHECK (is_super_admin() OR is_admin() OR user_has_permission('startup_studio.foundations.manage'));

DROP POLICY IF EXISTS ssf_worksheets_delete ON ss_foundations_worksheets;
CREATE POLICY ssf_worksheets_delete ON ss_foundations_worksheets
  FOR DELETE TO authenticated
  USING (is_super_admin() OR is_admin() OR user_has_permission('startup_studio.foundations.manage'));

-- ----------------------------------------------------------------------------
-- ENROLLMENTS — facilitator adds students (manage); students self-enrol (#4)
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS ssf_enroll_insert ON ss_foundations_enrollments;
CREATE POLICY ssf_enroll_insert ON ss_foundations_enrollments
  FOR INSERT TO authenticated
  WITH CHECK (
    is_super_admin() OR is_admin() OR user_has_permission('startup_studio.foundations.manage')
    OR (student_id = auth.uid() AND enrolled_via = 'self')   -- self-enrol path (#4)
  );

DROP POLICY IF EXISTS ssf_enroll_update ON ss_foundations_enrollments;
CREATE POLICY ssf_enroll_update ON ss_foundations_enrollments
  FOR UPDATE TO authenticated
  USING (
    is_super_admin() OR is_admin() OR user_has_permission('startup_studio.foundations.manage')
    OR student_id = auth.uid()   -- student may withdraw self
  )
  WITH CHECK (
    is_super_admin() OR is_admin() OR user_has_permission('startup_studio.foundations.manage')
    OR student_id = auth.uid()
  );

DROP POLICY IF EXISTS ssf_enroll_delete ON ss_foundations_enrollments;
CREATE POLICY ssf_enroll_delete ON ss_foundations_enrollments
  FOR DELETE TO authenticated
  USING (is_super_admin() OR is_admin() OR user_has_permission('startup_studio.foundations.manage'));

-- ----------------------------------------------------------------------------
-- RESPONSES — RETIGHTEN INSERT. The PR-1 policy checked only submitted_by=auth.uid(),
-- which let any authenticated user write a response attributed to ANY student_id
-- (counting toward that victim's completion). Constrain: you write for yourself, OR
-- for another learner only with foundations.manage (the facilitator proxy-fill, #9).
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS ssf_responses_insert ON ss_foundations_responses;
CREATE POLICY ssf_responses_insert ON ss_foundations_responses
  FOR INSERT TO authenticated
  WITH CHECK (
    submitted_by = auth.uid()
    AND (
      student_id = auth.uid()
      OR is_super_admin() OR is_admin()
      OR user_has_permission('startup_studio.foundations.manage')
    )
  );

-- ----------------------------------------------------------------------------
-- RESPONSES — reviewer SELECT. The PR-1 SELECT policy only lets a learner see their
-- own rows and a cohort creator/lead-mentor see their cohort's — so a foundations.review
-- holder who didn't create the cohort would get an EMPTY review queue and couldn't read
-- the submission they must review. This ORs in read access for reviewers + admins.
-- (v1: blanket across institutions — the .review roles are curated/trusted; institution
--  scoping is a follow-up.)
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS ssf_responses_review_select ON ss_foundations_responses;
CREATE POLICY ssf_responses_review_select ON ss_foundations_responses
  FOR SELECT TO authenticated
  USING (
    is_super_admin() OR is_admin() OR user_has_permission('startup_studio.foundations.review')
  );

-- ----------------------------------------------------------------------------
-- RESPONSES — reviewer UPDATE (mentor feedback). ORs with the existing
-- student/proxy update policy (ssf_responses_update). A reviewer is a user with
-- foundations.review, or the cohort's creator/lead-mentor (mirrors the SELECT
-- facilitator clause). #3/#7: review is a quality flag, never gates completion.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS ssf_responses_review_update ON ss_foundations_responses;
CREATE POLICY ssf_responses_review_update ON ss_foundations_responses
  FOR UPDATE TO authenticated
  USING (
    is_super_admin() OR is_admin() OR user_has_permission('startup_studio.foundations.review')
    OR EXISTS (
      SELECT 1
      FROM ss_foundations_enrollments e
      JOIN ss_foundations_cohorts c ON c.id = e.cohort_id
      WHERE e.student_id = ss_foundations_responses.student_id
        AND (c.created_by = auth.uid()
             OR c.lead_mentor_id IN (SELECT m.id FROM ss_mentors m WHERE m.user_id = auth.uid()))
    )
  )
  WITH CHECK (
    is_super_admin() OR is_admin() OR user_has_permission('startup_studio.foundations.review')
    OR EXISTS (
      SELECT 1
      FROM ss_foundations_enrollments e
      JOIN ss_foundations_cohorts c ON c.id = e.cohort_id
      WHERE e.student_id = ss_foundations_responses.student_id
        AND (c.created_by = auth.uid()
             OR c.lead_mentor_id IN (SELECT m.id FROM ss_mentors m WHERE m.user_id = auth.uid()))
    )
  );

-- ----------------------------------------------------------------------------
-- RESPONSE VERSIONS — the typer (student or facilitator proxy) appends history
-- on every (re)submit. Read policy already exists; this enables the write.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS ssf_respver_insert ON ss_foundations_response_versions;
CREATE POLICY ssf_respver_insert ON ss_foundations_response_versions
  FOR INSERT TO authenticated
  WITH CHECK (submitted_by = auth.uid());
