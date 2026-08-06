-- =====================================================================
-- 20260722062012 — Guard fn_scf_submit_feedback's Present-check ::uuid cast
-- =====================================================================
-- BACKFILL (2026-07-23): this migration was applied DIRECTLY to production on
-- 2026-07-22 (ledger versions 20260722053214 + 20260722062012) but its file was
-- never committed — the repo's 20260709000100 still carried the UNGUARDED cast,
-- so source disagreed with prod. This file makes the repo match the live
-- function; it is idempotent (CREATE OR REPLACE) and already applied on prod, so
-- re-running it is a no-op.
--
-- THE BUG (diagnosed from a 10-report duplicate group, seed BUG-004715, reports
-- 2026-07-13..17): the Present-check cast EVERY roster student_id in the period
-- JSONB blob to ::uuid before the equality filter narrowed rows. A single
-- malformed/blank student_id anywhere in that session's roster raised Postgres
-- 22P02 and aborted the submit RPC for EVERY learner confirming that class —
-- surfacing to learners as "couldn't submit feedback / marked attendance but it
-- failed". Four sibling SCF functions (fn_scf_confirmation_rollup,
-- fn_scf_nudge_pending_learners, fn_scf_effective_attendance,
-- fn_scf_faculty_completion) already carried the correct regex-CASE guard; this
-- brings fn_scf_submit_feedback in line: malformed -> NULL -> excluded, no throw.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.fn_scf_submit_feedback(p_attendance_date date, p_timetable_id uuid, p_period_id text, p_understood smallint, p_checklist jsonb DEFAULT '{}'::jsonb, p_free_text text DEFAULT NULL::text, p_source text DEFAULT 'async'::text)
 RETURNS session_feedback
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_lp       uuid;
  v_period   jsonb;
  v_present  boolean;
  v_inst     uuid;
  v_src      text;
  v_row      public.session_feedback;
  v_window_hours integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'fn_scf_submit_feedback: not authenticated';
  END IF;
  IF p_understood IS NULL OR p_understood < 1 OR p_understood > 5 THEN
    RAISE EXCEPTION 'fn_scf_submit_feedback: understood must be 1..5';
  END IF;
  v_src := COALESCE(p_source, 'async');
  IF v_src NOT IN ('async','live_poll') THEN
    RAISE EXCEPTION 'fn_scf_submit_feedback: source must be async|live_poll';
  END IF;

  SELECT lp.id INTO v_lp FROM public.learners_profiles lp WHERE lp.profile_id = auth.uid();
  IF v_lp IS NULL THEN
    RAISE EXCEPTION 'fn_scf_submit_feedback: caller is not a learner';
  END IF;

  SELECT sa.institution_id, sa.attendance_data -> p_period_id
    INTO v_inst, v_period
  FROM public.student_attendance sa
  WHERE sa.timetable_id = p_timetable_id
    AND sa.attendance_date = p_attendance_date
    AND sa.attendance_data ? p_period_id
  LIMIT 1;

  IF v_period IS NULL THEN
    RAISE EXCEPTION 'fn_scf_submit_feedback: no such session (timetable/date/period)';
  END IF;

  v_window_hours := public.fn_get_policy_int('session_feedback.window_hours', 48, v_inst);
  IF now() > (p_attendance_date::timestamp AT TIME ZONE 'Asia/Kolkata')
             + make_interval(hours => v_window_hours) THEN
    RAISE EXCEPTION 'The feedback window for this class has closed — feedback can be given up to % hours after the class day.', v_window_hours;
  END IF;

  -- Guard the ::uuid cast with a CASE so it can NEVER run on a non-UUID (guaranteed
  -- order): a malformed/empty roster student_id would otherwise raise 22P02 and
  -- abort the submit for EVERY learner in this class. Malformed -> NULL -> excluded.
  SELECT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_period -> 'students') st
    WHERE CASE
            WHEN (st ->> 'student_id') ~
                 '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
            THEN (st ->> 'student_id')::uuid END = v_lp
      AND st ->> 'status' = 'Present'
  ) INTO v_present;

  IF NOT v_present THEN
    RAISE EXCEPTION 'fn_scf_submit_feedback: caller was not marked Present in this session';
  END IF;

  IF v_src = 'live_poll' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.scf_live_pulse lp
      WHERE lp.timetable_id = p_timetable_id
        AND lp.attendance_date = p_attendance_date
        AND lp.period_id = p_period_id
        AND lp.is_open = true
        AND lp.auto_close_at > now()
    ) THEN
      v_src := 'async';
    END IF;
  END IF;

  INSERT INTO public.session_feedback (
    institution_id, student_id, attendance_date, timetable_id, period_id,
    section_id, course_id, course_code, course_name, faculty_id, faculty_email,
    understood, checklist, free_text, source
  )
  VALUES (
    v_inst, v_lp, p_attendance_date, p_timetable_id, p_period_id,
    NULLIF(v_period ->> 'section_id','')::uuid,
    NULLIF(v_period ->> 'course_id','')::uuid,
    v_period ->> 'course_code',
    v_period ->> 'course_name',
    NULLIF(v_period -> 'assigned_faculty' ->> 'faculty_id','')::uuid,
    v_period -> 'assigned_faculty' ->> 'faculty_email',
    p_understood, COALESCE(p_checklist,'{}'::jsonb), p_free_text, v_src
  )
  ON CONFLICT (student_id, attendance_date, period_id) DO UPDATE SET
    understood = EXCLUDED.understood,
    checklist  = EXCLUDED.checklist,
    free_text  = EXCLUDED.free_text,
    source     = EXCLUDED.source,
    updated_at = now()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_scf_submit_feedback(date, uuid, text, smallint, jsonb, text, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_submit_feedback(date, uuid, text, smallint, jsonb, text, text) TO authenticated;

