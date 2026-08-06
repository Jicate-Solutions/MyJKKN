-- =====================================================================
-- "All JKKN College Learners" audience — colleges only, NOT schools
-- Created: 2026-08-04
-- =====================================================================
-- ASK (Director, 2026-08-04): make an audience for all JKKN college learners
-- on /notifications/admin/new — and it must NOT include school learners.
--
-- Why this needed a new built-in: none of the existing audience rules can
-- express "students, excluding schools". `all_students` is
-- role='student' across EVERY institution, which includes the two schools
-- (JKKN Matric Higher Secondary 552 + Nattraja Vidhyalya CBSE 226 = 778), and
-- `institution_filter` targets exactly ONE institution, so covering 7 colleges
-- would mean 7 separate sends. The `sql` query_type is a stub that resolves to
-- zero users.
--
-- Discriminator: institutions.entity_type — 'institution' = college,
-- 'school' = school. (Also present: company / admin_office, which have no
-- students.) Counts at 2026-08-04: all_students 5,690 = 4,912 college
-- + 778 school. This audience resolves to the 4,912.
--
-- Grants unchanged: resolve_audience stays SECURITY DEFINER, service_role only
-- (it is called by the send/preview API via the service-role client, never by
-- an end user). NOTE for a follow-up: this function has no `SET search_path`
-- and never has — preserved verbatim here rather than changed mid-bugfix.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.resolve_audience(p_audience_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_audience RECORD;
  v_user_ids UUID[];
  v_count INTEGER;
  v_built_in TEXT;
  v_params JSONB;
BEGIN
  SELECT * INTO v_audience FROM notification_audiences WHERE id = p_audience_id AND is_active = true;
  IF v_audience IS NULL THEN
    RETURN json_build_object('error', 'Audience not found or inactive', 'user_ids', '[]'::json, 'count', 0);
  END IF;

  v_params := v_audience.query_params;
  v_built_in := v_params->>'name';

  IF v_audience.query_type = 'built_in' THEN

    IF v_built_in = 'all_active_users' THEN
      SELECT ARRAY(SELECT id FROM profiles WHERE is_active = true) INTO v_user_ids;

    ELSIF v_built_in = 'all_students' THEN
      SELECT ARRAY(SELECT id FROM profiles WHERE is_active = true AND role = 'student') INTO v_user_ids;

    ELSIF v_built_in = 'college_students' THEN
      -- COLLEGE learners only — deliberately EXCLUDES school students.
      -- institutions.entity_type is the discriminator: 'institution' = college,
      -- 'school' = JKKN Matric Higher Secondary / Nattraja Vidhyalya CBSE.
      -- 'all_students' above sweeps in both (5,690); this resolves to the
      -- college-only subset (4,912 at 2026-08-04). The JOIN also drops students
      -- with no institution_id (0 today) — they are unaddressable anyway.
      SELECT ARRAY(
        SELECT p.id FROM profiles p
        JOIN institutions i ON i.id = p.institution_id
        WHERE p.is_active = true
          AND p.role = 'student'
          AND i.entity_type = 'institution'
      ) INTO v_user_ids;

    ELSIF v_built_in = 'all_faculty' THEN
      SELECT ARRAY(SELECT id FROM profiles WHERE is_active = true AND role IN ('faculty', 'hod', 'principal')) INTO v_user_ids;

    ELSIF v_built_in = 'all_hods' THEN
      SELECT ARRAY(SELECT id FROM profiles WHERE is_active = true AND role = 'hod') INTO v_user_ids;

    ELSIF v_built_in = 'role_filter' THEN
      SELECT ARRAY(
        SELECT id FROM profiles
        WHERE is_active = true
        AND role = ANY(ARRAY(SELECT jsonb_array_elements_text(v_params->'roles')))
      ) INTO v_user_ids;

    ELSIF v_built_in = 'institution_filter' THEN
      SELECT ARRAY(
        SELECT id FROM profiles
        WHERE is_active = true
        AND institution_id = (v_params->>'institution_id')::uuid
      ) INTO v_user_ids;

    ELSIF v_built_in = 'login_recency' THEN
      IF v_params ? 'not_logged_in_days' THEN
        SELECT ARRAY(
          SELECT p.id FROM profiles p
          WHERE p.is_active = true
          AND NOT EXISTS (
            SELECT 1 FROM user_sessions us
            WHERE us.user_id = p.id
            AND us.created_at >= NOW() - ((v_params->>'not_logged_in_days')::int || ' days')::interval
          )
        ) INTO v_user_ids;
      ELSIF v_params ? 'logged_in_within_days' THEN
        SELECT ARRAY(
          SELECT DISTINCT us.user_id FROM user_sessions us
          WHERE us.created_at >= NOW() - ((v_params->>'logged_in_within_days')::int || ' days')::interval
        ) INTO v_user_ids;
      ELSE
        v_user_ids := ARRAY[]::UUID[];
      END IF;

    ELSIF v_built_in = 'push_subscribers' THEN
      SELECT ARRAY(SELECT DISTINCT user_id FROM push_subscriptions) INTO v_user_ids;

    ELSIF v_built_in = 'no_push' THEN
      SELECT ARRAY(
        SELECT p.id FROM profiles p
        WHERE p.is_active = true
        AND NOT EXISTS (SELECT 1 FROM push_subscriptions ps WHERE ps.user_id = p.id)
      ) INTO v_user_ids;

    ELSIF v_built_in = 'attendance_below' THEN
      -- Use student_engagement_scores.is_at_risk flag for attendance-based filtering
      -- is_at_risk is computed from actual attendance data
      SELECT ARRAY(
        SELECT DISTINCT ses.user_id FROM student_engagement_scores ses
        WHERE ses.is_at_risk = true
      ) INTO v_user_ids;

    ELSIF v_built_in = 'work_pulse_laggards' THEN
      SELECT ARRAY(
        SELECT p.id FROM profiles p
        WHERE p.is_active = true
        AND NOT EXISTS (
          SELECT 1 FROM wp_pulse_entries wp
          WHERE wp.user_id = p.id
          AND wp.created_at >= date_trunc('week', NOW())
        )
      ) INTO v_user_ids;

    ELSIF v_built_in = 'hostel_residents' THEN
      v_user_ids := ARRAY[]::UUID[];
    ELSIF v_built_in = 'bus_commuters' THEN
      v_user_ids := ARRAY[]::UUID[];
    ELSE
      v_user_ids := ARRAY[]::UUID[];
    END IF;

  ELSIF v_audience.query_type = 'sql' THEN
    v_user_ids := ARRAY[]::UUID[];
  ELSE
    v_user_ids := ARRAY[]::UUID[];
  END IF;

  v_count := COALESCE(array_length(v_user_ids, 1), 0);

  RETURN json_build_object(
    'audience_id', v_audience.id,
    'name', v_audience.name,
    'user_ids', to_json(v_user_ids),
    'count', v_count
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.resolve_audience(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.resolve_audience(uuid) TO service_role;

-- Seed the ready-to-pick audience so it appears in the compose form's
-- saved-audience list. Idempotent: skipped if an audience of this name exists.
INSERT INTO public.notification_audiences (name, description, icon, query_type, query_params, is_active)
SELECT
  'All JKKN College Learners',
  'Every active learner across the JKKN colleges. Excludes school learners (Matric Hr. Sec. and Nattraja Vidhyalya CBSE).',
  'GraduationCap',
  'built_in',
  jsonb_build_object('name', 'college_students'),
  true
WHERE NOT EXISTS (
  SELECT 1 FROM public.notification_audiences WHERE name = 'All JKKN College Learners'
);
