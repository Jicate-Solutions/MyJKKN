-- Migration: Foundation & Competitive-Exam Programme — core RPCs
-- Created: 2026-07-06
-- Purpose: attempt recording, weakness recompute, revision-plan generation, progress read.
-- All functions: SECURITY DEFINER, SET search_path = public, locked from anon/PUBLIC,
--   granted to authenticated. Idempotent (CREATE OR REPLACE).
-- Reuses existing SECURITY DEFINER helpers (do NOT recreate):
--   fn_fp_can_manage_student(uuid), fn_fp_is_own_or_guardian(uuid),
--   fn_fp_can_view_student(uuid), fn_get_policy_bool(text,boolean,uuid), is_super_admin().
--
-- answer/chosen comparison contract (documented in NOTES.md — no live rows existed at build):
--   fp_items.answer is jsonb. If it is an OBJECT carrying a "correct" key
--   (e.g. {"correct":"b"}) the stored key value is compared; otherwise the raw
--   answer jsonb is compared against the submitted chosen jsonb via IS NOT DISTINCT FROM.
--   This transparently handles scalar ("b"), array (["b","d"]) and wrapped answers.

-- =====================================================================
-- 1. fn_fp_record_attempt
-- =====================================================================
CREATE OR REPLACE FUNCTION public.fn_fp_record_attempt(
  p_assessment_id uuid,
  p_student_id    uuid,
  p_responses     jsonb
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_attempt_id    uuid;
  v_elem          jsonb;
  v_item_id       uuid;
  v_chosen        jsonb;
  v_time_ms       integer;
  v_item_answer   jsonb;
  v_norm_answer   jsonb;
  v_is_correct    boolean;
  v_total         integer := 0;
  v_correct       integer := 0;
  v_consent_at    timestamptz;
BEGIN
  IF p_assessment_id IS NULL OR p_student_id IS NULL THEN
    RAISE EXCEPTION 'fn_fp_record_attempt: assessment_id and student_id are required';
  END IF;

  -- Authorization: caller must manage the student, or be the student / guardian.
  IF NOT (
    fn_fp_can_manage_student(p_student_id)
    OR fn_fp_is_own_or_guardian(p_student_id)
  ) THEN
    RAISE EXCEPTION 'fn_fp_record_attempt: not authorized for student %', p_student_id
      USING ERRCODE = '42501';
  END IF;

  -- Assessment must exist (defense against dangling FK / typo).
  IF NOT EXISTS (SELECT 1 FROM fp_assessments WHERE id = p_assessment_id) THEN
    RAISE EXCEPTION 'fn_fp_record_attempt: assessment % not found', p_assessment_id;
  END IF;

  -- Parental-consent gate (only enforced when the policy flag is ON).
  IF fn_get_policy_bool('foundation.require_parental_consent', false, NULL) THEN
    SELECT parental_consent_at INTO v_consent_at
      FROM fp_students WHERE id = p_student_id;
    IF v_consent_at IS NULL THEN
      RAISE EXCEPTION 'fn_fp_record_attempt: parental consent required for student %', p_student_id
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Create the submitted attempt row.
  INSERT INTO fp_attempts (student_id, assessment_id, status, submitted_at)
  VALUES (p_student_id, p_assessment_id, 'submitted', now())
  RETURNING id INTO v_attempt_id;

  -- Persist each response, computing correctness item-by-item.
  IF p_responses IS NOT NULL AND jsonb_typeof(p_responses) = 'array' THEN
    FOR v_elem IN SELECT * FROM jsonb_array_elements(p_responses)
    LOOP
      v_item_id := NULLIF(v_elem->>'item_id', '')::uuid;
      IF v_item_id IS NULL THEN
        CONTINUE;  -- skip malformed entries
      END IF;

      v_chosen  := v_elem->'chosen';                       -- may be jsonb null
      v_time_ms := NULLIF(v_elem->>'time_ms', '')::integer;

      SELECT answer INTO v_item_answer
        FROM fp_items WHERE id = v_item_id;

      IF v_item_answer IS NULL THEN
        v_is_correct := NULL;                              -- unknown / missing item
      ELSE
        IF jsonb_typeof(v_item_answer) = 'object' AND (v_item_answer ? 'correct') THEN
          v_norm_answer := v_item_answer->'correct';
        ELSE
          v_norm_answer := v_item_answer;
        END IF;
        v_is_correct := (v_chosen IS NOT DISTINCT FROM v_norm_answer);
      END IF;

      INSERT INTO fp_responses (attempt_id, item_id, chosen, is_correct, time_ms)
      VALUES (v_attempt_id, v_item_id, v_chosen, v_is_correct, v_time_ms)
      ON CONFLICT (attempt_id, item_id)
      DO UPDATE SET chosen     = EXCLUDED.chosen,
                    is_correct = EXCLUDED.is_correct,
                    time_ms    = EXCLUDED.time_ms;

      v_total := v_total + 1;
      IF v_is_correct IS TRUE THEN
        v_correct := v_correct + 1;
      END IF;
    END LOOP;
  END IF;

  -- Score as a 0..1 ratio (guard divide-by-zero).
  UPDATE fp_attempts
     SET score = CASE WHEN v_total > 0
                      THEN round(v_correct::numeric / v_total::numeric, 4)
                      ELSE 0 END
   WHERE id = v_attempt_id;

  RETURN v_attempt_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_fp_record_attempt(uuid, uuid, jsonb) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_fp_record_attempt(uuid, uuid, jsonb) TO authenticated;


-- =====================================================================
-- 2. fn_fp_recompute_weakness
-- =====================================================================
CREATE OR REPLACE FUNCTION public.fn_fp_recompute_weakness(
  p_student_id        uuid,
  p_exam_definition_id uuid
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_student_id IS NULL OR p_exam_definition_id IS NULL THEN
    RAISE EXCEPTION 'fn_fp_recompute_weakness: student_id and exam_definition_id are required';
  END IF;

  -- Authorization: caller must at least be able to view this student's data.
  IF NOT fn_fp_can_view_student(p_student_id) THEN
    RAISE EXCEPTION 'fn_fp_recompute_weakness: not authorized for student %', p_student_id
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO fp_student_weakness AS w
        (student_id, exam_definition_id, topic_id, mastery_score, attempts_count)
  SELECT p_student_id,
         p_exam_definition_id,
         i.topic_id,
         avg((r.is_correct IS TRUE)::int)::numeric AS mastery_score,
         count(*)                                  AS attempts_count
    FROM fp_responses r
    JOIN fp_attempts  a ON a.id = r.attempt_id
    JOIN fp_items     i ON i.id = r.item_id
   WHERE a.student_id         = p_student_id
     AND i.exam_definition_id = p_exam_definition_id
     AND i.topic_id IS NOT NULL
   GROUP BY i.topic_id
  ON CONFLICT (student_id, exam_definition_id, topic_id)
  DO UPDATE SET mastery_score  = EXCLUDED.mastery_score,
                attempts_count = EXCLUDED.attempts_count,
                updated_at     = now();
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_fp_recompute_weakness(uuid, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_fp_recompute_weakness(uuid, uuid) TO authenticated;


-- =====================================================================
-- 3. fn_fp_generate_revision_plan
-- =====================================================================
CREATE OR REPLACE FUNCTION public.fn_fp_generate_revision_plan(
  p_student_id         uuid,
  p_exam_definition_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan_id uuid;
  v_plan    jsonb;
BEGIN
  IF p_student_id IS NULL OR p_exam_definition_id IS NULL THEN
    RAISE EXCEPTION 'fn_fp_generate_revision_plan: student_id and exam_definition_id are required';
  END IF;

  -- Authorization: caller must at least be able to view this student's data.
  IF NOT fn_fp_can_view_student(p_student_id) THEN
    RAISE EXCEPTION 'fn_fp_generate_revision_plan: not authorized for student %', p_student_id
      USING ERRCODE = '42501';
  END IF;

  -- Build a plan over the weakest topics, attaching recommended active items.
  SELECT jsonb_build_object(
           'topics',
           COALESCE(jsonb_agg(
             jsonb_build_object(
               'topic_id',      t.topic_id,
               'mastery_score', t.mastery_score,
               'attempts_count', t.attempts_count,
               'recommended_item_ids', COALESCE((
                 SELECT jsonb_agg(x.id ORDER BY x.difficulty, x.id)
                   FROM (
                     SELECT i.id, i.difficulty
                       FROM fp_items i
                      WHERE i.exam_definition_id = p_exam_definition_id
                        AND i.topic_id           = t.topic_id
                        AND i.is_active
                      ORDER BY i.difficulty, i.id
                      LIMIT 10
                   ) x
                 ), '[]'::jsonb)
             )
             ORDER BY t.mastery_score NULLS FIRST, t.attempts_count DESC
           ), '[]'::jsonb)
         )
    INTO v_plan
    FROM (
      SELECT w.topic_id, w.mastery_score, w.attempts_count
        FROM fp_student_weakness w
       WHERE w.student_id         = p_student_id
         AND w.exam_definition_id = p_exam_definition_id
       ORDER BY w.mastery_score NULLS FIRST, w.attempts_count DESC
       LIMIT 5
    ) t;

  v_plan := COALESCE(v_plan, jsonb_build_object('topics', '[]'::jsonb))
            || jsonb_build_object('generated_for', 'weakest_topics');

  INSERT INTO fp_revision_plans (student_id, exam_definition_id, plan, status)
  VALUES (p_student_id, p_exam_definition_id, v_plan, 'active')
  RETURNING id INTO v_plan_id;

  RETURN v_plan_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_fp_generate_revision_plan(uuid, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_fp_generate_revision_plan(uuid, uuid) TO authenticated;


-- =====================================================================
-- 4. fn_fp_student_progress  (read-only)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.fn_fp_student_progress(
  p_student_id         uuid,
  p_exam_definition_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current       jsonb;
  v_current_avg   numeric;
  v_baseline      jsonb;
  v_baseline_at   timestamptz;
BEGIN
  IF p_student_id IS NULL OR p_exam_definition_id IS NULL THEN
    RAISE EXCEPTION 'fn_fp_student_progress: student_id and exam_definition_id are required';
  END IF;

  -- Authorization: caller must be able to view this student's data.
  IF NOT fn_fp_can_view_student(p_student_id) THEN
    RAISE EXCEPTION 'fn_fp_student_progress: not authorized for student %', p_student_id
      USING ERRCODE = '42501';
  END IF;

  -- Current per-topic mastery.
  SELECT COALESCE(jsonb_agg(
           jsonb_build_object(
             'topic_id',       w.topic_id,
             'mastery_score',  w.mastery_score,
             'attempts_count', w.attempts_count
           ) ORDER BY w.mastery_score NULLS FIRST
         ), '[]'::jsonb),
         avg(w.mastery_score)
    INTO v_current, v_current_avg
    FROM fp_student_weakness w
   WHERE w.student_id         = p_student_id
     AND w.exam_definition_id = p_exam_definition_id;

  -- Latest baseline snapshot for this exam.
  SELECT b.snapshot, b.captured_at
    INTO v_baseline, v_baseline_at
    FROM fp_baselines b
   WHERE b.student_id         = p_student_id
     AND b.exam_definition_id = p_exam_definition_id
   ORDER BY b.captured_at DESC
   LIMIT 1;

  RETURN jsonb_build_object(
    'student_id',            p_student_id,
    'exam_definition_id',    p_exam_definition_id,
    'current_mastery_avg',   v_current_avg,
    'current_topics',        COALESCE(v_current, '[]'::jsonb),
    'baseline_captured_at',  v_baseline_at,
    'baseline_snapshot',     COALESCE(v_baseline, 'null'::jsonb)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_fp_student_progress(uuid, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_fp_student_progress(uuid, uuid) TO authenticated;
