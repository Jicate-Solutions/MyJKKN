-- ============================================================================
-- Migration: 20270115090100_pde_clinical_question_types_expand
-- Adds multi_select, matching and sequencing to the clinical question types.
-- ============================================================================
-- WHY
--   The clinical-case module has three question types: free_text_socratic,
--   mcq_warmup and image_tag. Prof. P.K. Meena Priya's Oral Medicine &
--   Radiology vignettes need three more:
--     * multi_select — "select ALL conditions for the differential", where the
--       rubric also carries an EXCLUSION RATIONALE saying why the tempting
--       wrong option (minor aphthous ulcers) does not belong;
--     * matching     — each left-hand item takes one option from ITS OWN list
--       (autoantibody target → Desmoglein 3; immunofluorescence → fishnet);
--     * sequencing   — put management steps in chronological order.
--
-- WHERE THE ANSWER KEY LIVES (no new columns — reuses what the table has)
--   multi_select : options[].is_correct       (already stripped on the wire)
--                  metadata.exclusion_rationale  → newly stripped below
--   matching     : metadata.match_pairs holds only {id, left, options[]};
--                  the key is correct_answer = {"pair_id": "correct option"}
--   sequencing   : metadata.sequence_items holds {id, text} in DISPLAY order;
--                  the key is correct_answer = ["id","id",...] in TRUE order
--   correct_answer and expected_regions are never returned by
--   fn_pde_get_case_questions, so the key stays in the database for all three.
--
-- Migrations are FILES ONLY in this repo — this is NOT applied here.
-- Idempotent. Safe to re-apply. Runs after 20270115090000 (stages).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Widen the question_type CHECK
-- ----------------------------------------------------------------------------
-- Rebuilt rather than "add if missing": the constraint from
-- 20260522_pde_assessment_questions_clinical_q_types.sql already exists on prod
-- with the narrow list, so an IF NOT EXISTS guard would silently do nothing and
-- every INSERT of a new type would fail the CHECK.

ALTER TABLE public.pde_assessment_questions
  DROP CONSTRAINT IF EXISTS pde_assessment_questions_question_type_check;

ALTER TABLE public.pde_assessment_questions
  ADD CONSTRAINT pde_assessment_questions_question_type_check
  CHECK (question_type IN (
    -- Standard quiz types (/pde/admin/assessments/create + auto-generate route)
    'multiple_choice', 'true_false', 'short_answer',
    -- Clinical case types — original three
    'free_text_socratic', 'mcq_warmup', 'image_tag',
    -- Clinical case types — progressive-vignette three
    'multi_select', 'matching', 'sequencing'
  ));

COMMENT ON COLUMN public.pde_assessment_questions.correct_answer IS
  'Answer key, never sent to a learner mid-attempt. mcq_warmup: the correct option id. matching: JSON object {pair_id: correct option text}. sequencing: JSON array of item ids in true chronological order. Unused by free_text_socratic / image_tag / multi_select.';

CREATE INDEX IF NOT EXISTS idx_pde_assessment_questions_clinical_type_v2
  ON public.pde_assessment_questions (assessment_id, question_type)
  WHERE question_type IN (
    'free_text_socratic','mcq_warmup','image_tag','multi_select','matching','sequencing'
  );

-- ----------------------------------------------------------------------------
-- 2. Marking — replaces the version from 20270115090000
-- ----------------------------------------------------------------------------
-- PARTIAL CREDIT RULES (each returns 0..100; NULL means "not objectively
-- markable", which keeps the question out of the stage denominator rather than
-- scoring it zero):
--
--   multi_select  max(0, correct_picked - wrong_picked) / total_correct
--                 Rewards recognising the right set and charges for scattering.
--                 Her Stage 1: correct {A,B,C,E}, distractor {D}.
--                 Picking all five = (4-1)/4 = 75. Picking A,B,C = 3/4 = 75.
--                 Picking only D = 0.
--
--   matching      correct pairs / total pairs. Each left-hand item is graded on
--                 its own, so getting Desmoglein 3 right still counts when the
--                 immunofluorescence pattern is wrong.
--
--   sequencing    items standing in their correct ABSOLUTE position / total.
--                 Chosen over a rank-correlation measure because a learner can
--                 be told "2 of 4 steps are in the right place" and act on it.
--                 One early insertion shifts the tail and costs those positions —
--                 deliberate: in her management ladder, order IS the competency.
--
-- Comparisons are case-insensitive and whitespace-trimmed so an option typed
-- "IgG " in the key still matches "IgG" picked from the list.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_pde_score_clinical_answer(p_question_id uuid, p_answer jsonb)
RETURNS numeric LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_q            record;
  v_correct_id   text;
  v_best         numeric := 0;
  v_region       jsonb;
  v_px numeric; v_py numeric; v_iw numeric; v_ih numeric;
  v_rw numeric; v_rh numeric; v_cx numeric; v_cy numeric;
  v_dist numeric; v_tol numeric; v_s numeric;
  v_total        integer := 0;
  v_hits         integer := 0;
  v_wrong        integer := 0;
  v_key          jsonb;
  v_pair         jsonb;
  v_picked       text;
  v_expect       text;
  v_idx          integer;
