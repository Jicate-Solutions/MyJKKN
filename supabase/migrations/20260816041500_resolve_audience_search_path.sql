-- Updated: 2026-08-09 - Harden public.resolve_audience(uuid): pin search_path + schema-qualify
--
-- WHY: resolve_audience is SECURITY DEFINER but has NEVER carried a pinned
-- `SET search_path`. A SECURITY DEFINER function without a pinned search_path is
-- vulnerable to search_path manipulation: a caller able to set search_path can put a
-- schema they control ahead of `public` and shadow any table/function the body
-- resolves UNQUALIFIED — the shadowed object then runs with the definer's (postgres)
-- privileges. Exposure is limited today because EXECUTE is granted only to
-- service_role and postgres (verified on prod 2026-08-09:
-- proacl = postgres=X/postgres, service_role=X/postgres), but it is invoked by the
-- notification send path, so the gap is closed rather than accepted.
--
-- WHAT CHANGED: this is a HARDENING change, NOT a behavior change.
--   1. Added `SET search_path = public`.
--   2. Schema-qualified every table reference in the body (public.<table>).
-- The logic — including the `college_students` branch added 2026-08-04 — is
-- byte-identical otherwise. Built-in functions (json_build_object, to_json,
-- jsonb_array_elements_text, date_trunc, array_length, coalesce, now) are left
-- unqualified deliberately: pg_catalog is implicitly searched FIRST whenever it is
-- not named explicitly in search_path, so they cannot be shadowed by a public-schema
-- function.
--
-- Schema-qualification is the actual defense; the SET is the belt to those braces.
--
-- PROVEN no-op inside BEGIN..ROLLBACK against prod before shipping:
-- resolve_audience('1bc31f08-36c2-4146-ba26-2726c65febcb') -- 'All JKKN College Learners'
-- returned count = 4936 BEFORE the replacement and count = 4936 AFTER, same txn, and the
-- md5 of the returned user_ids array was byte-identical (3af1a0076168462df16b7296f214da5e)
-- on both sides — same members, same order, not merely the same cardinality.
--
-- SIBLING CHECKED: public.resolve_audience_preview(text, jsonb) already has
-- proconfig = {search_path=public} on prod. Left untouched.

