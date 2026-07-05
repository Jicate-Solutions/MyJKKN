-- =====================================================================
-- Faculty-feedback exam-link — learner self-view RPC (Build 2c backend)
-- Date: 2026-07-05  Spec: specs/faculty-feedback-exam-link-2026-07-05.md
-- Learner-scoped, forward-only confirmed-attendance snapshot for the student's
-- own transparency view (Director decision #7). SECURITY DEFINER, anon-revoked.
-- Never mutates attendance. Applied to prod via Management API.
-- =====================================================================
BEGIN;
CREATE OR REPLACE FUNCTION public.fn_scf_my_confirmed_attendance(
  p_from date DEFAULT NULL, p_to date DEFAULT NULL)
RETURNS TABLE(
  present_marks bigint, absent_marks bigint, confirmed_present bigint,
  total_marks bigint, official_pct numeric, confirmed_pct numeric,
  enforcement_start date, gate_mode text, pass_line numeric, min_marks integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
SET statement_timeout TO '15s'
AS $function$
DECLARE v_lp uuid; v_inst uuid; v_start date; v_from date; v_to date;
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
          AND f.period_id = d.pid AND f.timetable_id = d.ttid)) AS cp
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
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_scf_my_confirmed_attendance(date,date) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_my_confirmed_attendance(date,date) TO authenticated;
COMMIT;

-- Explicit anon-lock (CLAUDE.md standing rule; idempotent for CREATE OR REPLACE — the
-- live fn is already anon-locked, this keeps the migration file self-documenting + green).
REVOKE EXECUTE ON FUNCTION public.fn_scf_my_confirmed_attendance(date, date) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_my_confirmed_attendance(date, date) TO authenticated;
