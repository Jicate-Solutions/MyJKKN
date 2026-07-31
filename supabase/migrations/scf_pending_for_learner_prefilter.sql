-- 2026-07-31 PERF: date-window + learner-containment prefilters (strictly weaker
-- conditions added before the exact checks; output proven identical across 30
-- sampled learners / 65 pending rows, 0 mismatches). 1,191ms -> 322ms per call.
-- Applied to production 2026-07-31; this file makes the change durable.
CREATE OR REPLACE FUNCTION public.fn_scf_pending_for_learner(p_lookback_days integer DEFAULT 30)
 RETURNS TABLE(attendance_date date, timetable_id uuid, period_id text, section_id uuid, course_id uuid, course_code text, course_name text, faculty_name text, period_name text, start_time text, end_time text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_lp uuid; v_max_hours integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_scf_pending_for_learner: not authenticated'; END IF;
  SELECT lp.id INTO v_lp FROM public.learners_profiles lp WHERE lp.profile_id = auth.uid();
  IF v_lp IS NULL THEN RETURN; END IF;

  -- Widest feedback window configured for ANY institution (fallback 48h).
  -- Rows older than this cannot satisfy the exact two-sided window below,
  -- so they are skipped BEFORE the JSONB roster explosion.
  SELECT COALESCE(max(public.fn_get_policy_int('session_feedback.window_hours', 48, i.id)), 48)
    INTO v_max_hours
    FROM public.institutions i;

  RETURN QUERY
  WITH wh AS (
    SELECT i.id AS institution_id,
           public.fn_get_policy_int('session_feedback.window_hours', 48, i.id) AS hours
      FROM public.institutions i
  )
  SELECT sa.attendance_date, sa.timetable_id, period.key AS period_id,
         NULLIF(period.value ->> 'section_id','')::uuid AS section_id,
         NULLIF(period.value ->> 'course_id','')::uuid AS course_id,
         period.value ->> 'course_code'  AS course_code,
         period.value ->> 'course_name'  AS course_name,
         period.value -> 'assigned_faculty' ->> 'faculty_name' AS faculty_name,
         period.value ->> 'period_name'  AS period_name,
         period.value ->> 'start_time'   AS start_time,
         period.value ->> 'end_time'     AS end_time
  FROM public.student_attendance sa
  LEFT JOIN wh ON wh.institution_id = sa.institution_id,
       jsonb_each(sa.attendance_data) AS period
  WHERE sa.attendance_date >= (CURRENT_DATE - p_lookback_days)
    -- NEW sargable prefilter: strictly weaker than the exact window check
    -- (day granularity, +1 day slack, widest institution window).
    AND sa.attendance_date >= (CURRENT_DATE - (v_max_hours / 24 + 1))
    -- NEW containment prefilter: a row that never mentions this learner's id
    -- anywhere in attendance_data cannot produce a Present match below.
    AND strpos(lower(sa.attendance_data::text), lower(v_lp::text)) > 0
    -- Exact two-sided window, per-institution hours resolved from the 14-row
    -- map (identical value by construction; NULL institution falls back to
    -- the original per-row call).
    AND now() <= (sa.attendance_date::timestamp AT TIME ZONE 'Asia/Kolkata')
          + make_interval(hours => COALESCE(wh.hours,
              public.fn_get_policy_int('session_feedback.window_hours', 48, sa.institution_id)))
    AND EXISTS (
      SELECT 1 FROM jsonb_array_elements(
                      public.fn_attendance_slot_students(period.value)) st
      WHERE CASE
              WHEN (st ->> 'student_id') ~
                   '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
              THEN (st ->> 'student_id')::uuid END = v_lp
        AND st ->> 'status' = 'Present'
    )
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
$function$
;

-- Lock (CI: check-secdef-anon-revoke): SECURITY DEFINER must not be anonymously
-- callable. Mirrors the live production ACL exactly — postgres owner,
-- authenticated, service_role; no anon, no PUBLIC.
REVOKE EXECUTE ON FUNCTION public.fn_scf_pending_for_learner(integer) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_scf_pending_for_learner(integer) TO authenticated, service_role;
