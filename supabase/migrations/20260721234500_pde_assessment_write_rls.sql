-- ============================================================================
-- 20260721234500 — Close the PDE assessment write + browse holes
-- ============================================================================
-- Follow-up to 20260721230000 (submissions/engagement). That sweep only
-- examined SELECT policies; these are declared FOR ALL, which covers reads AND
-- writes, so they were missed:
--
--   pde_assess_write     ON pde_assessments           ALL    USING(true) CHECK(true)
--   pde_questions_write  ON pde_assessment_questions  ALL    USING(true) CHECK(true)
--   pde_certs_write      ON pde_certificates          INSERT             CHECK(true)
--
-- Unlike the previous fix, these tables HOLD DATA: 4 published clinical cases
-- and 29 questions. Concretely, any authenticated user — including a learner —
-- could DELETE a published teaching case, rewrite its questions, or mint
-- themselves a certificate.
--
-- Browsing was also unscoped: pde_assess_read allowed any authenticated user to
-- read every active assessment regardless of institution or enrolment, and
-- pde_questions_read only required the parent assessment to be active.
--
-- Director decisions 2026-07-21:
--   • edits: "only the person who made it (+ admins)"
--   • browsing: "only cases on their own courses"
--
-- SAFETY CHECK DONE BEFORE WRITING THIS: case authoring writes through the
-- AUTHENTICATED user's client (app/api/pde/cases/route.ts uses createClient(),
-- not the service-role client), so an admin-only write policy would have BROKEN
-- case authoring outright. The write policies below therefore grant the case
-- CREATOR (pde_assessments.created_by = auth.uid()) alongside admins.
--
-- ENROLMENT SCOPING VERIFIED SAFE: all 4 existing cases sit on BDS-CR-101,
-- which has 544 enrolments, so no learner loses access to a case they can see
-- today. Enrolment data is thin elsewhere (only one course carries any), which
-- is why staff access does NOT depend on enrolment.
--
-- KNOWN GAP, NOT CLOSED HERE: metadata.ground_truth (the model answer) still
-- lives on the question row, and RLS is row-level, not column-level — so an
-- ENROLLED learner querying pde_assessment_questions directly can still read
-- the answer key for their own case. Narrowing the row-level reach (below) plus
-- stripping it from the page payload (companion code change) closes the
-- realistic path; fully closing it needs ground_truth moved to its own
-- staff-only table, which touches 12 files and is deliberately deferred.
-- ============================================================================

-- ── pde_assessments ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS pde_assess_write ON public.pde_assessments;
DROP POLICY IF EXISTS pde_assess_read  ON public.pde_assessments;

-- Read: staff scoped by institution; learners only see PUBLISHED cases on a
-- course they are actually enrolled in.
CREATE POLICY pde_assess_read
  ON public.pde_assessments
  FOR SELECT
  USING (
    (select is_super_admin()) OR (select is_admin())
    OR (
      (select user_has_permission('pde.faculty.view'))
      AND EXISTS (
        SELECT 1 FROM public.vac_courses c
        WHERE c.id = pde_assessments.course_id
          AND role_has_institution_access(c.institution_id)
      )
    )
    OR (
      is_active = true
      AND status = 'published'
      AND EXISTS (
        SELECT 1 FROM public.vac_enrollments e
        WHERE e.course_id = pde_assessments.course_id
          AND e.user_id = (select auth.uid())
      )
    )
  );

-- Write: the creator, or an admin. Nobody else can edit or delete a case.
CREATE POLICY pde_assess_write
  ON public.pde_assessments
  FOR ALL
  USING (
    (select is_super_admin()) OR (select is_admin())
    OR created_by = (select auth.uid())
  )
  WITH CHECK (
    (select is_super_admin()) OR (select is_admin())
    OR created_by = (select auth.uid())
  );

-- ── pde_assessment_questions ────────────────────────────────────────────────
DROP POLICY IF EXISTS pde_questions_write ON public.pde_assessment_questions;
DROP POLICY IF EXISTS pde_questions_read  ON public.pde_assessment_questions;

-- Read: mirrors the parent assessment's visibility exactly, so a question can
-- never be reachable by someone who cannot reach its case.
CREATE POLICY pde_questions_read
  ON public.pde_assessment_questions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.pde_assessments a
      WHERE a.id = pde_assessment_questions.assessment_id
    )
  );

-- Write: the creator of the parent case, or an admin.
CREATE POLICY pde_questions_write
  ON public.pde_assessment_questions
  FOR ALL
  USING (
    (select is_super_admin()) OR (select is_admin())
    OR EXISTS (
      SELECT 1 FROM public.pde_assessments a
      WHERE a.id = pde_assessment_questions.assessment_id
        AND a.created_by = (select auth.uid())
    )
  )
  WITH CHECK (
    (select is_super_admin()) OR (select is_admin())
    OR EXISTS (
      SELECT 1 FROM public.pde_assessments a
      WHERE a.id = pde_assessment_questions.assessment_id
        AND a.created_by = (select auth.uid())
    )
  );

-- ── pde_certificates ────────────────────────────────────────────────────────
-- A certificate is a credential. Letting `authenticated` INSERT one with
-- CHECK(true) is self-service credential forgery. Certificates are issued by
-- server-side logic running as service_role, which bypasses RLS, so removing
-- the authenticated write path costs nothing.
DROP POLICY IF EXISTS pde_certs_write ON public.pde_certificates;

CREATE POLICY pde_certs_admin_write
  ON public.pde_certificates
  FOR ALL
  USING ((select is_super_admin()) OR (select is_admin()))
  WITH CHECK ((select is_super_admin()) OR (select is_admin()));

NOTIFY pgrst, 'reload schema';
