-- =====================================================================
-- Doctrines v1 — Faculty TES (Teaching Excellence Score)
-- =====================================================================
-- Part of: feat/doctrines-composite-scores-v1
-- Thrash-locked: 2026-04-19
--
-- Extends fn_faculty_metrics with teaching_excellence_score.
--
-- TES v1 component weights (full spec):
--   student_attendance      25%   — % Present in faculty's marked classes (30d)
--   marking_compliance      25%   — % of assigned classes marked (30d)
--   feedback_nps            25%   — NULL until NPS tables exist
--   research_mentorship     25%   — NULL until research/mentorship tables exist
--
-- With 2 of 4 components always NULL today, effective weights renormalize
-- to 50/50 between attendance and marking compliance. When feedback_nps
-- / research_mentorship data arrives, weights auto-restore with zero code.
--
-- Backward-compatible: all existing fields preserved.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.fn_faculty_metrics()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_institution_id uuid;
  v_staff_id uuid;
  v_today date;
  v_day_name text;
  v_now_ist timestamptz;
  v_now_time time;
  v_week_start date;
  v_week_end date;
  v_total_today int := 0;
  v_marked_today int := 0;
  v_upcoming jsonb := '[]'::jsonb;
  v_next_2h_count int := 0;
  v_week_days_total int := 0;
  v_week_days_marked int := 0;
  v_week_pct numeric := 0;
  v_tt record;
  v_period jsonb;
  v_slot jsonb;
  v_period_id text;
  v_start_time time;
  v_end_time time;
  v_course_code text;
  v_course_name text;
  v_section_name text;
  v_period_name text;
  v_has_marked boolean;
  v_cutoff_time time;

  -- TES locals
  v_30d_start date;
  v_tes_stu_att numeric;
  v_tes_marking numeric;
  v_tes_nps numeric;
  v_tes_research numeric;
  v_tes_stu_present int := 0;
  v_tes_stu_total int := 0;
  v_tes_marked_rows int := 0;
  v_tes_assigned_rows int := 0;
  v_tes_composite jsonb;
