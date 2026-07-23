-- 2026-07-05 — Faculty-feedback → exam-eligibility, round-3 refinements #10/#11/#12
-- folded into fn_scf_my_confirmed_attendance (learner self-view). Applied live; forward record.
--   #10 outage / #12 OD-leave: excused/outage marks dropped from BOTH present and absent.
--   #11 48h    : confirmed_present counts only within-window feedback (IST-midnight anchor).
-- Forward-only floor preserved from 20260705120200. Depends on scf_outage_days (20260705130000).

CREATE OR REPLACE FUNCTION public.fn_scf_my_confirmed_attendance(p_from date DEFAULT NULL::date, p_to date DEFAULT NULL::date)
 RETURNS TABLE(present_marks bigint, absent_marks bigint, confirmed_present bigint, total_marks bigint, official_pct numeric, confirmed_pct numeric, enforcement_start date, gate_mode text, pass_line numeric, min_marks integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '15s'
AS $function$
DECLARE v_lp uuid; v_inst uuid; v_start date; v_from date; v_to date; v_window_hours integer;
BEGIN
  -- Self-scoped learner view of their OWN confirmed-attendance % (transparency,
  -- Director decision #7). Mirrors fn_scf_effective_attendance's math for ONE learner,
  -- forward-only from enforcement_start. NOT gated on attendance_coupling_enabled:
  -- a learner may always see their own number; the UI decides messaging by gate_mode.
  -- Never touches attendance_data.
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_scf_my_confirmed_attendance: not authenticated'; END IF;
  SELECT lp.id, lp.institution_id INTO v_lp, v_inst
    FROM public.learners_profiles lp WHERE lp.profile_id = auth.uid();
  IF v_lp IS NULL THEN RETURN; END IF;

  v_start := COALESCE(NULLIF(public.fn_get_policy_text('session_feedback.enforcement_start_date','2026-07-05', v_inst),'')::date, '2026-07-05'::date);
  v_to := COALESCE(p_to, current_date);
  v_from := GREATEST(COALESCE(p_from, v_start), v_start);   -- forward-only floor
  -- Late-feedback window (decision #11): reuse the shared session_feedback.window_hours
  -- lever (default 48) so "within window" is one concept across all three fns.
  v_window_hours := public.fn_get_policy_int('session_feedback.window_hours', 48, v_inst);

  RETURN QUERY
  WITH marks AS (
    SELECT sa.attendance_date, sa.timetable_id AS ttid, period.key AS pid, (st ->> 'status') AS status
    FROM public.student_attendance sa
    CROSS JOIN LATERAL jsonb_each(
      CASE WHEN jsonb_typeof(sa.attendance_data)='object' THEN sa.attendance_data ELSE '{}'::jsonb END) AS period
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(period.value -> 'students')='array' THEN period.value -> 'students' ELSE '[]'::jsonb END) AS st
    WHERE sa.attendance_date BETWEEN v_from AND v_to
      AND (st ->> 'student_id') = v_lp::text
      AND (st ->> 'status') IN ('Present','Absent')
      -- Decision #10 (outage): drop marks on a declared feedback-outage window from BOTH
      -- present and absent, so the learner is never penalised for a system-down day.
      AND NOT EXISTS (
        SELECT 1 FROM public.scf_outage_days o
        WHERE o.outage_date = sa.attendance_date
          AND (o.institution_id IS NULL OR o.institution_id = sa.institution_id)
          AND (o.period_id      IS NULL OR o.period_id      = period.key))
      -- Decision #12 (approved leave/OD): drop marks with an approved OD/leave adjustment
      -- from BOTH sides, so an excused absence never hurts the confirmed %.
      AND NOT EXISTS (
        SELECT 1 FROM public.leave_onduty_attendance_updates lou
        WHERE lou.attendance_record_id = sa.id
          AND lou.student_id           = v_lp
          AND lou.period_slot_id       = period.key)
  ),
  dedup AS (
    SELECT DISTINCT ON (attendance_date, ttid, pid) attendance_date, ttid, pid, status
    FROM marks ORDER BY attendance_date, ttid, pid, (status='Present') DESC
  ),
  agg AS (
    SELECT
      count(*) FILTER (WHERE d.status='Present') AS pm,
      count(*) FILTER (WHERE d.status='Absent')  AS am,
      count(*) FILTER (WHERE d.status='Present' AND EXISTS (
        SELECT 1 FROM public.session_feedback f
        WHERE f.student_id = v_lp AND f.attendance_date = d.attendance_date
          AND f.period_id = d.pid AND f.timetable_id = d.ttid
          -- Decision #11: only feedback submitted within window_hours of the class
          -- (class day interpreted at IST midnight) confirms attendance.
          AND f.created_at <= ((d.attendance_date::timestamp AT TIME ZONE 'Asia/Kolkata')
                               + make_interval(hours => v_window_hours)))) AS cp
    FROM dedup d
  )
  SELECT a.pm::bigint, a.am::bigint, a.cp::bigint, (a.pm + a.am)::bigint,
    CASE WHEN (a.pm+a.am)=0 THEN 0 ELSE round(a.pm::numeric/(a.pm+a.am)*100,2) END,
    CASE WHEN (a.pm+a.am)=0 THEN 0 ELSE round(a.cp::numeric/(a.pm+a.am)*100,2) END,
    v_start,
    public.fn_get_policy_text('session_feedback.gate_mode','visibility', v_inst),
    75::numeric, 10
  FROM agg a;
END;
$function$

-- Explicit anon-lock (CLAUDE.md standing rule; idempotent for CREATE OR REPLACE — the
-- live fn is already anon-locked, this keeps the migration file self-documenting + green).
REVOKE EXECUTE ON FUNCTION public.fn_scf_my_confirmed_attendance(date, date) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_my_confirmed_attendance(date, date) TO authenticated;
