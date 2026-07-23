-- =============================================================================
-- 20260625100000_scf_carryforward.sql
-- Session-Feedback Loop — gap #1 close: next-class CARRY-FORWARD confirmation.
-- Spec: specs/session-feedback-loop-close-gapclosers-2026-06-25.md (PR B)
-- Updated: 2026-06-25
-- =============================================================================
-- Turns the passive "lift" metric into an explicit re-ask: when a learner opens
-- the feedback dialog for a pending session, surface the LAST time they took the
-- SAME course and flagged trouble (understood <= 2, or left a checklist item
-- unchecked) so they can confirm whether it is better this time.
--
-- IDENTITY (mirrors fn_scf_pending_for_learner exactly):
--   auth.uid() == profiles.id == learners_profiles.profile_id
--   -> learners_profiles.id (v_lp) == session_feedback.student_id
--                                   == attendance_data students[].student_id
--
-- This RPC is READ-ONLY, learner-self-scoped (auth.uid()), anon-locked.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.fn_scf_carryforward_for_learner(p_lookback_days int DEFAULT 30)
RETURNS TABLE (
  timetable_id       uuid,
  period_id          text,
  course_code        text,
  course_name        text,
  prior_session_date date,
  prior_understood   smallint,
  prior_unmet_items  text[]
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_lp uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_scf_carryforward_for_learner: not authenticated'; END IF;
  SELECT lp.id INTO v_lp FROM public.learners_profiles lp WHERE lp.profile_id = auth.uid();
  IF v_lp IS NULL THEN RETURN; END IF;

  RETURN QUERY
  -- 1) The caller's CURRENT pending sessions (Present-in-blob, no feedback row yet).
  --    Same predicate as fn_scf_pending_for_learner, restricted to rows carrying a course_code.
  WITH pending AS (
    SELECT sa.attendance_date,
           sa.timetable_id                          AS timetable_id,
           period.key                               AS period_id,
           period.value ->> 'course_code'           AS course_code,
           period.value ->> 'course_name'           AS course_name
    FROM public.student_attendance sa,
         jsonb_each(sa.attendance_data) AS period
    WHERE sa.attendance_date >= (CURRENT_DATE - p_lookback_days)
      AND (period.value ->> 'course_code') IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(period.value -> 'students') st
        WHERE (st ->> 'student_id')::uuid = v_lp AND st ->> 'status' = 'Present'
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.session_feedback f
        WHERE f.student_id = v_lp
          AND f.attendance_date = sa.attendance_date
          AND f.period_id = period.key
      )
  ),
  -- 2) The caller's PRIOR flagged feedback rows for those same courses: rated
  --    understood <= 2, OR left at least one active checklist item false/missing.
  --    unmet = active config item_keys that are NOT true in the row's checklist.
  prior AS (
    SELECT f.course_code,
           f.course_name,
           f.attendance_date AS prior_session_date,
           f.understood      AS prior_understood,
           ARRAY(
             SELECT c.item_key
             FROM public.session_feedback_checklist_config c
             WHERE c.is_active = true
               AND (c.institution_id IS NULL OR c.institution_id = f.institution_id)
               AND COALESCE((f.checklist ->> c.item_key)::boolean, false) = false
             ORDER BY c.sort_order
           ) AS unmet_items,
           ROW_NUMBER() OVER (
             PARTITION BY f.course_code
             ORDER BY f.attendance_date DESC, f.created_at DESC
           ) AS rn
    FROM public.session_feedback f
    WHERE f.student_id = v_lp
      AND f.course_code IS NOT NULL
  )
  SELECT DISTINCT ON (p.timetable_id, p.period_id, p.course_code)
         p.timetable_id::uuid                       AS timetable_id,
         p.period_id::text                          AS period_id,
         p.course_code::text                        AS course_code,
         COALESCE(p.course_name, pr.course_name)::text AS course_name,
         pr.prior_session_date::date                AS prior_session_date,
         pr.prior_understood::smallint              AS prior_understood,
         pr.unmet_items::text[]                     AS prior_unmet_items
  FROM pending p
  JOIN prior pr
    ON pr.course_code = p.course_code
   AND pr.rn = 1
   AND pr.prior_session_date < p.attendance_date
   AND (pr.prior_understood <= 2 OR cardinality(pr.unmet_items) > 0)
  ORDER BY p.timetable_id, p.period_id, p.course_code, p.attendance_date DESC;
END;
$$;

COMMENT ON FUNCTION public.fn_scf_carryforward_for_learner(int) IS
  'Next-class carry-forward: for the calling learner''s pending sessions, returns the most recent PRIOR session of the same course where they flagged trouble (understood <= 2 or left a checklist item unchecked), so the feedback dialog can re-ask "better this time?". Learner-self-scoped via auth.uid(); read-only; anon-locked. Spec: specs/session-feedback-loop-close-gapclosers-2026-06-25.md';

REVOKE EXECUTE ON FUNCTION public.fn_scf_carryforward_for_learner(int) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_carryforward_for_learner(int) TO authenticated;
