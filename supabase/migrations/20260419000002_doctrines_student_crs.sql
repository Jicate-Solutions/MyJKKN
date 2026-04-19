-- =====================================================================
-- Doctrines v1 — Student CRS (Career Readiness Score)
-- =====================================================================
-- Part of: feat/doctrines-composite-scores-v1
-- Thrash-locked: 2026-04-19
--
-- Extends fn_student_metrics to return an additional `career_readiness_score`
-- field using the shared compute_renormalized_composite() helper.
--
-- CRS v1 Component Weights (full spec):
--   attendance        25%   — trailing 30d attendance %
--   grades            30%   — NULL until course_grades schema exists
--   competencies      20%   — AVG(progress_percentage) on learner_competencies
--   fee_regularity    10%   — on-time bill payment ratio, trailing 30d
--   engagement        15%   — percentile_rank from student_engagement_scores
--
-- When a component is NULL, compute_renormalized_composite() redistributes
-- its weight across present components (Thrash Q2 decision).
--
-- Temporal window: trailing 30 days (Thrash Q1 decision).
-- Visibility: self-only (driven by auth.uid() inside RPC).
-- =====================================================================

CREATE OR REPLACE FUNCTION public.fn_student_metrics()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_user_id         uuid;
  v_learner_id      uuid;
  v_section_id      uuid;
  v_semester_id     uuid;
  v_institution_id  uuid;
  v_attendance      jsonb;
  v_fees            jsonb;
  v_timetable       jsonb;
  v_deadlines       jsonb;
  v_present         int := 0;
  v_total           int := 0;
  v_pct             numeric := 0;
  v_band            text := 'red';
  v_balance         numeric := 0;
  v_next_due        date;
  v_today_day       text;
  v_classes         jsonb := '[]'::jsonb;
  v_class_count     int := 0;
  v_deadline_count  int := 0;

  -- CRS-specific locals
  v_30d_start       timestamptz := (now() AT TIME ZONE 'Asia/Kolkata')::date - interval '30 days';
  v_crs_att         numeric;   -- 0-100 or NULL
  v_crs_grades      numeric;   -- always NULL for now
  v_crs_comp        numeric;   -- 0-100 or NULL
  v_crs_fees        numeric;   -- 0-100 or NULL
  v_crs_eng         numeric;   -- 0-100 or NULL
  v_crs_att_present int := 0;
  v_crs_att_total   int := 0;
  v_crs_bills_total int := 0;
  v_crs_bills_ontime int := 0;
  v_crs_composite   jsonb;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'error', 'not_authenticated',
      'scope', jsonb_build_object('user_id', null, 'computed_at', now()::text)
    );
  END IF;

  SELECT p.learner_id, p.institution_id
  INTO v_learner_id, v_institution_id
  FROM profiles p
  WHERE p.id = v_user_id;

  IF v_learner_id IS NULL THEN
    RETURN jsonb_build_object(
      'attendance', jsonb_build_object('pct_semester', 0, 'present', 0, 'total', 0, 'band', 'red', 'data_source', 'no_learner_profile'),
      'fees', jsonb_build_object('balance_due', 0, 'next_due_date', null, 'currency', 'INR', 'data_source', 'no_learner_profile'),
      'timetable_today', jsonb_build_object('classes', '[]'::jsonb, 'total', 0, 'data_source', 'no_learner_profile'),
      'deadlines', jsonb_build_object('upcoming', '[]'::jsonb, 'count', 0, 'data_source', 'no_learner_profile'),
      'career_readiness_score', jsonb_build_object(
        'score', 0, 'band', 'red',
        'components', '{}'::jsonb,
        'data_source', 'no_learner_profile'
      ),
      'scope', jsonb_build_object('user_id', v_user_id, 'institution_id', v_institution_id, 'computed_at', now()::text)
    );
  END IF;

  SELECT lp.section_id, lp.semester_id
  INTO v_section_id, v_semester_id
  FROM learners_profiles lp
  WHERE lp.id = v_learner_id;

  -- ═══════════════════════════════════════════════════════════════
  -- TILE 1: ATTENDANCE (semester aggregate — kept for backward compat)
  -- ═══════════════════════════════════════════════════════════════
  BEGIN
    IF v_section_id IS NOT NULL AND v_semester_id IS NOT NULL THEN
      SELECT
        COALESCE(SUM(
          (SELECT COUNT(*) FROM jsonb_each(sa.attendance_data) AS period_kv,
           LATERAL jsonb_array_elements(period_kv.value -> 'students') AS student_entry
           WHERE (student_entry ->> 'student_id')::uuid = v_learner_id
             AND student_entry ->> 'status' = 'Present')
        ), 0),
        COALESCE(SUM(
          (SELECT COUNT(*) FROM jsonb_each(sa.attendance_data) AS period_kv,
           LATERAL jsonb_array_elements(period_kv.value -> 'students') AS student_entry
           WHERE (student_entry ->> 'student_id')::uuid = v_learner_id)
        ), 0)
      INTO v_present, v_total
      FROM student_attendance sa
      WHERE sa.section_id = v_section_id
        AND sa.semester_id = v_semester_id;

      IF v_total > 0 THEN
        v_pct := ROUND((v_present::numeric / v_total::numeric) * 100, 1);
      END IF;

      IF v_pct >= 75 THEN v_band := 'green';
      ELSIF v_pct >= 60 THEN v_band := 'amber';
      ELSE v_band := 'red';
      END IF;

      v_attendance := jsonb_build_object(
        'pct_semester', v_pct, 'present', v_present, 'total', v_total, 'band', v_band
      );
    ELSE
      v_attendance := jsonb_build_object(
        'pct_semester', 0, 'present', 0, 'total', 0, 'band', 'red',
        'data_source', 'no_section_or_semester'
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_attendance := jsonb_build_object(
      'pct_semester', 0, 'present', 0, 'total', 0, 'band', 'red',
      'data_source', 'error'
    );
  END;

  -- ═══════════════════════════════════════════════════════════════
  -- TILE 2: FEE BALANCE (kept for backward compat)
  -- ═══════════════════════════════════════════════════════════════
  BEGIN
    SELECT COALESCE(SUM(bsb.balance_amount), 0), MIN(bsb.due_date)
    INTO v_balance, v_next_due
    FROM billing_student_bills bsb
    WHERE bsb.student_id = v_learner_id
      AND bsb.balance_amount > 0
      AND bsb.status NOT IN ('cancelled', 'refunded');

    v_fees := jsonb_build_object(
      'balance_due', v_balance, 'next_due_date', v_next_due, 'currency', 'INR'
    );
  EXCEPTION WHEN OTHERS THEN
    v_fees := jsonb_build_object(
      'balance_due', 0, 'next_due_date', null, 'currency', 'INR', 'data_source', 'error'
    );
  END;

  -- ═══════════════════════════════════════════════════════════════
  -- TILE 3: TODAY'S TIMETABLE (kept unchanged)
  -- ═══════════════════════════════════════════════════════════════
  BEGIN
    v_today_day := RTRIM(UPPER(to_char(CURRENT_DATE, 'Day')));
    IF v_section_id IS NOT NULL THEN
      SELECT jsonb_agg(slot_info ORDER BY (slot_info ->> 'start_time')), COUNT(*)
      INTO v_classes, v_class_count
      FROM (
        SELECT jsonb_build_object(
          'course', COALESCE(c.course_code, 'N/A'),
          'course_name', COALESCE(c.course_name, ''),
          'time', COALESCE(p.start_time::text, '') || '-' || COALESCE(p.end_time::text, ''),
          'faculty', COALESCE((SELECT pr.full_name FROM profiles pr WHERE pr.id = (slot_val ->> 'primary_staff_id')::uuid), 'TBA'),
          'room', '',
          'start_time', COALESCE(p.start_time::text, '99:99'),
          'is_break', COALESCE(p.is_break, false)
        ) AS slot_info
        FROM timetables tt,
             jsonb_each(tt.timetable_data -> v_today_day) AS period_entry(period_id, slot_val)
        LEFT JOIN periods p ON p.id = period_entry.period_id::uuid
        LEFT JOIN courses c ON c.id = (period_entry.slot_val ->> 'course_id')::uuid
        WHERE tt.section_id = v_section_id
          AND tt.is_active = true
          AND tt.timetable_data ? v_today_day
          AND COALESCE((period_entry.slot_val ->> 'is_break_slot')::boolean, false) = false
        LIMIT 12
      ) sub;

      v_classes := COALESCE(v_classes, '[]'::jsonb);
      v_class_count := COALESCE(v_class_count, 0);
      v_timetable := jsonb_build_object('classes', v_classes, 'total', v_class_count);
    ELSE
      v_timetable := jsonb_build_object('classes', '[]'::jsonb, 'total', 0, 'data_source', 'no_section');
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_timetable := jsonb_build_object('classes', '[]'::jsonb, 'total', 0, 'data_source', 'error');
  END;

  -- ═══════════════════════════════════════════════════════════════
  -- TILE 4: UPCOMING DEADLINES (kept unchanged)
  -- ═══════════════════════════════════════════════════════════════
  BEGIN
    SELECT jsonb_agg(d ORDER BY (d ->> 'due')), COUNT(*)
    INTO v_deadlines, v_deadline_count
    FROM (
      SELECT jsonb_build_object(
        'title', COALESCE(bsb.bill_description, 'Fee Payment'),
        'due', bsb.due_date::text, 'type', 'fee_payment'
      ) AS d
      FROM billing_student_bills bsb
      WHERE bsb.student_id = v_learner_id
        AND bsb.balance_amount > 0
        AND bsb.due_date >= CURRENT_DATE
        AND bsb.due_date <= CURRENT_DATE + interval '30 days'
        AND bsb.status NOT IN ('cancelled', 'refunded')
      ORDER BY bsb.due_date
      LIMIT 5
    ) sub;

    v_deadlines := COALESCE(v_deadlines, '[]'::jsonb);
    v_deadline_count := COALESCE(v_deadline_count, 0);
  EXCEPTION WHEN OTHERS THEN
    v_deadlines := '[]'::jsonb;
    v_deadline_count := 0;
  END;

  -- ═══════════════════════════════════════════════════════════════
  -- NEW — CAREER READINESS SCORE (CRS)
  -- Trailing 30-day window per Thrash Q1
  -- Components with NULL are renormalized per Thrash Q2
  -- ═══════════════════════════════════════════════════════════════

  -- Component 1: attendance (25%) — trailing 30 days
  BEGIN
    IF v_section_id IS NOT NULL AND v_semester_id IS NOT NULL THEN
      SELECT
        COALESCE(SUM(
          (SELECT COUNT(*) FROM jsonb_each(sa.attendance_data) AS period_kv,
           LATERAL jsonb_array_elements(period_kv.value -> 'students') AS se
           WHERE (se ->> 'student_id')::uuid = v_learner_id
             AND se ->> 'status' = 'Present')
        ), 0),
        COALESCE(SUM(
          (SELECT COUNT(*) FROM jsonb_each(sa.attendance_data) AS period_kv,
           LATERAL jsonb_array_elements(period_kv.value -> 'students') AS se
           WHERE (se ->> 'student_id')::uuid = v_learner_id)
        ), 0)
      INTO v_crs_att_present, v_crs_att_total
      FROM student_attendance sa
      WHERE sa.section_id = v_section_id
        AND sa.attendance_date >= v_30d_start::date;

      IF v_crs_att_total > 0 THEN
        v_crs_att := LEAST(100, GREATEST(0, ROUND((v_crs_att_present::numeric / v_crs_att_total::numeric) * 100)));
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_crs_att := NULL;
  END;

  -- Component 2: grades (30%) — NO TABLE YET, always NULL (renormalized out)
  v_crs_grades := NULL;

  -- Component 3: competencies (20%) — AVG progress_percentage on learner_competencies
  BEGIN
    SELECT AVG(progress_percentage)::numeric
    INTO v_crs_comp
    FROM learner_competencies lc
    WHERE lc.learner_id = v_learner_id
      AND lc.last_activity_at >= v_30d_start;

    IF v_crs_comp IS NOT NULL THEN
      v_crs_comp := LEAST(100, GREATEST(0, ROUND(v_crs_comp)));
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_crs_comp := NULL;
  END;

  -- Component 4: fee_regularity (10%) — on-time payment ratio, trailing 30 days
  BEGIN
    SELECT
      COUNT(*) FILTER (WHERE bsb.status = 'paid' AND bsb.updated_at::date <= bsb.due_date),
      COUNT(*)
    INTO v_crs_bills_ontime, v_crs_bills_total
    FROM billing_student_bills bsb
    WHERE bsb.student_id = v_learner_id
      AND bsb.status IN ('paid', 'overdue')
      AND bsb.due_date >= v_30d_start::date;

    IF v_crs_bills_total > 0 THEN
      v_crs_fees := LEAST(100, GREATEST(0, ROUND((v_crs_bills_ontime::numeric / v_crs_bills_total::numeric) * 100)));
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_crs_fees := NULL;
  END;

  -- Component 5: engagement (15%) — percentile_rank from latest row
  BEGIN
    SELECT ses.percentile_rank
    INTO v_crs_eng
    FROM student_engagement_scores ses
    WHERE ses.user_id = v_user_id
      AND ses.calculation_date >= v_30d_start::date
    ORDER BY ses.calculation_date DESC
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    v_crs_eng := NULL;
  END;

  -- Assemble CRS via shared helper
  v_crs_composite := compute_renormalized_composite(
    jsonb_build_object(
      'attendance',     v_crs_att,
      'grades',         v_crs_grades,
      'competencies',   v_crs_comp,
      'fee_regularity', v_crs_fees,
      'engagement',     v_crs_eng
    ),
    jsonb_build_object(
      'attendance',     25,
      'grades',         30,
      'competencies',   20,
      'fee_regularity', 10,
      'engagement',     15
    )
  );

  -- ═══════════════════════════════════════════════════════════════
  -- RESPONSE (backward compatible — new field adds, others unchanged)
  -- ═══════════════════════════════════════════════════════════════
  RETURN jsonb_build_object(
    'attendance',      v_attendance,
    'fees',            v_fees,
    'timetable_today', v_timetable,
    'deadlines', jsonb_build_object('upcoming', v_deadlines, 'count', v_deadline_count),
    'career_readiness_score', v_crs_composite || jsonb_build_object(
      'components', jsonb_build_object(
        'attendance',     v_crs_att,
        'grades',         v_crs_grades,
        'competencies',   v_crs_comp,
        'fee_regularity', v_crs_fees,
        'engagement',     v_crs_eng
      ),
      'window', 'trailing_30_days'
    ),
    'scope', jsonb_build_object(
      'user_id', v_user_id,
      'learner_id', v_learner_id,
      'institution_id', v_institution_id,
      'computed_at', now()::text
    )
  );
END;
$function$;

COMMENT ON FUNCTION public.fn_student_metrics() IS
'Dashboard v2 — Student metrics. Doctrines v1 extends with career_readiness_score (trailing 30d, renormalized).';

GRANT EXECUTE ON FUNCTION public.fn_student_metrics() TO authenticated;