CREATE OR REPLACE FUNCTION public.resolve_audience(p_audience_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_audience RECORD;
  v_user_ids UUID[];
  v_count INTEGER;
  v_built_in TEXT;
  v_params JSONB;
BEGIN
  SELECT * INTO v_audience FROM public.notification_audiences WHERE id = p_audience_id AND is_active = true;
  IF v_audience IS NULL THEN
    RETURN json_build_object('error', 'Audience not found or inactive', 'user_ids', '[]'::json, 'count', 0);
  END IF;

  v_params := v_audience.query_params;
  v_built_in := v_params->>'name';

  IF v_audience.query_type = 'built_in' THEN

    IF v_built_in = 'all_active_users' THEN
      SELECT ARRAY(SELECT id FROM public.profiles WHERE is_active = true) INTO v_user_ids;

    ELSIF v_built_in = 'all_students' THEN
      SELECT ARRAY(SELECT id FROM public.profiles WHERE is_active = true AND role = 'student') INTO v_user_ids;

    ELSIF v_built_in = 'college_students' THEN
      -- COLLEGE learners only — deliberately EXCLUDES school students.
      -- institutions.entity_type is the discriminator: 'institution' = college,
      -- 'school' = JKKN Matric Higher Secondary / Nattraja Vidhyalya CBSE.
      -- 'all_students' above sweeps in both (5,690); this resolves to the
      -- college-only subset (4,912 at 2026-08-04). The JOIN also drops students
      -- with no institution_id (0 today) — they are unaddressable anyway.
      SELECT ARRAY(
        SELECT p.id FROM public.profiles p
        JOIN public.institutions i ON i.id = p.institution_id
        WHERE p.is_active = true
          AND p.role = 'student'
          AND i.entity_type = 'institution'
      ) INTO v_user_ids;

    ELSIF v_built_in = 'all_faculty' THEN
      SELECT ARRAY(SELECT id FROM public.profiles WHERE is_active = true AND role IN ('faculty', 'hod', 'principal')) INTO v_user_ids;

    ELSIF v_built_in = 'all_hods' THEN
      SELECT ARRAY(SELECT id FROM public.profiles WHERE is_active = true AND role = 'hod') INTO v_user_ids;

    ELSIF v_built_in = 'role_filter' THEN
      SELECT ARRAY(
        SELECT id FROM public.profiles
        WHERE is_active = true
        AND role = ANY(ARRAY(SELECT jsonb_array_elements_text(v_params->'roles')))
      ) INTO v_user_ids;

    ELSIF v_built_in = 'institution_filter' THEN
      SELECT ARRAY(
        SELECT id FROM public.profiles
        WHERE is_active = true
        AND institution_id = (v_params->>'institution_id')::uuid
      ) INTO v_user_ids;

    ELSIF v_built_in = 'login_recency' THEN
      IF v_params ? 'not_logged_in_days' THEN
        SELECT ARRAY(
          SELECT p.id FROM public.profiles p
          WHERE p.is_active = true
          AND NOT EXISTS (
            SELECT 1 FROM public.user_sessions us
            WHERE us.user_id = p.id
            AND us.created_at >= NOW() - ((v_params->>'not_logged_in_days')::int || ' days')::interval
          )
        ) INTO v_user_ids;
      ELSIF v_params ? 'logged_in_within_days' THEN
        SELECT ARRAY(
          SELECT DISTINCT us.user_id FROM public.user_sessions us
          WHERE us.created_at >= NOW() - ((v_params->>'logged_in_within_days')::int || ' days')::interval
        ) INTO v_user_ids;
      ELSE
        v_user_ids := ARRAY[]::UUID[];
      END IF;

    ELSIF v_built_in = 'push_subscribers' THEN
      SELECT ARRAY(SELECT DISTINCT user_id FROM public.push_subscriptions) INTO v_user_ids;

    ELSIF v_built_in = 'no_push' THEN
      SELECT ARRAY(
        SELECT p.id FROM public.profiles p
        WHERE p.is_active = true
        AND NOT EXISTS (SELECT 1 FROM public.push_subscriptions ps WHERE ps.user_id = p.id)
      ) INTO v_user_ids;

    ELSIF v_built_in = 'attendance_below' THEN
      -- Use student_engagement_scores.is_at_risk flag for attendance-based filtering
      -- is_at_risk is computed from actual attendance data
      SELECT ARRAY(
        SELECT DISTINCT ses.user_id FROM public.student_engagement_scores ses
        WHERE ses.is_at_risk = true
      ) INTO v_user_ids;

    ELSIF v_built_in = 'work_pulse_laggards' THEN
      SELECT ARRAY(
        SELECT p.id FROM public.profiles p
        WHERE p.is_active = true
        AND NOT EXISTS (
          SELECT 1 FROM public.wp_pulse_entries wp
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

-- Grants: preserve EXACTLY what prod has today (service_role + postgres only).
-- The explicit anon revoke is mandatory per CLAUDE.md: Supabase's default
-- `ALTER DEFAULT PRIVILEGES ... GRANT ALL ON FUNCTIONS TO anon` hands anon a direct
-- EXECUTE grant on every new/replaced function, separate from PUBLIC.
REVOKE EXECUTE ON FUNCTION public.resolve_audience(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.resolve_audience(uuid) TO service_role;

COMMENT ON FUNCTION public.resolve_audience(uuid) IS
  'Resolves a notification_audiences row to its user_ids + count. SECURITY DEFINER with pinned search_path = public and fully schema-qualified table references (hardened 2026-08-09). EXECUTE limited to service_role/postgres — invoked by the notification send path.';
