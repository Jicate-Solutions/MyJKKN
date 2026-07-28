-- Migration: PDE answer-key hardening — Phase 2 (lock base-table read)
-- Date: 2026-07-22
-- Apply ONLY after the Phase 1 RPCs (pde_answer_key_secdef_rpcs.sql) are live
-- AND the app code that reads via those RPCs / the service-role client is
-- deployed (PR #2244). This is the breaking half: it removes the learner
-- "any visible assessment" read branch from pde_assessment_questions, so a
-- learner can no longer SELECT the answer-key columns (ground_truth,
-- correct_answer, options[].is_correct, expected_regions) via a direct query.
--
-- Before: USING (EXISTS (SELECT 1 FROM pde_assessments a WHERE a.id = assessment_id))
--   → any learner who could see a published assessment could read every question
--     row for it, including the key. This was the leak (proven by impersonation).
-- After: staff (pde.faculty.view + institution) / case-author / admin only.
--   Learners reach questions through fn_pde_get_case_questions (key stripped),
--   mark objective questions server-side, and unlock the key for review only
--   after a completed submission via fn_pde_get_answer_key_for_review.
--
-- Validated in a rolled-back prod txn with impersonation: two enrolled learners
-- read 0 rows; the case author still reads all rows; the safe RPC still returns
-- the questions with no key field present.

ALTER POLICY pde_questions_read ON public.pde_assessment_questions
USING (
  is_super_admin() OR is_admin()
  OR EXISTS (
    SELECT 1 FROM pde_assessments a
    WHERE a.id = pde_assessment_questions.assessment_id
      AND a.created_by = auth.uid()
  )
  OR (
    user_has_permission('pde.faculty.view')
    AND EXISTS (
      SELECT 1 FROM pde_assessments a
      JOIN vac_courses c ON c.id = a.course_id
      WHERE a.id = pde_assessment_questions.assessment_id
        AND role_has_institution_access(c.institution_id)
    )
  )
);
