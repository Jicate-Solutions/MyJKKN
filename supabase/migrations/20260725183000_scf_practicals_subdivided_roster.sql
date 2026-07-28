-- ============================================================================
-- SCF practicals fix — the learner-side feedback path now sees SUBDIVIDED
-- (practical / lab) rosters, and every roster cast is crash-guarded.
-- Updated: 2026-07-25 — Added groups[].students[] traversal to the three
-- learner-facing SCF functions via one shared helper, and extended the
-- 2026-07-22 regex-CASE ::uuid guard to the two functions that lacked it.
--
-- WHY
-- A subdivided period — which is how a practical/lab session is marked
-- (subdivision_type defaults to 'practical') — writes its roster into
-- groups[].students[] and leaves the top-level students[] array EMPTY. Every
-- learner-facing SCF function tested Present status against that empty
-- top-level array only, so:
--   * fn_scf_pending_for_learner never listed a practical as pending — the
--     learner saw "no feedback option available";
--   * fn_scf_submit_feedback rejected any submit that got through with
--     "caller was not marked Present in this session";
--   * fn_scf_confirmation_status omitted practicals from the learner's own
--     list of attended sessions.
-- Theory sessions were never affected, because they are not subdivided. That
-- asymmetry is why this family of reports was long read as a perception
-- problem rather than a functional defect.
--
-- SCALE (measured on production, 2026-07-25)
-- 302 subdivided periods exist, spanning 2025-11-25 -> 2026-07-24, and ALL 302
-- have an empty top-level roster — so no practical has been open to feedback
-- for eight months. For a single sample learner, a 30-day pending scan returns
-- 52 sessions before this change and 65 after: 13 practicals that were
-- invisible to them.
--
-- PRIOR ART
-- The identical blind spot was fixed for the attendance REPORT path in PR
-- #1865 by the TypeScript helper slotStudents() in
-- lib/services/academic/attendance-report-service.ts (faculty incident
-- 2026-07-06/07). fn_attendance_slot_students below is that helper's SQL twin,
-- so the database and the service layer share one definition of "the roster
-- for this slot".
--
-- THE CAST GUARD (why it is part of THIS migration, not a follow-up)
-- Migration 20260722062012 wrapped the student_id ::uuid cast in
-- fn_scf_submit_feedback in a regex-CASE, because an unguarded cast on a
-- malformed roster id raises 22P02 and aborts the call for EVERY learner in
-- that session — not just the malformed row. fn_scf_pending_for_learner and
-- fn_scf_confirmation_status still cast unguarded. Reading group rosters
-- widens what those two casts see, so this migration is what would expose
-- them; the guard therefore ships here, ahead of any apply. The construct is
-- copied verbatim from fn_scf_submit_feedback so all three functions read
-- identically. Production data is clean today (0 malformed across 16,537
-- group-roster rows and 1,042,480 top-level rows) — this is prophylactic, and
-- it is proven by injecting a synthetic malformed id in a rolled-back
-- transaction.
--
-- SCOPE
-- Exactly the three learner-facing functions named by the diagnosis, plus the
-- shared helper. Other readers of student_attendance.attendance_data are NOT
-- touched here; a wider sweep is tracked separately.
--
-- SAFETY
-- Each replaced function is SECURITY DEFINER, so its anon lock is re-asserted
-- in this same migration (the check-secdef-anon-revoke CI gate treats a
-- CREATE OR REPLACE as a new function). All three are learner-facing, so they
-- are granted to `authenticated` — never service_role.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Shared helper: the effective roster for one attendance slot, either shape.
-- Pure (no table access), IMMUTABLE, SECURITY INVOKER.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_attendance_slot_students(p_period jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $function$
  -- Mirrors slotStudents() in attendance-report-service.ts (PR #1865):
  -- a normal slot stores { students: [...] }; a subdivided practical/lab slot
  -- stores { groups: [{ students: [...] }, ...] } with an EMPTY top-level
  -- students[]. Returns the real roster for both, and NEVER returns NULL.
  SELECT CASE
    WHEN jsonb_typeof(p_period -> 'students') = 'array'
         AND jsonb_array_length(p_period -> 'students') > 0
      THEN p_period -> 'students'
    WHEN jsonb_typeof(p_period -> 'groups') = 'array'
      THEN COALESCE(
             (SELECT jsonb_agg(st)
                FROM jsonb_array_elements(p_period -> 'groups') g,
                     jsonb_array_elements(
                       CASE WHEN jsonb_typeof(g -> 'students') = 'array'
                            THEN g -> 'students'
                            ELSE '[]'::jsonb END) st),
             '[]'::jsonb)
    ELSE COALESCE(
           CASE WHEN jsonb_typeof(p_period -> 'students') = 'array'
                THEN p_period -> 'students' END,
           '[]'::jsonb)
  END;
$function$;

COMMENT ON FUNCTION public.fn_attendance_slot_students(jsonb) IS
  'Effective roster for one student_attendance.attendance_data slot. Returns top-level students[] when non-empty, otherwise the flattened groups[].students[] of a subdivided practical/lab slot. Never NULL. SQL twin of slotStudents() in attendance-report-service.ts (PR #1865).';

REVOKE EXECUTE ON FUNCTION public.fn_attendance_slot_students(jsonb) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_attendance_slot_students(jsonb) TO authenticated;

-- ----------------------------------------------------------------------------
-- fn_scf_pending_for_learner — a practical now appears in the pending list.
-- Cast guard ADDED here (was unguarded); construct copied from
-- fn_scf_submit_feedback / migration 20260722062012.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_scf_pending_for_learner(p_lookback_days integer DEFAULT 30)
 RETURNS TABLE(attendance_date date, timetable_id uuid, period_id text, section_id uuid, course_id uuid, course_code text, course_name text, faculty_name text, period_name text, start_time text, end_time text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_lp uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_scf_pending_for_learner: not authenticated'; END IF;
  SELECT lp.id INTO v_lp FROM public.learners_profiles lp WHERE lp.profile_id = auth.uid();
  IF v_lp IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT sa.attendance_date, sa.timetable_id, period.key AS period_id,
         NULLIF(period.value ->> 'section_id','')::uuid AS section_id,
         NULLIF(period.value ->> 'course_id','')::uuid AS course_id,
         period.value ->> 'course_code'  AS course_code,
         period.value ->> 'course_name'  AS course_name,
         period.value -> 'assigned_faculty' ->> 'faculty_name' AS faculty_name,
         period.value ->> 'period_name'  AS period_name,
         period.value ->> 'start_time'   AS start_time,
         period.value ->> 'end_time'     AS end_time
  FROM public.student_attendance sa,
       jsonb_each(sa.attendance_data) AS period
  WHERE sa.attendance_date >= (CURRENT_DATE - p_lookback_days)
    -- Two-sided 48h window (Director, 2026-07-08): a session whose feedback
    -- window has CLOSED is no longer actionable — submission would be rejected
    -- by fn_scf_submit_feedback — so it must not appear as "pending". Same IST
    -- anchor + lever as fn_scf_faculty_completion.
    AND now() <= (sa.attendance_date::timestamp AT TIME ZONE 'Asia/Kolkata')
          + make_interval(hours => public.fn_get_policy_int(
              'session_feedback.window_hours', 48, sa.institution_id))
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
    AND EXISTS (
      SELECT 1 FROM jsonb_array_elements(
                      public.fn_attendance_slot_students(period.value)) st
      WHERE CASE
              WHEN (st ->> 'student_id') ~
                   '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
              THEN (st ->> 'student_id')::uuid END = v_lp
        AND st ->> 'status' = 'Present'
    )
    -- Block-course consolidation (2026-07-18): feedback for ANY period of the
    -- same course on the same day satisfies its sibling periods — a learner
    -- gives ONE feedback per class, not one per timetable slot. Periods with
    -- no course_id keep the original exact-period matching.
    AND NOT EXISTS (
      SELECT 1 FROM public.session_feedback f
      WHERE f.student_id = v_lp
        AND f.attendance_date = sa.attendance_date
        AND (
          f.period_id = period.key
          OR (NULLIF(period.value ->> 'course_id','') IS NOT NULL
              AND f.course_id = NULLIF(period.value ->> 'course_id','')::uuid)
        )
    )
  ORDER BY sa.attendance_date DESC, period.value ->> 'start_time';
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_scf_pending_for_learner(integer) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_pending_for_learner(integer) TO authenticated;

-- ----------------------------------------------------------------------------
-- fn_scf_submit_feedback — the Present gate now accepts a practical roster.
-- The 2026-07-22 regex-CASE ::uuid guard below is unchanged, byte for byte.
-- ----------------------------------------------------------------------------
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

-- ----------------------------------------------------------------------------
-- fn_scf_confirmation_status — practicals now count as attended sessions.
-- Cast guard ADDED here (was unguarded); construct copied from
-- fn_scf_submit_feedback / migration 20260722062012.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_scf_confirmation_status(p_from date, p_to date)
 RETURNS TABLE(attendance_date date, timetable_id uuid, period_id text, course_code text, course_name text, confirmed boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_lp uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_scf_confirmation_status: not authenticated'; END IF;
  SELECT lp.id INTO v_lp FROM public.learners_profiles lp WHERE lp.profile_id = auth.uid();
  IF v_lp IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT sa.attendance_date, sa.timetable_id, period.key,
         period.value ->> 'course_code', period.value ->> 'course_name',
         EXISTS (
           SELECT 1 FROM public.session_feedback f
           WHERE f.student_id = v_lp AND f.attendance_date = sa.attendance_date AND f.period_id = period.key
         ) AS confirmed
  FROM public.student_attendance sa,
       jsonb_each(sa.attendance_data) AS period
  WHERE sa.attendance_date BETWEEN p_from AND p_to
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
    AND EXISTS (
      SELECT 1 FROM jsonb_array_elements(
                      public.fn_attendance_slot_students(period.value)) st
      WHERE CASE
              WHEN (st ->> 'student_id') ~
                   '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
              THEN (st ->> 'student_id')::uuid END = v_lp
        AND st ->> 'status' = 'Present'
    )
  ORDER BY sa.attendance_date DESC;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_scf_confirmation_status(date, date) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_confirmation_status(date, date) TO authenticated;

