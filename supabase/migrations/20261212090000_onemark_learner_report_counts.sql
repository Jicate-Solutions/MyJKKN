-- OneMark Wave 3, Lane A — defect 2 from the 2026-09-12 try-out (PR #3431).
-- FILE ONLY / NOT APPLIED — the operator applies it at merge.
--
-- What was wrong, read from the LIVE function bodies on 2026-09-14:
--
--   * fn_onemark_learner_report emitted `student_id` and `exam_definition_id`
--     as bare uuids. The report screen reads `student.name` and `exam.name`,
--     so the header showed "Name not recorded" for a learner whose
--     fp_students.full_name is set.
--
--   * Its `progress` key is fn_fp_student_progress's mastery snapshot —
--     `current_topics[{topic_id, mastery_score, attempts_count}]` read from
--     fp_student_weakness. That table is written ONLY by
--     fn_fp_recompute_weakness, which the Foundation practice runner calls and
--     OneMark's finalize route never does; the try-out learner has zero rows
--     in it. And even a fed snapshot carries no `attempted` / `correct`, so the
--     tiles read 0 / 0 / — beside a sittings list that plainly said 2 / 5.
--
-- This replaces the function. Every key it emitted is still emitted with the
-- same meaning (`progress` keeps the whole mastery snapshot; `vault` and
-- `sittings` are untouched). Added:
--
--   student   { id, full_name, grade }            from fp_students
--   exam      { id, config_key, display_name }    from exam_definitions
--   progress  + attempted / correct / skipped     counted from fp_responses on
--             this learner's SUBMITTED OneMark attempts (mode set) in this
--             subject — the same population the `sittings` list shows, so the
--             tiles and the list agree. A served question the learner skipped
--             counts as attempted (it is in the sitting's "out of"), and is
--             also reported separately as `skipped`.
--   topics[]  { topic_id, label, total, correct, skipped } — the same rows
--             grouped by fp_items.topic_id, labelled from
--             cdc_exam_syllabus_topics.display_name, in syllabus order.
--             A response whose item has no topic counts in the totals and in
--             no unit.
--
-- Reads only. The caller check (fn_fp_can_view_student) is unchanged, and the
-- function keeps the ACL it already has — CREATE OR REPLACE preserves grants.
-- Rehearsed on production as plain SELECTs on 2026-09-14 against the try-out
-- learner: attempted 5, correct 2, skipped 1, one unit "Unit 1: Electrostatics"
-- 2 / 5 — matching the 2 / 5 sitting the screen already listed.

CREATE OR REPLACE FUNCTION public.fn_onemark_learner_report(p_student_id uuid, p_exam_definition_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  IF p_student_id IS NULL OR p_exam_definition_id IS NULL THEN
    RAISE EXCEPTION 'fn_onemark_learner_report: student_id and exam_definition_id are required';
  END IF;
  IF NOT public.fn_fp_can_view_student(p_student_id) THEN
    RAISE EXCEPTION 'fn_onemark_learner_report: not authorized for learner %', p_student_id
      USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'student_id',         p_student_id,
    'exam_definition_id', p_exam_definition_id,
    'student', (
      SELECT jsonb_build_object('id', s.id, 'full_name', s.full_name, 'grade', s.grade)
        FROM public.fp_students s
       WHERE s.id = p_student_id),
    'exam', (
      SELECT jsonb_build_object('id', d.id, 'config_key', d.config_key, 'display_name', d.display_name)
        FROM public.exam_definitions d
       WHERE d.id = p_exam_definition_id),
    -- The mastery snapshot as before, plus the honest counts. `||` on jsonb
    -- objects merges keys; the snapshot never emits these three, so nothing is
    -- overwritten.
    'progress',
      COALESCE(public.fn_fp_student_progress(p_student_id, p_exam_definition_id), '{}'::jsonb)
      || (
        SELECT jsonb_build_object(
                 'attempted', count(*),
                 'correct',   count(*) FILTER (WHERE r.is_correct IS TRUE),
                 'skipped',   count(*) FILTER (WHERE r.skipped IS TRUE))
          FROM public.fp_responses   r
          JOIN public.fp_attempts    a ON a.id = r.attempt_id
          JOIN public.fp_assessments x ON x.id = a.assessment_id
         WHERE a.student_id         = p_student_id
           AND x.exam_definition_id = p_exam_definition_id
           AND a.mode IS NOT NULL
           AND a.status = 'submitted'),
    'topics', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'topic_id', t.topic_id,
               'label',    t.label,
               'total',    t.total,
               'correct',  t.correct,
               'skipped',  t.skipped) ORDER BY t.sort_order NULLS LAST, t.label), '[]'::jsonb)
        FROM (
          SELECT i.topic_id,
                 COALESCE(st.display_name, i.topic_id::text) AS label,
                 st.sort_order,
                 count(*)                                     AS total,
                 count(*) FILTER (WHERE r.is_correct IS TRUE) AS correct,
                 count(*) FILTER (WHERE r.skipped IS TRUE)    AS skipped
            FROM public.fp_responses   r
            JOIN public.fp_attempts    a  ON a.id  = r.attempt_id
            JOIN public.fp_assessments x  ON x.id  = a.assessment_id
            JOIN public.fp_items       i  ON i.id  = r.item_id
            LEFT JOIN public.cdc_exam_syllabus_topics st ON st.id = i.topic_id
           WHERE a.student_id         = p_student_id
             AND x.exam_definition_id = p_exam_definition_id
             AND a.mode IS NOT NULL
             AND a.status = 'submitted'
             AND i.topic_id IS NOT NULL
           GROUP BY i.topic_id, st.display_name, st.sort_order) t),
    'vault', (
      SELECT jsonb_build_object(
               'active',     count(*) FILTER (WHERE v.status = 'active'),
               'mastered',   count(*) FILTER (WHERE v.status = 'mastered'),
               'due_now',    count(*) FILTER (WHERE v.status = 'active'
                                              AND (v.next_eligible_at IS NULL OR v.next_eligible_at <= now())),
               'next_due_at', min(v.next_eligible_at) FILTER (WHERE v.status = 'active'
                                              AND v.next_eligible_at > now()))
        FROM public.onemark_mistake_vault v
        JOIN public.fp_items i ON i.id = v.item_id
       WHERE v.student_id = p_student_id
         AND i.exam_definition_id = p_exam_definition_id),
    'sittings', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'attempt_id',   s.id,
               'assessment_id', s.assessment_id,
               'title',        s.title,
               'mode',         s.mode,
               'status',       s.status,
               'score',        s.score,
               'out_of',       s.out_of,
               'started_at',   s.started_at,
               'submitted_at', s.submitted_at) ORDER BY s.ord), '[]'::jsonb)
        FROM (
          SELECT a.id, a.assessment_id, x.title, a.mode, a.status, a.score,
                 a.started_at, a.submitted_at,
                 (SELECT count(*) FROM public.fp_responses r WHERE r.attempt_id = a.id) AS out_of,
                 row_number() OVER (ORDER BY COALESCE(a.submitted_at, a.started_at) DESC) AS ord
            FROM public.fp_attempts a
            JOIN public.fp_assessments x ON x.id = a.assessment_id
           WHERE a.student_id = p_student_id
             AND x.exam_definition_id = p_exam_definition_id
             AND a.mode IS NOT NULL
           ORDER BY COALESCE(a.submitted_at, a.started_at) DESC
           LIMIT 10) s)
  ) INTO v_result;

  RETURN v_result;
END;
$function$;
