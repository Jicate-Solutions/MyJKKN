-- A learner who attends the same subject in two SEPARATE periods of a day can
-- confirm both. A block class (two or more back-to-back periods of one course)
-- still takes ONE confirmation, as today.
--
-- THE RULE, stated once
--   An answered session hides a pending period when it is
--     (a) the same period, or
--     (b) the same course AND in the same BLOCK: an unbroken run of that
--         course's periods in the day's attendance record, where each period
--         starts no more than 10 minutes after the previous one ends.
--   If any of that course's periods in the record has no readable start/end
--   time, (b) falls back to today's rule (any period of the course that day),
--   so an unknown timetable never adds taps.
--   The 10 minutes is a policy knob (the break between back-to-back periods).
--
-- WHY
--   fn_scf_pending_for_learner hid an answered session by matching the period
--   OR the course, anywhere in the day. The course arm was put there on purpose
--   (BUG-004641 / BUG-004647) so a 2-4 period block class asks once. But it also
--   hid the SECOND class of a course that meets twice with a gap (morning and
--   afternoon): the learner confirmed one and the other vanished. Production,
--   1-16 Sep, learner-days with two separated periods of a course: 6,924; of the
--   1,488 where the learner confirmed at least one, 1,485 (99.8%) could only
--   ever confirm one. (Measured 23 Sep.)
--   Dropping the course arm entirely (the first draft of this change) would have
--   turned one tap into 2-4 for block classes: 1-26 Sep, 638 of 1,289
--   course-days with 2+ periods of one course contain a back-to-back block, 353
--   of them 3+ periods (measured 28 Sep, read-only). So only the gap case moves.
--
-- This does NOT recover periods already lost; their windows are long closed.
--
-- Changes: one new pure helper (fn_scf_block_period_keys, IMMUTABLE, not
-- SECURITY DEFINER) and one clause of fn_scf_pending_for_learner. Same
-- signature, volatility, security and grants; no table or policy is touched.
--
-- HELD: rewrites a live function (R21) - the Director's number first.
--
-- ci:allow-secdef-authenticated fn_scf_pending_for_learner is learner self-service: called from the browser as the signed-in learner (lib/services/session-feedback-service.ts); the body resolves auth.uid() to the caller's own learners_profiles row and returns only that learner's own pending sessions. Same grants as main (20260815100000), re-stated below so the anon lock is explicit.

-- Keys of the periods in p_attendance_data that form ONE block with
-- p_period_key: same course, each starting <= 10 minutes after the previous
-- one ends. Falls back to every period of the course when any of them lacks a
-- readable time, and to the period alone when it has no course. Never raises.
CREATE OR REPLACE FUNCTION public.fn_scf_block_period_keys(p_attendance_data jsonb, p_period_key text)
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  WITH me AS (
    SELECT NULLIF(p_attendance_data -> p_period_key ->> 'course_id', '') AS course_id
  ),
  s AS (
    SELECT q.key,
           CASE WHEN q.value ->> 'start_time' ~ '^\s*(([01]?[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?|(0?[1-9]|1[0-2]):[0-5][0-9](:[0-5][0-9])?\s*[AaPp][Mm])\s*$'
                THEN (q.value ->> 'start_time')::time END AS st,
           CASE WHEN q.value ->> 'end_time' ~ '^\s*(([01]?[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?|(0?[1-9]|1[0-2]):[0-5][0-9](:[0-5][0-9])?\s*[AaPp][Mm])\s*$'
                THEN (q.value ->> 'end_time')::time END AS et
      FROM jsonb_each(CASE WHEN jsonb_typeof(p_attendance_data) = 'object'
                           THEN p_attendance_data ELSE '{}'::jsonb END) q, me
     WHERE me.course_id IS NOT NULL
       AND NULLIF(q.value ->> 'course_id', '') = me.course_id
  ),
  r AS (
    SELECT key,
           sum(CASE WHEN prev_et IS NULL OR st > prev_et + interval '10 minutes' THEN 1 ELSE 0 END)
             OVER (ORDER BY st, key) AS run
      FROM (SELECT key, st, lag(et) OVER (ORDER BY st, key) AS prev_et FROM s) o
  )
  SELECT CASE
    WHEN (SELECT course_id FROM me) IS NULL
      OR NOT EXISTS (SELECT 1 FROM s WHERE s.key = p_period_key)
      THEN ARRAY[p_period_key]
    WHEN EXISTS (SELECT 1 FROM s WHERE s.st IS NULL OR s.et IS NULL)
      THEN (SELECT array_agg(key ORDER BY key) FROM s)
    ELSE (SELECT array_agg(key ORDER BY key) FROM r
           WHERE run = (SELECT run FROM r WHERE r.key = p_period_key))
  END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_scf_block_period_keys(jsonb, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_block_period_keys(jsonb, text) TO authenticated, service_role;

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
        -- FIXED 2026-09-28: the course arm used to match ANY period of the
        -- course that day, which hid the second of two SEPARATE classes. It now
        -- matches only periods in the same back-to-back block, so a block class
        -- still asks once (BUG-004641 / BUG-004647).
        AND (
          f.period_id = period.key
          OR (NULLIF(period.value ->> 'course_id','') IS NOT NULL
              AND f.course_id = NULLIF(period.value ->> 'course_id','')::uuid
              AND f.period_id = ANY (public.fn_scf_block_period_keys(sa.attendance_data, period.key)))
        )
    )
  ORDER BY sa.attendance_date DESC, period.value ->> 'start_time';
END;
$function$;

-- Re-stated, unchanged from 20260815100000: CREATE OR REPLACE keeps existing
-- grants, but the anon lock must be explicit in every migration that touches it.
REVOKE EXECUTE ON FUNCTION public.fn_scf_pending_for_learner(integer) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_pending_for_learner(integer) TO authenticated, service_role;
