-- ============================================================================
-- SCF submit — pick the CALLER's batch row, not the most recently edited one.
-- Updated: 2026-09-15 — fn_scf_submit_feedback now orders the candidate
-- student_attendance rows by "caller is on this roster" first, then by
-- updated_at as before. Fixes groups a1b1c4ec (10 reports) + 187a51ee (2):
-- learners in a practical batch other than the last-edited one were listed as
-- pending by fn_scf_pending_for_learner (which scans every row) and then
-- refused by the submit with "caller was not marked Present in this session".
--
-- WHY THIS SHAPE
-- The RPC has no section parameter and the app cannot supply one, so the
-- function must find the right row itself. Preferring the row that carries
-- the caller changes nothing for theory sessions (one row per key) and, for
-- a caller on no row, falls back to exactly the previous order — so every
-- existing error path keeps its message. The Senior Learner resolved further down
-- (fn_attendance_slot_faculty) now comes from the caller's own batch row,
-- which is the Senior Learner who actually took that batch.
--
-- Body below is the live production definition (2026-09-15) with only the
-- ORDER BY changed; grants re-stated so a replace can never widen them.
-- ============================================================================
-- ci:allow-secdef-authenticated Learner self-service: called from the browser as the signed-in
-- learner; the body itself resolves auth.uid() to the caller's learners_profiles row and refuses
-- anyone who is not a learner, is not on the session's roster, or was not marked Present.

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
  v_faculty    jsonb;
  v_fac_email  text;
  v_fac_id     uuid;
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
  -- Updated: 2026-09-15 — prefer the row whose roster carries the CALLER.
  -- A practical/lab period is marked one student_attendance row PER BATCH
  -- (attendance-core-service keys rows by timetable + section + date), so
  -- several rows share this (timetable, date, period) key. "Most recently
  -- edited wins" picked ONE batch's roster and then tested Present against
  -- it alone, so every learner in the other batches — offered the session by
  -- fn_scf_pending_for_learner, which scans ALL rows — was refused with
  -- "caller was not marked Present in this session" (12 reports, groups
  -- a1b1c4ec + 187a51ee; 312 learners in 1,502 sessions over 30 days at the
  -- time of the fix). Same regex-CASE ::uuid guard as the Present check
  -- below: a malformed roster id must never abort the read.
  -- When no row carries the caller, the previous order still applies, so the
  -- "no such session", window and "not Present" outcomes are unchanged.
  ORDER BY
    EXISTS (
      SELECT 1 FROM jsonb_array_elements(
                      public.fn_attendance_slot_students(sa.attendance_data -> p_period_id)) st
      WHERE CASE
              WHEN (st ->> 'student_id') ~
                   '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
              THEN (st ->> 'student_id')::uuid END = v_lp
    ) DESC,
    sa.updated_at DESC, sa.id DESC
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
  -- Subdivided practical/lab periods (2026-07-25): a subdivided slot keeps
  -- its roster in groups[].students[] and leaves the top-level students[]
  -- array EMPTY, so a Present check must read the effective roster for BOTH
  -- shapes. Same semantics as slotStudents() in
  -- lib/services/academic/attendance-report-service.ts (PR #1865).
  -- The ::uuid cast carries the same regex-CASE guard as
  -- fn_scf_submit_feedback (migration 20260722062012): reading group
  -- rosters widens what this cast sees, and a malformed roster id would
  -- otherwise raise 22P02 and abort the read for EVERY learner in the
  -- session. Malformed -> NULL -> excluded.
  SELECT EXISTS (
    SELECT 1 FROM jsonb_array_elements(
                    public.fn_attendance_slot_students(v_period)) st
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

  -- Updated: 2026-08-05 — resolve the teacher through the both-shapes reader.
  -- `v_period -> 'assigned_faculty' ->> 'faculty_email'` returned NULL on the
  -- ARRAY shape, so team-taught sessions lost the teacher's identity.
  v_faculty   := public.fn_attendance_slot_faculty(v_period);
  v_fac_email := NULLIF(v_faculty ->> 'faculty_email', '');

  -- Same regex-CASE guard as the roster cast above, for the same reason and now
  -- with an extra one: reading the ARRAY shape WIDENS what this cast sees. A
  -- malformed faculty_id inside a team-taught array previously never reached
  -- the cast; it does now, and unguarded it would raise 22P02 and abort the
  -- submit for every learner in the class. Malformed -> NULL.
  v_fac_id := CASE
                WHEN (v_faculty ->> 'faculty_id') ~
                     '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
                THEN (v_faculty ->> 'faculty_id')::uuid
              END;

  -- Make the loss LOUD. A NULL written with no signal is precisely what let
  -- this run unnoticed from the table's first row (2026-06-08) to today. The
  -- submit still succeeds — the learner's answer is never thrown away for an
  -- administrative gap — but the gap now leaves a trace, and it names the shape
  -- so a reader can tell "the faculty was there and we failed to read it" from
  -- "there was no faculty in the blob".
  IF v_fac_email IS NULL AND v_fac_id IS NULL THEN
    RAISE WARNING 'fn_scf_submit_feedback: unattributed session — no faculty identity resolved (timetable=%, date=%, period=%, assigned_faculty_shape=%)',
      p_timetable_id, p_attendance_date, p_period_id,
      COALESCE(jsonb_typeof(v_period -> 'assigned_faculty'), 'key_absent');
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
    v_fac_id,
    v_fac_email,
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