BEGIN
  SELECT question_type, options, correct_answer, expected_regions, metadata
    INTO v_q FROM pde_assessment_questions WHERE id = p_question_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  -- ── mcq_warmup ────────────────────────────────────────────────────────────
  IF v_q.question_type = 'mcq_warmup' THEN
    v_correct_id := nullif(v_q.correct_answer, '');
    IF v_correct_id IS NULL THEN
      SELECT elem->>'id' INTO v_correct_id
      FROM jsonb_array_elements(coalesce(v_q.options, '[]'::jsonb)) elem
      WHERE (elem->>'is_correct')::boolean IS TRUE LIMIT 1;
    END IF;
    IF v_correct_id IS NULL THEN RETURN NULL; END IF;
    RETURN CASE WHEN (p_answer->>'selected_option_id') = v_correct_id THEN 100 ELSE 0 END;

  -- ── multi_select ──────────────────────────────────────────────────────────
  ELSIF v_q.question_type = 'multi_select' THEN
    SELECT count(*) INTO v_total
    FROM jsonb_array_elements(coalesce(v_q.options, '[]'::jsonb)) elem
    WHERE (elem->>'is_correct')::boolean IS TRUE;
    IF v_total = 0 THEN RETURN NULL; END IF;   -- no key authored → not markable

    IF p_answer ? 'selected_option_ids'
       AND jsonb_typeof(p_answer->'selected_option_ids') = 'array' THEN
      SELECT
        count(*) FILTER (WHERE (opt->>'is_correct')::boolean IS TRUE),
        count(*) FILTER (WHERE (opt->>'is_correct')::boolean IS NOT TRUE)
        INTO v_hits, v_wrong
      FROM jsonb_array_elements_text(p_answer->'selected_option_ids') AS sel(id)
      JOIN jsonb_array_elements(coalesce(v_q.options, '[]'::jsonb)) AS opt
        ON opt->>'id' = sel.id;
    ELSE
      v_hits := 0; v_wrong := 0;              -- skipped → zero, not excluded
    END IF;

    RETURN round(greatest(0, (v_hits - v_wrong))::numeric * 100 / v_total, 2);

  -- ── matching ──────────────────────────────────────────────────────────────
  ELSIF v_q.question_type = 'matching' THEN
    v_key := CASE
               WHEN v_q.correct_answer IS NULL OR v_q.correct_answer = '' THEN NULL
               ELSE v_q.correct_answer::jsonb
             END;
    IF v_key IS NULL OR jsonb_typeof(v_key) <> 'object' THEN RETURN NULL; END IF;

    FOR v_pair IN
      SELECT * FROM jsonb_array_elements(
        coalesce(v_q.metadata->'match_pairs', '[]'::jsonb))
    LOOP
      v_total := v_total + 1;
      v_expect := v_key ->> (v_pair->>'id');
      v_picked := p_answer #>> ARRAY['match_selections', v_pair->>'id'];
      IF v_expect IS NOT NULL AND v_picked IS NOT NULL
         AND lower(btrim(v_picked)) = lower(btrim(v_expect)) THEN
        v_hits := v_hits + 1;
      END IF;
    END LOOP;

    IF v_total = 0 THEN RETURN NULL; END IF;
    RETURN round(v_hits::numeric * 100 / v_total, 2);

  -- ── sequencing ────────────────────────────────────────────────────────────
  ELSIF v_q.question_type = 'sequencing' THEN
    v_key := CASE
               WHEN v_q.correct_answer IS NULL OR v_q.correct_answer = '' THEN NULL
               ELSE v_q.correct_answer::jsonb
             END;
    IF v_key IS NULL OR jsonb_typeof(v_key) <> 'array'
       OR jsonb_array_length(v_key) = 0 THEN RETURN NULL; END IF;

    v_total := jsonb_array_length(v_key);
    IF jsonb_typeof(coalesce(p_answer->'sequence_order', 'null'::jsonb)) <> 'array' THEN
      RETURN 0;                                 -- skipped → zero
    END IF;

    FOR v_idx IN 0 .. v_total - 1 LOOP
      v_expect := v_key ->> v_idx;
      v_picked := (p_answer->'sequence_order') ->> v_idx;
      IF v_expect IS NOT NULL AND v_picked IS NOT NULL
         AND lower(btrim(v_picked)) = lower(btrim(v_expect)) THEN
        v_hits := v_hits + 1;
      END IF;
    END LOOP;

    RETURN round(v_hits::numeric * 100 / v_total, 2);

  -- ── image_tag ─────────────────────────────────────────────────────────────
  ELSIF v_q.question_type = 'image_tag' THEN
    -- Mirrors scoreRegions() in app/api/pde/clinical-reasoning/mark-image-tag/route.ts.
    -- Kept in SQL so a stage gate cannot be cleared by POSTing a made-up score.
    -- KEEP THE TWO IN SYNC.
    IF v_q.expected_regions IS NULL
       OR jsonb_array_length(coalesce(v_q.expected_regions, '[]'::jsonb)) = 0 THEN
      RETURN 100;
    END IF;
    v_px := (p_answer#>>'{click_point,x}')::numeric;
    v_py := (p_answer#>>'{click_point,y}')::numeric;
    v_iw := (p_answer#>>'{click_point,imgWidth}')::numeric;
    v_ih := (p_answer#>>'{click_point,imgHeight}')::numeric;
    IF v_px IS NULL OR v_py IS NULL OR v_iw IS NULL OR v_ih IS NULL
       OR v_iw <= 0 OR v_ih <= 0 THEN
      RETURN 0;
    END IF;
    FOR v_region IN SELECT * FROM jsonb_array_elements(v_q.expected_regions) LOOP
      v_rw := (v_region->>'w')::numeric * v_iw;
      v_rh := (v_region->>'h')::numeric * v_ih;
      v_cx := (v_region->>'x')::numeric * v_iw + v_rw / 2;
      v_cy := (v_region->>'y')::numeric * v_ih + v_rh / 2;
      v_dist := sqrt(power(v_px - v_cx, 2) + power(v_py - v_cy, 2));
      v_tol := coalesce((v_region->>'tolerance_px')::numeric, greatest(v_rw, v_rh) / 2);
      IF v_tol <= 0 THEN v_tol := 1; END IF;
      v_s := greatest(0, least(100, (1 - v_dist / (v_tol * 2)) * 100));
      IF v_s > v_best THEN v_best := v_s; END IF;
    END LOOP;
    RETURN round(v_best);
  END IF;

  -- free_text_socratic (and anything not objectively markable) → not scorable.
  RETURN NULL;
END; $fn$;

-- No client calls this directly: it is only ever called from inside fn_pde_submit_stage and fn_pde_mark_clinical_answer, which are SECURITY DEFINER and so run it as the owner.
-- Locking it to the owner keeps it off PostgREST entirely.
REVOKE EXECUTE ON FUNCTION public.fn_pde_score_clinical_answer(uuid, jsonb) FROM anon, authenticated, PUBLIC;

-- ----------------------------------------------------------------------------
-- 3. Mark one objective answer — learner-callable, verdict only
-- ----------------------------------------------------------------------------
-- The existing fn_pde_mark_objective stays exactly as it is for mcq_warmup:
-- it returns correct_id so the MCQ renderer can highlight the right option, and
-- changing that would change behaviour a learner already sees.
--
-- The three new types get their own entry point which returns a SCORE AND
-- NOTHING ELSE — no key, no exclusion rationale. With stage locking in play,
-- handing back the correct set after a failed submission would let a learner
-- re-enter it and walk through the gate. The key and the exclusion rationale
-- are released after the attempt is finished, by
-- fn_pde_get_answer_key_for_review, which is where post-attempt review belongs.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_pde_mark_clinical_answer(p_question_id uuid, p_answer jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_uid uuid := auth.uid(); v_assessment_id uuid; v_type text; v_access jsonb; v_score numeric;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE='42501'; END IF;
  SELECT assessment_id, question_type INTO v_assessment_id, v_type
  FROM pde_assessment_questions WHERE id = p_question_id;
  IF v_assessment_id IS NULL THEN RAISE EXCEPTION 'question not found' USING ERRCODE='P0002'; END IF;

  v_access := fn_pde_case_access(v_assessment_id);
  IF NOT (v_access->>'allowed')::boolean THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE='42501';
  END IF;

  v_score := fn_pde_score_clinical_answer(p_question_id, coalesce(p_answer, '{}'::jsonb));
  RETURN jsonb_build_object(
    'question_id', p_question_id,
    'question_type', v_type,
    'score_pct', v_score,
    'is_correct', CASE WHEN v_score IS NULL THEN NULL ELSE v_score >= 100 END
  );
END; $fn$;

REVOKE EXECUTE ON FUNCTION public.fn_pde_mark_clinical_answer(uuid, jsonb) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_pde_mark_clinical_answer(uuid, jsonb) TO authenticated;

-- ----------------------------------------------------------------------------
-- 4. Question delivery — widen the type list, keep the stage gate
-- ----------------------------------------------------------------------------
-- Replaces the body created in 20270115090000. The stage-gating WHERE clause is
-- carried forward verbatim; the only differences are the six-type IN list and
-- the extra `- 'exclusion_rationale'` strip, which keeps a multi_select rubric's
-- "why D is wrong" out of the learner's payload until review.
--
-- The two migrations deliberately each define the whole function so either can
-- be read on its own; 20270115090100 is the final shape.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_pde_get_case_questions(p_assessment_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_uid uuid := auth.uid(); v_allowed boolean; v_is_staff boolean; v_attempt integer; v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE='42501'; END IF;
  SELECT is_super_admin() OR is_admin()
    OR EXISTS (SELECT 1 FROM pde_assessments a WHERE a.id=p_assessment_id AND a.created_by=v_uid)
    OR (user_has_permission('pde.faculty.view') AND EXISTS (
          SELECT 1 FROM pde_assessments a JOIN vac_courses c ON c.id=a.course_id
          WHERE a.id=p_assessment_id AND role_has_institution_access(c.institution_id)))
  INTO v_is_staff;
  SELECT v_is_staff
    OR EXISTS (SELECT 1 FROM pde_assessments a JOIN vac_enrollments e ON e.course_id=a.course_id
          WHERE a.id=p_assessment_id AND a.is_active AND a.status='published' AND e.user_id=v_uid)
  INTO v_allowed;
  IF NOT v_allowed THEN RAISE EXCEPTION 'not authorized for this case' USING ERRCODE='42501'; END IF;

  v_attempt := fn_pde_current_attempt_number(p_assessment_id, v_uid);

  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'id', q.id, 'assessment_id', q.assessment_id, 'question_type', q.question_type,
      'question_text', q.question_text, 'question_media_url', q.question_media_url,
      'points', q.points, 'order_index', q.order_index, 'finks_dimension', q.finks_dimension,
      'difficulty', q.difficulty, 'stage_id', q.stage_id,
      'options', (SELECT coalesce(jsonb_agg((elem - 'is_correct') ORDER BY ord), '[]'::jsonb)
                  FROM jsonb_array_elements(coalesce(q.options,'[]'::jsonb)) WITH ORDINALITY AS o(elem, ord)),
      'metadata', (coalesce(q.metadata,'{}'::jsonb)
                     - 'ground_truth' - 'key_concepts' - 'exclusion_rationale')
    ) ORDER BY q.order_index
  ), '[]'::jsonb) INTO v_result
  FROM pde_assessment_questions q
  WHERE q.assessment_id=p_assessment_id
    AND q.question_type IN ('free_text_socratic','mcq_warmup','image_tag',
                            'multi_select','matching','sequencing')
    AND (
      q.stage_id IS NULL
      OR v_is_staff
      OR EXISTS (
        SELECT 1 FROM pde_case_stages s
        WHERE s.id = q.stage_id
          AND (
            s.stage_order = 1
            OR EXISTS (
              SELECT 1 FROM pde_case_stages prev
              JOIN pde_case_stage_progress pr
                ON pr.stage_id = prev.id AND pr.learner_id = v_uid AND pr.attempt_number = v_attempt
              WHERE prev.assessment_id = s.assessment_id
                AND prev.stage_order = s.stage_order - 1
                AND pr.passed IS TRUE
            )
          )
      )
    );
  RETURN v_result;
END; $fn$;

REVOKE EXECUTE ON FUNCTION public.fn_pde_get_case_questions(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_pde_get_case_questions(uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- 5. Post-attempt answer key — widen the type list
-- ----------------------------------------------------------------------------
-- Same gate as before (staff / creator / a learner with a COMPLETED submission),
-- same full rows. Without this, a finished attempt on one of the new types would
-- show the learner nothing on the summary page — a silent blank, which this repo
-- treats as a failure mode of its own. stage_id rides along so review can be
-- grouped by stage.
-- ----------------------------------------------------------------------------

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
  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'id', q.id, 'assessment_id', q.assessment_id, 'order_index', q.order_index,
      'question_type', q.question_type, 'question_text', q.question_text,
      'question_media_url', q.question_media_url, 'options', q.options,
      'correct_answer', q.correct_answer, 'expected_regions', q.expected_regions,
      'stage_id', q.stage_id, 'metadata', q.metadata
    ) ORDER BY q.order_index
  ), '[]'::jsonb) INTO v_result
  FROM pde_assessment_questions q
  WHERE q.assessment_id=p_assessment_id
    AND q.question_type IN ('free_text_socratic','mcq_warmup','image_tag',
                            'multi_select','matching','sequencing');
  RETURN v_result;
END; $fn$;

REVOKE EXECUTE ON FUNCTION public.fn_pde_get_answer_key_for_review(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_pde_get_answer_key_for_review(uuid) TO authenticated;