BEGIN
  v_now_ist := now() AT TIME ZONE 'Asia/Kolkata';
  v_today := v_now_ist::date;
  v_now_time := v_now_ist::time;
  v_cutoff_time := v_now_time + interval '2 hours';
  v_day_name := upper(trim(to_char(v_today, 'DAY')));
  v_week_start := v_today - (extract(isodow from v_today)::int - 1);
  v_week_end := v_week_start + 4;
  v_30d_start := v_today - interval '30 days';

  SELECT institution_id INTO v_institution_id FROM profiles WHERE id = v_user_id;
  SELECT s.id INTO v_staff_id FROM staff s WHERE s.profile_id = v_user_id LIMIT 1;

  IF v_staff_id IS NULL THEN
    RETURN jsonb_build_object(
      'unmarked_classes', jsonb_build_object('count', 0, 'total_today', 0, 'data_source', 'no_staff_record'),
      'learner_flags', jsonb_build_object('count', 0, 'data_source', 'not_available'),
      'upcoming_timetable', jsonb_build_object('classes', '[]'::jsonb, 'next_2h_count', 0, 'data_source', 'no_staff_record'),
      'week_attendance', jsonb_build_object('pct', 0, 'days_marked', 0, 'days_total', 0, 'data_source', 'no_staff_record'),
      'teaching_excellence_score', jsonb_build_object('score', 0, 'band', 'red', 'components', '{}'::jsonb, 'data_source', 'no_staff_record'),
      'scope', jsonb_build_object('user_id', v_user_id, 'institution_id', v_institution_id, 'computed_at', now())
    );
  END IF;

  -- Existing today's classes + marking detection (unchanged)
  FOR v_tt IN
    SELECT t.timetable_data, t.periods, t.section_id, sec.section_name
    FROM timetables t
    LEFT JOIN sections sec ON sec.id = t.section_id
    WHERE t.is_active = true
      AND t.institution_id = v_institution_id
      AND t.timetable_data IS NOT NULL
      AND t.periods IS NOT NULL
      AND t.timetable_data ? v_day_name
  LOOP
    FOR v_period IN SELECT * FROM jsonb_array_elements(v_tt.periods)
    LOOP
      IF (v_period->>'is_break')::boolean THEN CONTINUE; END IF;
      v_period_id := v_period->>'period_id';
      v_start_time := (v_period->>'start_time')::time;
      v_end_time := (v_period->>'end_time')::time;
      v_period_name := v_period->>'period_name';
      v_slot := v_tt.timetable_data->v_day_name->v_period_id;
      IF v_slot IS NULL THEN CONTINUE; END IF;

      IF v_slot->>'primary_staff_id' = v_staff_id::text
         OR v_slot->'staff_ids' @> to_jsonb(v_staff_id::text) THEN
        v_total_today := v_total_today + 1;
        v_course_code := '';
        v_course_name := '';
        BEGIN
          SELECT c.course_code, c.course_name INTO v_course_code, v_course_name
          FROM courses c WHERE c.id = (v_slot->>'course_id')::uuid;
        EXCEPTION WHEN OTHERS THEN NULL; END;

        v_section_name := COALESCE(v_tt.section_name, 'Unknown Section');

        v_has_marked := EXISTS (
          SELECT 1 FROM student_attendance sa
          WHERE sa.attendance_date = v_today
            AND sa.timetable_id IN (
              SELECT t2.id FROM timetables t2
              WHERE t2.is_active = true AND t2.institution_id = v_institution_id AND t2.section_id = v_tt.section_id
            )
            AND sa.attendance_data ? v_period_id
        );
        IF v_has_marked THEN v_marked_today := v_marked_today + 1; END IF;

        IF v_start_time >= v_now_time AND v_start_time < v_cutoff_time THEN
          v_next_2h_count := v_next_2h_count + 1;
          v_upcoming := v_upcoming || jsonb_build_object(
            'course', COALESCE(NULLIF(v_course_code, ''), v_course_name, v_period_name),
            'time', to_char(v_start_time, 'HH24:MI') || '-' || to_char(v_end_time, 'HH24:MI'),
            'section', v_section_name
          );
        END IF;
      END IF;
    END LOOP;
  END LOOP;

  v_week_days_total := LEAST(extract(isodow from v_today)::int, 5);

  SELECT COUNT(DISTINCT sa.attendance_date) INTO v_week_days_marked
  FROM student_attendance sa,
       jsonb_each(sa.attendance_data) AS periods(period_key, period_val)
  WHERE sa.attendance_date >= v_week_start
    AND sa.attendance_date <= LEAST(v_today, v_week_end)
    AND sa.institution_id = v_institution_id
    AND period_val->'marked_by_details'->>'marker_id' = v_user_id::text;

  IF v_week_days_total > 0 THEN
    v_week_pct := ROUND((v_week_days_marked::numeric / v_week_days_total) * 100, 1);
  END IF;

  -- ═══════════════════════════════════════════════════════════════
  -- NEW — TES COMPUTATION (trailing 30 days)
  -- ═══════════════════════════════════════════════════════════════

  -- Component 1: student_attendance (25%) — % Present in classes marked by this faculty
  BEGIN
    SELECT
      COALESCE(SUM((SELECT COUNT(*) FROM jsonb_each(sa.attendance_data) AS pkv,
        LATERAL jsonb_array_elements(pkv.value -> 'students') AS se
        WHERE se ->> 'status' = 'Present'
          AND pkv.value->'marked_by_details'->>'marker_id' = v_user_id::text)), 0),
      COALESCE(SUM((SELECT COUNT(*) FROM jsonb_each(sa.attendance_data) AS pkv,
        LATERAL jsonb_array_elements(pkv.value -> 'students') AS se
        WHERE pkv.value->'marked_by_details'->>'marker_id' = v_user_id::text)), 0)
    INTO v_tes_stu_present, v_tes_stu_total
    FROM student_attendance sa
    WHERE sa.attendance_date >= v_30d_start
      AND sa.institution_id = v_institution_id;

    IF v_tes_stu_total > 0 THEN
      v_tes_stu_att := LEAST(100, GREATEST(0, ROUND((v_tes_stu_present::numeric / v_tes_stu_total::numeric) * 100)));
    END IF;
  EXCEPTION WHEN OTHERS THEN v_tes_stu_att := NULL; END;

  -- Component 2: marking_compliance (25%) — % of distinct marking days in last 30d
  -- Denominator = weekdays in last 30d (~22). Numerator = distinct days this faculty marked anything.
  BEGIN
    SELECT COUNT(DISTINCT sa.attendance_date)
    INTO v_tes_marked_rows
    FROM student_attendance sa,
         jsonb_each(sa.attendance_data) AS pkv(period_key, period_val)
    WHERE sa.attendance_date >= v_30d_start
      AND sa.attendance_date <= v_today
      AND sa.institution_id = v_institution_id
      AND period_val->'marked_by_details'->>'marker_id' = v_user_id::text;

    -- Approx weekdays in trailing 30d window = 22
    v_tes_assigned_rows := 22;
    IF v_tes_assigned_rows > 0 THEN
      v_tes_marking := LEAST(100, GREATEST(0, ROUND((v_tes_marked_rows::numeric / v_tes_assigned_rows::numeric) * 100)));
    END IF;
  EXCEPTION WHEN OTHERS THEN v_tes_marking := NULL; END;

  -- Component 3: feedback_nps (25%) — NULL until NPS schema lands
  v_tes_nps := NULL;

  -- Component 4: research_mentorship (25%) — NULL until research/mentorship schema lands
  v_tes_research := NULL;

  v_tes_composite := compute_renormalized_composite(
    jsonb_build_object(
      'student_attendance', v_tes_stu_att,
      'marking_compliance', v_tes_marking,
      'feedback_nps', v_tes_nps,
      'research_mentorship', v_tes_research
    ),
    jsonb_build_object(
      'student_attendance', 25,
      'marking_compliance', 25,
      'feedback_nps', 25,
      'research_mentorship', 25
    )
  );

  RETURN jsonb_build_object(
    'unmarked_classes', jsonb_build_object('count', v_total_today - v_marked_today, 'total_today', v_total_today),
    'learner_flags', jsonb_build_object('count', 0, 'data_source', 'not_available'),
    'upcoming_timetable', jsonb_build_object('classes', v_upcoming, 'next_2h_count', v_next_2h_count),
    'week_attendance', jsonb_build_object('pct', v_week_pct, 'days_marked', v_week_days_marked, 'days_total', v_week_days_total),
    'teaching_excellence_score', v_tes_composite || jsonb_build_object(
      'components', jsonb_build_object(
        'student_attendance', v_tes_stu_att,
        'marking_compliance', v_tes_marking,
        'feedback_nps', v_tes_nps,
        'research_mentorship', v_tes_research
      ),
      'window', 'trailing_30_days'
    ),
    'scope', jsonb_build_object('user_id', v_user_id, 'institution_id', v_institution_id, 'computed_at', now())
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.fn_faculty_metrics() TO authenticated;
