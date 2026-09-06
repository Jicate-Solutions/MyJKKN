-- Migration: PDE answer-key hardening — Phase 1 (additive SECDEF RPCs)
-- Date: 2026-07-22
-- Why: An enrolled learner could read the model answers for their own published
--      clinical case by querying pde_assessment_questions directly (RLS is
--      row-level, not column-level, so the ground_truth / correct_answer /
--      options[].is_correct / expected_regions fields were all readable before
--      attempting). Proven by impersonation. These three definer-rights RPCs
--      re-serve exactly what a learner legitimately needs — questions WITHOUT
--      the key, server-side objective marking, and the key ONLY after a
--      completed submission — so the learner never receives the answer key up
--      front. Phase 2 (a separate migration) then removes the learner read
--      grant on the base table. Phase 1 is additive and breaks nothing.
--
-- Anon lock-out: every function REVOKEs EXECUTE from anon+PUBLIC and GRANTs only
-- to authenticated (Supabase's default ALTER DEFAULT PRIVILEGES otherwise grants
-- anon EXECUTE on every new function).

-- 1. Safe question delivery — learner-callable, strips every answer-key field.
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
    OR EXISTS (SELECT 1 FROM pde_assessments a JOIN vac_enrollments e ON e.course_id=a.course_id
          WHERE a.id=p_assessment_id AND a.is_active AND a.status='published' AND e.user_id=v_uid)
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

-- 2. Server-side objective marking (MCQ). Returns verdict only.
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
    OR EXISTS (SELECT 1 FROM pde_assessments a JOIN vac_enrollments e ON e.course_id=a.course_id
          WHERE a.id=v_assessment_id AND a.is_active AND a.status='published' AND e.user_id=v_uid)
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

-- 3. Answer key for post-attempt review — only after a completed submission (or staff/creator).
CREATE OR REPLACE FUNCTION public.fn_pde_get_answer_key_for_review(p_assessment_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_uid uuid := auth.uid(); v_allowed boolean; v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE='42501'; END IF;
  SELECT is_super_admin() OR is_admin()
    OR EXISTS (SELECT 1 FROM pde_assessments a WHERE a.id=p_assessment_id AND a.created_by=v_uid)
    OR (user_has_permission('pde.faculty.view') AND EXISTS (
          SELECT 1 FROM pde_assessments a JOIN vac_courses c ON c.id=a.course_id
          WHERE a.id=p_assessment_id AND role_has_institution_access(c.institution_id)))
    OR EXISTS (SELECT 1 FROM pde_submissions s
          WHERE s.assessment_id=p_assessment_id AND s.learner_id=v_uid AND s.completed_at IS NOT NULL)
  INTO v_allowed;
  IF NOT v_allowed THEN RAISE EXCEPTION 'no completed attempt for this case' USING ERRCODE='42501'; END IF;
  -- Post-completion review: return the FULL question rows (keys included). The
  -- learner has earned the answer key by finishing the attempt; this is the one
  -- learner path that legitimately exposes ground_truth / correct_answer /
  -- is_correct / expected_regions, and only via this gate.
  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'id', q.id, 'assessment_id', q.assessment_id, 'order_index', q.order_index,
      'question_type', q.question_type, 'question_text', q.question_text,
      'question_media_url', q.question_media_url, 'options', q.options,
      'correct_answer', q.correct_answer, 'expected_regions', q.expected_regions,
      'metadata', q.metadata
    ) ORDER BY q.order_index
  ), '[]'::jsonb) INTO v_result
  FROM pde_assessment_questions q
  WHERE q.assessment_id=p_assessment_id
    AND q.question_type IN ('free_text_socratic','mcq_warmup','image_tag');
  RETURN v_result;
END; $fn$;

REVOKE EXECUTE ON FUNCTION public.fn_pde_get_case_questions(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_pde_get_case_questions(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_pde_mark_objective(uuid, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_pde_mark_objective(uuid, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_pde_get_answer_key_for_review(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_pde_get_answer_key_for_review(uuid) TO authenticated;
