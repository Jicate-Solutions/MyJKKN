-- ============================================================================
-- fn_hod_metrics — add "oldest open item" ages so the HOD dashboard can colour
-- Grievances / Leave by AGE (overdue), not just count. 2026-07-22.
-- Adds two read-only fields; every existing field is unchanged.
--   grievance_oldest_days : whole days since the oldest OPEN grievance was raised (0 if none)
--   leave_oldest_days     : whole days the oldest PENDING leave has waited (0 if none)
-- Interview decisions: Grievances go red if any is overdue; Leave goes red if many
-- pile up OR any single one is old. The day-cutoffs live in the component (tunable
-- without a DB change); this function only reports the raw ages.
-- CREATE OR REPLACE, same signature (no DROP) so the prod auto-classifier accepts it.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_hod_metrics()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid(); v_dept_id uuid; v_inst_id uuid;
  v_att_pct numeric := 0; v_baseline numeric := 75;
  v_marking_compliance numeric := 0; v_open_grievances integer := 0; v_pending_leaves integer := 0;
  v_grievance_oldest_days integer := 0; v_leave_oldest_days integer := 0;
  v_total_students integer := 0; v_present_students integer := 0;
  v_total_expected_sessions integer := 0; v_marked_sessions integer := 0;
  v_30d_start date := CURRENT_DATE - interval '30 days';
  v_dhs_att numeric; v_dhs_marking numeric; v_dhs_griev numeric; v_dhs_pass numeric;
  v_dhs_att_present int := 0; v_dhs_att_total int := 0;
  v_dhs_mark_days int := 0; v_dhs_griev_resolved int := 0; v_dhs_griev_total int := 0;
  v_dhs_composite jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object(
      'dept_attendance_pct', 0, 'attendance_baseline', v_baseline,
      'marking_compliance_pct', 0, 'open_grievances', 0, 'pending_leave_approvals', 0,
      'grievance_oldest_days', 0, 'leave_oldest_days', 0,
      'department_health_score', jsonb_build_object('score', 0, 'band', 'red', 'components', '{}'::jsonb, 'data_source', 'not_authenticated'));
  END IF;
  SELECT department_id, institution_id INTO v_dept_id, v_inst_id FROM profiles WHERE id = v_uid;
  IF v_dept_id IS NULL THEN
    RETURN jsonb_build_object(
      'dept_attendance_pct', 0, 'attendance_baseline', v_baseline,
      'marking_compliance_pct', 0, 'open_grievances', 0, 'pending_leave_approvals', 0,
      'grievance_oldest_days', 0, 'leave_oldest_days', 0,
      'department_health_score', jsonb_build_object('score', 0, 'band', 'red', 'components', '{}'::jsonb, 'data_source', 'no_department'));
  END IF;
  SELECT COALESCE(SUM(present_ct), 0), COALESCE(SUM(total_ct), 0) INTO v_present_students, v_total_students FROM (
    SELECT (SELECT COUNT(*) FROM jsonb_array_elements(period_val->'students') s WHERE s->>'status' = 'Present') AS present_ct,
           (SELECT COUNT(*) FROM jsonb_array_elements(period_val->'students') s) AS total_ct
    FROM student_attendance sa, jsonb_each(sa.attendance_data) AS kv(period_key, period_val)
    WHERE sa.department_id = v_dept_id AND sa.institution_id = v_inst_id AND sa.attendance_date = CURRENT_DATE
  ) sub;
  IF v_total_students > 0 THEN v_att_pct := ROUND((v_present_students::numeric / v_total_students) * 100, 1); END IF;
  SELECT COUNT(DISTINCT s.id) INTO v_total_expected_sessions FROM sections s WHERE s.department_id = v_dept_id;
  SELECT COUNT(DISTINCT sa.section_id) INTO v_marked_sessions
  FROM student_attendance sa
  WHERE sa.department_id = v_dept_id AND sa.institution_id = v_inst_id AND sa.attendance_date = CURRENT_DATE;
  IF v_total_expected_sessions > 0 THEN
    v_marking_compliance := ROUND((v_marked_sessions::numeric / v_total_expected_sessions) * 100, 1);
  END IF;
  -- Open grievances: count + age (whole days) of the oldest still-open one.
  SELECT COUNT(*), COALESCE(CURRENT_DATE - MIN(created_at)::date, 0)
  INTO v_open_grievances, v_grievance_oldest_days
  FROM grievance_tickets
  WHERE department_id = v_dept_id AND institution_id = v_inst_id
    AND status NOT IN ('resolved', 'closed', 'Resolved', 'Closed');
  -- Pending leave approvals for this HOD: count + age (days) the oldest has waited.
  SELECT COUNT(*), COALESCE(CURRENT_DATE - MIN(la.created_at)::date, 0)
  INTO v_pending_leaves, v_leave_oldest_days
  FROM leave_approvals la WHERE la.approver_id = v_uid AND la.acted_at IS NULL;

  BEGIN
    SELECT
      COALESCE(SUM((SELECT COUNT(*) FROM jsonb_each(sa.attendance_data) AS pkv,
        LATERAL jsonb_array_elements(pkv.value -> 'students') AS se WHERE se ->> 'status' = 'Present')), 0),
      COALESCE(SUM((SELECT COUNT(*) FROM jsonb_each(sa.attendance_data) AS pkv,
        LATERAL jsonb_array_elements(pkv.value -> 'students') AS se)), 0)
    INTO v_dhs_att_present, v_dhs_att_total
    FROM student_attendance sa
    WHERE sa.department_id = v_dept_id AND sa.institution_id = v_inst_id AND sa.attendance_date >= v_30d_start;
    IF v_dhs_att_total > 0 THEN
      v_dhs_att := LEAST(100, GREATEST(0, ROUND((v_dhs_att_present::numeric / v_dhs_att_total::numeric) * 100)));
    END IF;
  EXCEPTION WHEN OTHERS THEN v_dhs_att := NULL; END;

  BEGIN
    SELECT COUNT(DISTINCT sa.attendance_date) INTO v_dhs_mark_days
    FROM student_attendance sa
    WHERE sa.department_id = v_dept_id AND sa.institution_id = v_inst_id
      AND sa.attendance_date >= v_30d_start AND sa.attendance_date <= CURRENT_DATE;
    v_dhs_marking := LEAST(100, GREATEST(0, ROUND((v_dhs_mark_days::numeric / 22.0) * 100)));
  EXCEPTION WHEN OTHERS THEN v_dhs_marking := NULL; END;

  BEGIN
    SELECT
      COUNT(*) FILTER (WHERE status IN ('resolved', 'closed', 'Resolved', 'Closed')),
      COUNT(*)
    INTO v_dhs_griev_resolved, v_dhs_griev_total
    FROM grievance_tickets
    WHERE department_id = v_dept_id AND institution_id = v_inst_id
      AND created_at >= v_30d_start::timestamptz;
    IF v_dhs_griev_total > 0 THEN
      v_dhs_griev := LEAST(100, GREATEST(0, ROUND((v_dhs_griev_resolved::numeric / v_dhs_griev_total::numeric) * 100)));
    END IF;
  EXCEPTION WHEN OTHERS THEN v_dhs_griev := NULL; END;

  v_dhs_pass := NULL;

  v_dhs_composite := compute_renormalized_composite(
    jsonb_build_object('dept_attendance', v_dhs_att, 'faculty_marking', v_dhs_marking, 'grievance_resolution', v_dhs_griev, 'learner_pass_rate', v_dhs_pass),
    jsonb_build_object('dept_attendance', 25, 'faculty_marking', 25, 'grievance_resolution', 25, 'learner_pass_rate', 25)
  );

  RETURN jsonb_build_object(
    'dept_attendance_pct', v_att_pct,
    'attendance_baseline', v_baseline,
    'marking_compliance_pct', v_marking_compliance,
    'open_grievances', v_open_grievances,
    'pending_leave_approvals', v_pending_leaves,
    'grievance_oldest_days', v_grievance_oldest_days,
    'leave_oldest_days', v_leave_oldest_days,
    'department_health_score', v_dhs_composite || jsonb_build_object(
      'components', jsonb_build_object('dept_attendance', v_dhs_att, 'faculty_marking', v_dhs_marking, 'grievance_resolution', v_dhs_griev, 'learner_pass_rate', v_dhs_pass),
      'window', 'trailing_30_days')
  );
END;
$function$;

-- ── Lock this SECURITY DEFINER function from anon (mandatory template, 2026-06-06) ──
-- CREATE OR REPLACE of an existing SECDEF fn is treated as NEW by the "lock anon"
-- CI gate, so the REVOKE/GRANT must be RE-ASSERTED in this migration (this is the
-- one thing #2276 was missing). Live grants are already correct in prod — these
-- statements are idempotent (no-op re-assert), never a privilege change.
REVOKE EXECUTE ON FUNCTION public.fn_hod_metrics() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_hod_metrics() TO authenticated, service_role;
