-- =====================================================================
-- Doctrines v1 — HOD DHS (Department Health Score)
-- =====================================================================
-- Part of: feat/doctrines-composite-scores-v1
-- Thrash-locked: 2026-04-19
--
-- Extends fn_hod_metrics with department_health_score.
--
-- DHS v1 component weights:
--   dept_attendance       25%   — students in dept, trailing 30d % Present
--   faculty_marking       25%   — distinct marking days / weekdays (30d)
--   grievance_resolution  25%   — resolved / total grievances in dept (30d)
--   learner_pass_rate     25%   — NULL until grades schema exists
--
-- Effective weights with grades missing: ~33/33/33.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.fn_hod_metrics()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_dept_id uuid;
  v_inst_id uuid;
  v_att_pct numeric := 0;
  v_baseline numeric := 75;
  v_marking_compliance numeric := 0;
  v_open_grievances integer := 0;
  v_pending_leaves integer := 0;
  v_total_students integer := 0;
  v_present_students integer := 0;
  v_total_expected_sessions integer := 0;
  v_marked_sessions integer := 0;
  -- DHS locals
  v_30d_start date := CURRENT_DATE - interval '30 days';
  v_dhs_att numeric;
  v_dhs_marking numeric;
  v_dhs_griev numeric;
  v_dhs_pass numeric;
  v_dhs_att_present int := 0;
  v_dhs_att_total int := 0;
  v_dhs_mark_days int := 0;
  v_dhs_griev_resolved int := 0;
  v_dhs_griev_total int := 0;
  v_dhs_composite jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object(
      'dept_attendance_pct', 0, 'attendance_baseline', v_baseline,
      'marking_compliance_pct', 0, 'open_grievances', 0, 'pending_leave_approvals', 0,
      'department_health_score', jsonb_build_object('score', 0, 'band', 'red', 'components', '{}'::jsonb, 'data_source', 'not_authenticated')
    );
  END IF;

  SELECT department_id, institution_id INTO v_dept_id, v_inst_id
  FROM profiles WHERE id = v_uid;

  IF v_dept_id IS NULL THEN
    RETURN jsonb_build_object(
      'dept_attendance_pct', 0, 'attendance_baseline', v_baseline,
      'marking_compliance_pct', 0, 'open_grievances', 0, 'pending_leave_approvals', 0,
      'department_health_score', jsonb_build_object('score', 0, 'band', 'red', 'components', '{}'::jsonb, 'data_source', 'no_department')
    );
  END IF;

  -- Existing tile 1: dept attendance today
  SELECT COALESCE(SUM(present_ct), 0), COALESCE(SUM(total_ct), 0)
  INTO v_present_students, v_total_students
  FROM (
    SELECT
      (SELECT COUNT(*) FROM jsonb_array_elements(period_val->'students') s WHERE s->>'status' = 'Present') AS present_ct,
      (SELECT COUNT(*) FROM jsonb_array_elements(period_val->'students') s) AS total_ct
    FROM student_attendance sa, jsonb_each(sa.attendance_data) AS kv(period_key, period_val)
    WHERE sa.department_id = v_dept_id AND sa.institution_id = v_inst_id
      AND sa.attendance_date = CURRENT_DATE
  ) sub;
  IF v_total_students > 0 THEN
    v_att_pct := ROUND((v_present_students::numeric / v_total_students) * 100, 1);
  END IF;

  -- Existing tile 2: marking compliance today
  SELECT COUNT(DISTINCT s.id) INTO v_total_expected_sessions
  FROM sections s WHERE s.department_id = v_dept_id;
  SELECT COUNT(DISTINCT sa.section_id) INTO v_marked_sessions
  FROM student_attendance sa
  WHERE sa.department_id = v_dept_id AND sa.institution_id = v_inst_id
    AND sa.attendance_date = CURRENT_DATE;
  IF v_total_expected_sessions > 0 THEN
    v_marking_compliance := ROUND((v_marked_sessions::numeric / v_total_expected_sessions) * 100, 1);
  END IF;

  -- Existing tile 3: open grievances
  SELECT COUNT(*) INTO v_open_grievances
  FROM grievance_tickets
  WHERE department_id = v_dept_id AND institution_id = v_inst_id
    AND status NOT IN ('resolved', 'closed', 'Resolved', 'Closed');

  -- Existing tile 4: pending leaves
  SELECT COUNT(*) INTO v_pending_leaves
  FROM leave_approvals la WHERE la.approver_id = v_uid AND la.acted_at IS NULL;

  -- ═════════════════════════════════════════════════════
  -- DHS COMPUTATION (trailing 30 days)
  -- ═════════════════════════════════════════════════════

  -- Component 1: dept_attendance (25%) — trailing 30d, % Present
  BEGIN
    SELECT
      COALESCE(SUM((SELECT COUNT(*) FROM jsonb_each(sa.attendance_data) AS pkv,
        LATERAL jsonb_array_elements(pkv.value -> 'students') AS se
        WHERE se ->> 'status' = 'Present')), 0),
      COALESCE(SUM((SELECT COUNT(*) FROM jsonb_each(sa.attendance_data) AS pkv,
        LATERAL jsonb_array_elements(pkv.value -> 'students') AS se)), 0)
    INTO v_dhs_att_present, v_dhs_att_total
    FROM student_attendance sa
    WHERE sa.department_id = v_dept_id AND sa.institution_id = v_inst_id
      AND sa.attendance_date >= v_30d_start;
    IF v_dhs_att_total > 0 THEN
      v_dhs_att := LEAST(100, GREATEST(0, ROUND((v_dhs_att_present::numeric / v_dhs_att_total::numeric) * 100)));
    END IF;
  EXCEPTION WHEN OTHERS THEN v_dhs_att := NULL; END;

  -- Component 2: faculty_marking (25%) — distinct marking days in last 30d / ~22 weekdays
  BEGIN
    SELECT COUNT(DISTINCT sa.attendance_date) INTO v_dhs_mark_days
    FROM student_attendance sa
    WHERE sa.department_id = v_dept_id AND sa.institution_id = v_inst_id
      AND sa.attendance_date >= v_30d_start AND sa.attendance_date <= CURRENT_DATE;
    v_dhs_marking := LEAST(100, GREATEST(0, ROUND((v_dhs_mark_days::numeric / 22.0) * 100)));
  EXCEPTION WHEN OTHERS THEN v_dhs_marking := NULL; END;

  -- Component 3: grievance_resolution (25%) — resolved / total in last 30d
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

  -- Component 4: learner_pass_rate (25%) — NULL until grades schema lands
  v_dhs_pass := NULL;

  v_dhs_composite := compute_renormalized_composite(
    jsonb_build_object(
      'dept_attendance', v_dhs_att,
      'faculty_marking', v_dhs_marking,
      'grievance_resolution', v_dhs_griev,
      'learner_pass_rate', v_dhs_pass
    ),
    jsonb_build_object(
      'dept_attendance', 25,
      'faculty_marking', 25,
      'grievance_resolution', 25,
      'learner_pass_rate', 25
    )
  );

  RETURN jsonb_build_object(
    'dept_attendance_pct', v_att_pct,
    'attendance_baseline', v_baseline,
    'marking_compliance_pct', v_marking_compliance,
    'open_grievances', v_open_grievances,
    'pending_leave_approvals', v_pending_leaves,
    'department_health_score', v_dhs_composite || jsonb_build_object(
      'components', jsonb_build_object(
        'dept_attendance', v_dhs_att,
        'faculty_marking', v_dhs_marking,
        'grievance_resolution', v_dhs_griev,
        'learner_pass_rate', v_dhs_pass
      ),
      'window', 'trailing_30_days'
    )
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.fn_hod_metrics() TO authenticated;
