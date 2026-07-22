-- Migration: PDE clinical-case assignment (assign-to-section)
-- Date: 2026-07-22
-- Design: specs/pde-case-assignment-design-2026-07-22.md
-- Model: OPEN BY DEFAULT + per-case LOCK. A published case is visible to all
-- enrolled learners UNLESS visibility_mode='class_only', in which case only
-- learners in an assigned section (or with a prior attempt) may see/attempt it.
-- Staff/creator/admin unaffected. Extends pde_assess_read + the answer-key RPCs.

-- 1. Per-case visibility switch (default preserves current behavior).
ALTER TABLE public.pde_assessments
  ADD COLUMN IF NOT EXISTS visibility_mode text NOT NULL DEFAULT 'open'
    CHECK (visibility_mode IN ('open','class_only'));

-- 2. Assignment table: a case pushed to a section, optional due date.
CREATE TABLE IF NOT EXISTS public.pde_case_assignments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id uuid NOT NULL REFERENCES public.pde_assessments(id) ON DELETE CASCADE,
  section_id    uuid NOT NULL REFERENCES public.sections(id) ON DELETE CASCADE,
  assigned_by   uuid NOT NULL,
  due_at        timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (assessment_id, section_id)
);
CREATE INDEX IF NOT EXISTS idx_pde_case_assignments_assessment ON public.pde_case_assignments(assessment_id);
CREATE INDEX IF NOT EXISTS idx_pde_case_assignments_section    ON public.pde_case_assignments(section_id);
ALTER TABLE public.pde_case_assignments ENABLE ROW LEVEL SECURITY;

-- write: creator / staff-with-permission / admin
DROP POLICY IF EXISTS pde_case_assign_write ON public.pde_case_assignments;
CREATE POLICY pde_case_assign_write ON public.pde_case_assignments FOR ALL
USING (
  is_super_admin() OR is_admin()
  OR EXISTS (SELECT 1 FROM pde_assessments a WHERE a.id = assessment_id
    AND (a.created_by = auth.uid()
      OR (user_has_permission('pde.faculty.view') AND EXISTS (
            SELECT 1 FROM vac_courses c WHERE c.id = a.course_id AND role_has_institution_access(c.institution_id)))))
)
WITH CHECK (
  is_super_admin() OR is_admin()
  OR EXISTS (SELECT 1 FROM pde_assessments a WHERE a.id = assessment_id
    AND (a.created_by = auth.uid()
      OR (user_has_permission('pde.faculty.view') AND EXISTS (
            SELECT 1 FROM vac_courses c WHERE c.id = a.course_id AND role_has_institution_access(c.institution_id)))))
);

-- read: staff/creator/admin as above, plus a learner reading assignments for their OWN section (nudge/due badge)
DROP POLICY IF EXISTS pde_case_assign_read ON public.pde_case_assignments;
CREATE POLICY pde_case_assign_read ON public.pde_case_assignments FOR SELECT
USING (
  is_super_admin() OR is_admin()
  OR EXISTS (SELECT 1 FROM pde_assessments a WHERE a.id = assessment_id AND a.created_by = auth.uid())
  OR (user_has_permission('pde.faculty.view') AND EXISTS (
        SELECT 1 FROM pde_assessments a JOIN vac_courses c ON c.id = a.course_id
        WHERE a.id = assessment_id AND role_has_institution_access(c.institution_id)))
  OR EXISTS (SELECT 1 FROM profiles p JOIN learners_profiles lp ON lp.id = p.learner_id
        WHERE p.id = auth.uid() AND lp.section_id = pde_case_assignments.section_id)
);

