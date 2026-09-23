-- A learner who attends the same subject twice in a day can confirm both.
--
-- fn_scf_pending_for_learner hid an already-answered session by matching the
-- period OR the course. The course arm meant the first confirmation of a
-- course on a day suppressed every other period of that course that day: the
-- learner was offered one, answered it, and the rest vanished from the list.
--
-- Production, 1-16 Sep, restricted to days where the same course genuinely ran
-- two SEPARATE periods (start of the second more than 10 minutes after the end
-- of the first, so back-to-back blocks are excluded): 6,924 such learner-days
-- across 1,725 learners. Of the 1,488 where the learner confirmed at least one,
-- 1,485 - 99.8% - could only ever confirm one. Exactly 3 learner-days in the
-- fortnight recorded both. 1,485 periods lost in two weeks among learners who
-- were actively trying.
--
-- This does NOT recover the periods already lost; their feedback windows are
-- long closed. Re-offering them is a separate decision and a separate change.
--
-- Nothing else changes: same signature, same volatility, same security, same
-- grants; no table, policy or grant is touched.
--
-- HELD: rewrites a live function (R21) - the Director's number first.

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
         -- Updated: 2026-08-15 — same reader. On the ARRAY shape this label was
         -- blank, so a learner's pending-feedback card for a team-taught class
         -- named no teacher at all. Shows the PRIMARY, which is exactly who
         -- fn_scf_submit_feedback (PR #2860) attributes the learner's answer to
         -- — the label and the destination now agree. Display only; it is not
         -- compared, joined or written anywhere.
         public.fn_attendance_slot_faculty(period.value) ->> 'faculty_name' AS faculty_name,
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
        -- FIXED 2026-09-23: this used to read
        --     f.period_id = period.key
        --     OR (course_id matches this period's course)
        -- The course_id arm meant one confirmation for a course on a day hid
        -- EVERY other period of that course that day. A learner who attended
        -- the same subject twice was offered one of the two and never saw the
        -- second, which is exactly what the reports say ("not showing all
        -- subject feedback", "only two feedback is come").
        --
        -- Keyed on the period alone now. The arm was dead weight: across
        -- 25,647 feedback rows in Sep and 110,019 in Jul, ZERO carry a
        -- period_id that matches no roster key, so nothing relied on the
        -- course fallback to be found.
        AND f.period_id = period.key
    )
  ORDER BY sa.attendance_date DESC, period.value ->> 'start_time';
END;
$function$;
