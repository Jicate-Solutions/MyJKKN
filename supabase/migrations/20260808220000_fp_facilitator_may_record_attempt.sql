-- Updated: 2026-08-01 - Foundation: let the Senior Learner running a cohort
-- record practice for a learner who holds no account of their own.
--
-- WHY THIS EXISTS
--   fn_fp_teaches_student() already existed and was already trusted by
--   fn_fp_can_view_student -- so a facilitator could SEE the learners in their
--   cohort but could not record an answer for one. fn_fp_record_attempt
--   authorised on can_manage OR is_own_or_guardian only, and
--   fn_fp_can_manage_student admits solely super-admins and registered
--   school_jkkn_owners. One missing predicate, and facilitator-led practice was
--   impossible.
--
--   fp_students.profile_id is NULLABLE by design: a child can exist on the
--   programme without a login. This is the write path for exactly that case.
--
-- WHY NOT WIDEN fn_fp_can_manage_student INSTEAD
--   That function also gates editing and deleting the learner record. A
--   facilitator should be able to record a practice answer, not to alter or
--   remove a child's record. Widening it would have granted both.
--
-- BODY PROVENANCE
--   Rebuilt from the LIVE production definition read via pg_get_functiondef on
--   2026-08-01, not from a repo file. A CREATE OR REPLACE assembled from a
--   stale copy has silently reverted a guard in this codebase before; the only
--   difference from production is the added predicate and its comment.
--
--   The parental-consent gate, the NULL-safe correctness computation and the
--   divide-by-zero-guarded score are all preserved exactly as they run today.

CREATE OR REPLACE FUNCTION public.fn_fp_record_attempt(p_assessment_id uuid, p_student_id uuid, p_responses jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- Authorization: caller must manage the learner, be the learner / guardian,
  -- OR be the Senior Learner who runs a cohort this learner is enrolled in.
  -- That last clause is what makes facilitator-led practice possible: a child
  -- with no account of their own cannot submit, so the person running the
  -- session submits for them. fn_fp_teaches_student is NOT a blanket grant --
  -- it resolves to fp_cohorts.resource_person_id = auth.uid() for a cohort
  -- this specific learner is enrolled in, so a facilitator reaches their own
  -- group and nobody else's.
  IF NOT (
    fn_fp_can_manage_student(p_student_id)
    OR fn_fp_is_own_or_guardian(p_student_id)
    OR fn_fp_teaches_student(p_student_id)
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
$function$;

-- Grants restated verbatim: SECURITY DEFINER, so anon must never hold EXECUTE.
REVOKE EXECUTE ON FUNCTION public.fn_fp_record_attempt(uuid, uuid, jsonb) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_fp_record_attempt(uuid, uuid, jsonb) TO authenticated;
