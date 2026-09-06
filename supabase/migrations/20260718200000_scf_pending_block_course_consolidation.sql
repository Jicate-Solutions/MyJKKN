-- =====================================================================
-- SCF: consolidate "pending feedback" across sibling periods of a
-- block-scheduled course (fix for BUG-004641 / BUG-004647)
-- Date: 2026-07-18
-- Cluster: 904b8d2f (Groups tab) — fixability verdict traced the cause;
-- the write runner correctly refused (DB-function change = human path).
--
-- DEFECT: fn_scf_pending_for_learner emits one pending row PER PERIOD
-- KEY with feedback matched per period_id. Block-scheduled courses
-- (e.g. PROJECT WORK: 2-4 periods/day) therefore keep showing "pending"
-- after the learner submits once — live data shows reporters grinding
-- through 4 identical feedback submissions per day.
--
-- FIX: one feedback row for the same (student_id, attendance_date,
-- course_id) satisfies every sibling period of that course that day.
-- Single-period courses are unchanged (course match ≡ period match);
-- periods with no course_id keep the exact-period behavior.
-- Body otherwise verbatim from the live def (pg_get_functiondef,
-- checked 2026-07-18).
-- =====================================================================

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
    AND EXISTS (
      SELECT 1 FROM jsonb_array_elements(period.value -> 'students') st
      WHERE (st ->> 'student_id')::uuid = v_lp AND st ->> 'status' = 'Present'
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

-- Re-assert posture for the replaced SECURITY DEFINER function (anon-lock
-- CI gate scans the migration diff; CREATE OR REPLACE preserves grants).
REVOKE EXECUTE ON FUNCTION public.fn_scf_pending_for_learner(integer) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_pending_for_learner(integer) TO authenticated, service_role;