-- 3. Central visibility predicate (SECDEF; used by RLS + the answer-key RPCs so the
--    gate can never drift between "can list" and "can attempt").
CREATE OR REPLACE FUNCTION public.fn_pde_case_visible_to_learner(p_assessment_id uuid, p_uid uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_ok boolean;
BEGIN
  IF p_uid IS NULL THEN RETURN false; END IF;
  SELECT
    a.is_active AND a.status = 'published'
    AND EXISTS (SELECT 1 FROM vac_enrollments e WHERE e.course_id = a.course_id AND e.user_id = p_uid)
    AND (
      coalesce(a.visibility_mode,'open') = 'open'
      OR EXISTS (SELECT 1 FROM pde_case_assignments ca
                 JOIN profiles p ON p.id = p_uid
                 JOIN learners_profiles lp ON lp.id = p.learner_id
                 WHERE ca.assessment_id = a.id AND ca.section_id = lp.section_id)
      OR EXISTS (SELECT 1 FROM pde_submissions s WHERE s.assessment_id = a.id AND s.learner_id = p_uid)
    )
  INTO v_ok
  FROM pde_assessments a WHERE a.id = p_assessment_id;
  RETURN coalesce(v_ok, false);
END; $fn$;
REVOKE EXECUTE ON FUNCTION public.fn_pde_case_visible_to_learner(uuid, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_pde_case_visible_to_learner(uuid, uuid) TO authenticated;

-- 4. pde_assess_read: replace the learner branch with the visibility predicate.
ALTER POLICY pde_assess_read ON public.pde_assessments
USING (
  ( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)
  OR (( SELECT user_has_permission('pde.faculty.view'::text) AS user_has_permission)
      AND (EXISTS ( SELECT 1 FROM vac_courses c
                    WHERE ((c.id = pde_assessments.course_id) AND role_has_institution_access(c.institution_id)))))
  OR public.fn_pde_case_visible_to_learner(pde_assessments.id, ( SELECT auth.uid() AS uid))
);

-- 5. Answer-key RPCs: learner gate now honors visibility (a locked-out learner
--    can't fetch questions or mark objectives either).
CREATE OR REPLACE FUNCTION public.fn_pde_get_case_questions(p_assessment_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_uid uuid := auth.uid(); v_allowed boolean; v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE='42501'; END IF;
  SELECT is_super_admin() OR is_admin()
    OR EXISTS (SELECT 1 FROM pde_assessments a WHERE a.id=p_assessment_id AND a.created_by=v_uid)
    OR (user_has_permission('pde.faculty.view') AND EXISTS (
          SELECT 1 FROM pde_assessments a JOIN vac_courses c ON c.id=a.course_id
          WHERE a.id=p_assessment_id AND role_has_institution_access(c.institution_id)))
    OR public.fn_pde_case_visible_to_learner(p_assessment_id, v_uid)
  INTO v_allowed;
  IF NOT v_allowed THEN RAISE EXCEPTION 'not authorized for this case' USING ERRCODE='42501'; END IF;
  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'id', q.id, 'assessment_id', q.assessment_id, 'question_type', q.question_type,
      'question_text', q.question_text, 'question_media_url', q.question_media_url,
      'points', q.points, 'order_index', q.order_index, 'finks_dimension', q.finks_dimension,
      'difficulty', q.difficulty,
      'options', (SELECT coalesce(jsonb_agg((elem - 'is_correct') ORDER BY ord), '[]'::jsonb)
                  FROM jsonb_array_elements(coalesce(q.options,'[]'::jsonb)) WITH ORDINALITY AS o(elem, ord)),
      'metadata', (coalesce(q.metadata,'{}'::jsonb) - 'ground_truth' - 'key_concepts')
    ) ORDER BY q.order_index
  ), '[]'::jsonb) INTO v_result
  FROM pde_assessment_questions q
  WHERE q.assessment_id=p_assessment_id
    AND q.question_type IN ('free_text_socratic','mcq_warmup','image_tag');
  RETURN v_result;
END; $fn$;

CREATE OR REPLACE FUNCTION public.fn_pde_mark_objective(p_question_id uuid, p_selected_option_id text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_uid uuid := auth.uid(); v_assessment_id uuid; v_correct_answer text; v_options jsonb; v_correct_id text; v_allowed boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE='42501'; END IF;
  SELECT q.assessment_id, q.correct_answer, q.options INTO v_assessment_id, v_correct_answer, v_options
  FROM pde_assessment_questions q WHERE q.id=p_question_id;
  IF v_assessment_id IS NULL THEN RAISE EXCEPTION 'question not found' USING ERRCODE='P0002'; END IF;
  SELECT is_super_admin() OR is_admin()
    OR EXISTS (SELECT 1 FROM pde_assessments a WHERE a.id=v_assessment_id AND a.created_by=v_uid)
    OR public.fn_pde_case_visible_to_learner(v_assessment_id, v_uid)
  INTO v_allowed;
  IF NOT v_allowed THEN RAISE EXCEPTION 'not authorized' USING ERRCODE='42501'; END IF;
  v_correct_id := nullif(v_correct_answer,'');
  IF v_correct_id IS NULL THEN
    SELECT elem->>'id' INTO v_correct_id
    FROM jsonb_array_elements(coalesce(v_options,'[]'::jsonb)) elem
    WHERE (elem->>'is_correct')::boolean IS TRUE LIMIT 1;
  END IF;
  RETURN jsonb_build_object('question_id', p_question_id, 'correct_id', v_correct_id,
    'is_correct', (v_correct_id IS NOT NULL AND p_selected_option_id = v_correct_id));
END; $fn$;

-- Re-assert the anon lock on the two RPCs re-created above. They were already
-- locked in pde_answer_key_secdef_rpcs.sql; this is idempotent and also satisfies
-- the secdef-anon-revoke CI gate, which checks every function DEFINED in a
-- migration (a CREATE OR REPLACE counts as a definition).
REVOKE EXECUTE ON FUNCTION public.fn_pde_get_case_questions(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_pde_get_case_questions(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_pde_mark_objective(uuid, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_pde_mark_objective(uuid, text) TO authenticated;
