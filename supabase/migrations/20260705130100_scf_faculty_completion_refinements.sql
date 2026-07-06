-- 2026-07-05 — Faculty-feedback → exam-eligibility, round-3 refinements #10/#11/#12
-- folded into fn_scf_faculty_completion. Applied live via Mgmt API this session; this
-- migration is the forward record so a fresh rebuild reproduces prod exactly.
--   #10 outage : whole outage sessions removed from the faculty completion view.
--   #11 48h    : only feedback within session_feedback.window_hours (48h, class day at
--                IST midnight) confirms attendance.
--   #12 OD/leave: excused students dropped from present_count AND confirmed_count.
-- Depends on scf_outage_days (migration 20260705130000). Grandfather CASE + IST window
-- + fn_scf_to_time_or_null sort preserved unchanged from 20260705120000.

CREATE OR REPLACE FUNCTION public.fn_scf_faculty_completion(p_from date, p_to date)
 RETURNS TABLE(attendance_date date, timetable_id uuid, period_id text, course_code text, course_name text, present_count integer, confirmed_count integer, pending_count integer, completion_pct numeric, within_window boolean, start_time text, end_time text, gate_mode text, session_status text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '20s'
AS $function$
DECLARE v_email text; v_start date;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_scf_faculty_completion: not authenticated'; END IF;
  SELECT lower(p.email) INTO v_email FROM public.profiles p WHERE p.id = auth.uid();
  IF v_email IS NULL THEN RETURN; END IF;
  -- Forward-only floor (Director 2026-07-05): sessions before this date are never
  -- marked incomplete/overdue (grandfathered as neutral 'open').
  v_start := COALESCE(NULLIF(public.fn_get_policy_text('session_feedback.enforcement_start_date','2026-07-05',NULL),'')::date, '2026-07-05'::date);

  RETURN QUERY
  WITH sess AS (
    SELECT sa.id AS att_id, sa.institution_id, sa.attendance_date, sa.timetable_id,
           period.key AS period_id, period.value AS pv
    FROM public.student_attendance sa, jsonb_each(sa.attendance_data) AS period
    WHERE sa.attendance_date BETWEEN p_from AND p_to
      AND lower(period.value -> 'assigned_faculty' ->> 'faculty_email') = v_email
      -- Decision #10 (outage): a super-admin-declared feedback outage for this
      -- date [, institution][, period] removes the whole session from the faculty's
      -- completion view — no red for a day the feedback system was down.
      AND NOT EXISTS (
        SELECT 1 FROM public.scf_outage_days o
        WHERE o.outage_date = sa.attendance_date
          AND (o.institution_id IS NULL OR o.institution_id = sa.institution_id)
          AND (o.period_id      IS NULL OR o.period_id      = period.key))
  ),
  counted AS (
    SELECT s.att_id, s.institution_id, s.attendance_date, s.timetable_id, s.period_id, s.pv,
      (SELECT count(*) FROM jsonb_array_elements(s.pv -> 'students') st
        WHERE st ->> 'status' = 'Present'
          -- Decision #12 (approved leave/OD): an excused student is not "present-owing-
          -- feedback", so drop them from present_count too (keeps pending honest).
          AND NOT EXISTS (
            SELECT 1 FROM public.leave_onduty_attendance_updates lou
            WHERE lou.attendance_record_id = s.att_id
              AND lou.student_id::text     = (st ->> 'student_id')
              AND lou.period_slot_id       = s.period_id))::int AS present_count,
      (SELECT count(*) FROM jsonb_array_elements(s.pv -> 'students') st
        WHERE st ->> 'status' = 'Present'
          -- #12: exclude the same excused students from confirmed_count.
          AND NOT EXISTS (
            SELECT 1 FROM public.leave_onduty_attendance_updates lou
            WHERE lou.attendance_record_id = s.att_id
              AND lou.student_id::text     = (st ->> 'student_id')
              AND lou.period_slot_id       = s.period_id)
          AND EXISTS (
            SELECT 1 FROM public.session_feedback f
            -- Guard the ::uuid cast. A malformed blob student_id ('', 'N/A') raises
            -- 22P02 and aborts the whole completion query. Same UUID-shape regex as the
            -- sibling fn_scf_effective_attendance, applied AS A CASE so the cast can
            -- never run on a non-UUID (guaranteed evaluation order, unlike an AND qual).
            -- A non-UUID yields NULL -> never matches -> the learner just stays pending.
            WHERE f.student_id = CASE
                    WHEN (st ->> 'student_id') ~
                         '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
                    THEN (st ->> 'student_id')::uuid END
              AND f.attendance_date = s.attendance_date
              AND f.period_id = s.period_id
              -- Key the confirmation match on the FULL session identity. period_id is
              -- only a slot key inside a day; without timetable_id a learner's feedback
              -- for a different class sharing the same period slot could falsely mark
              -- this session confirmed.
              AND f.timetable_id = s.timetable_id
              -- Decision #11: only feedback submitted within window_hours of the class
              -- (class day at IST midnight) confirms attendance. Reuses the same
              -- session_feedback.window_hours lever as the completion window below.
              AND f.created_at <= ((s.attendance_date::timestamp AT TIME ZONE 'Asia/Kolkata')
                    + make_interval(hours => public.fn_get_policy_int(
                        'session_feedback.window_hours', 48, s.institution_id)))))::int AS confirmed_count
    FROM sess s
  ),
  derived AS (
    SELECT c.*,
      (c.present_count - c.confirmed_count) AS pending_ct,
      -- Anchor the completion window to IST wall-clock, NOT the server TZ. Casting a
      -- date to timestamptz resolves midnight in the server zone (UTC in prod), which
      -- shifts the IST day boundary 5.5h earlier and flips session_status at the edge.
      -- Interpret attendance_date as IST midnight explicitly before adding the window.
      (now() <= (c.attendance_date::timestamp AT TIME ZONE 'Asia/Kolkata')
         + make_interval(hours => public.fn_get_policy_int(
             'session_feedback.window_hours', 48, c.institution_id))) AS win,
      -- Resolve the gate mode for THIS session's institution (institution override
      -- shadows the global default). Default 'visibility' matches the seeded row.
      public.fn_get_policy_text(
        'session_feedback.gate_mode', 'visibility', c.institution_id) AS gmode
    FROM counted c
    WHERE c.present_count > 0
  )
  SELECT d.attendance_date, d.timetable_id, d.period_id,
         d.pv ->> 'course_code', d.pv ->> 'course_name',
         d.present_count, d.confirmed_count, d.pending_ct,
         CASE WHEN d.present_count = 0 THEN 0
              ELSE round((d.confirmed_count::numeric / d.present_count) * 100, 0) END,
         d.win,
         d.pv ->> 'start_time', d.pv ->> 'end_time',
         d.gmode,
         -- DERIVED enforcement status. 'incomplete' is emitted ONLY when the gate is
         -- 'hard' AND feedback is still pending AND the window is open — i.e. the
         -- teeth of the hard gate. Under 'visibility'/'off' the status can never be
         -- 'incomplete', so this branch is INERT until the config flip (dark).
         CASE
           WHEN d.pending_ct <= 0            THEN 'complete'
           WHEN d.attendance_date < v_start THEN 'open'  -- pre-rule: neutral, never red
           WHEN d.gmode = 'hard' AND d.win   THEN 'incomplete'
           WHEN d.win                        THEN 'open'
           ELSE                                   'overdue'
         END
  FROM derived d
  -- Chronological within a day: sort on the PARSED time-of-day, not the raw blob text.
  -- start_time comes in mixed formats (24h "10:00:00" and 12h "3:00 PM"); a raw text
  -- sort orders "9:00 AM" after "10:00:00". fn_scf_to_time_or_null normalizes both AND
  -- returns NULL (never raises) for a non-time slot value ('TBD', 'Period 1', '24:70') —
  -- a bare NULLIF(...)::time would abort the ENTIRE query on such a value (round-3
  -- regression). NULLS LAST sends the unparseable rows to the end.
  ORDER BY d.attendance_date DESC,
           public.fn_scf_to_time_or_null(d.pv ->> 'start_time') ASC NULLS LAST;
END;
$function$

-- Explicit anon-lock (CLAUDE.md standing rule; idempotent for CREATE OR REPLACE — the
-- live fn is already anon-locked, this keeps the migration file self-documenting + green).
REVOKE EXECUTE ON FUNCTION public.fn_scf_faculty_completion(date, date) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_faculty_completion(date, date) TO authenticated;
