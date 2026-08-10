-- Updated: 2026-08-10 - Three built_in audience arms still resolve DEACTIVATED profiles
--
-- ⚠️ FILE ONLY — NOT APPLIED. Director-gated.
--
-- WHY: every other built_in arm of public.resolve_audience guards on
-- `profiles.is_active = true`. Three did not, so a deactivated learner/staff member —
-- someone who has left the institution — was still resolved as a notification
-- recipient. Verified live on prod 2026-08-10 (read-only):
--
--   arm                                    recipients   of which DEACTIVATED
--   attendance_below                            4,698                    480
--   push_subscribers                            1,312                     27
--   login_recency / logged_in_within_days   (see below)                (see below)
--
-- The login_recency leak is PARAMETER-DEPENDENT, and the honest number is smaller than
-- it first looks. The only live audience on that branch is 'Active Today'
-- (logged_in_within_days = 1), which resolves 156 recipients and 0 deactivated TODAY.
-- The 7 deactivated reported for this arm reproduce at a 30-day window; at 90 days it is
-- 20. So this arm is a LATENT leak that fires the moment an admin widens the window —
-- it is fixed on the same principle, not because it is leaking right now.
--
-- WHAT CHANGED — exactly three arms, nothing else:
--   1. attendance_below                     JOIN public.profiles p ON p.id = ses.user_id
--                                           + AND p.is_active = true
--   2. push_subscribers                     JOIN public.profiles p ON p.id = ps.user_id
--                                           + WHERE p.is_active = true
--   3. login_recency/logged_in_within_days  JOIN public.profiles p ON p.id = us.user_id
--                                           + WHERE p.is_active = true
-- Style deliberately matches the sibling `not_logged_in_days` branch, which has always
-- carried the guard. No signature change, no grant change, no other arm touched.
--
-- BUILT ON THE HARDENED BODY (20260816041500, applied to prod 2026-08-10): the pinned
-- `SET search_path = public` and every `public.<table>` qualification are preserved
-- verbatim, as is the REVOKE/GRANT block. Live prod def before this change:
-- proconfig = {search_path=public}, proacl = {postgres=X/postgres,service_role=X/postgres},
-- md5(pg_get_functiondef) = fa5d285cd67e73d2ed27db5231e79f14.
--
-- IS THE INNER JOIN SAFE? For two of the three arms it is provably equivalent to adding a
-- predicate, because the FK guarantees the profiles row exists:
--   push_subscriptions.user_id       → FK profiles(id) ON DELETE CASCADE
--   student_engagement_scores.user_id → FK profiles(id) ON DELETE CASCADE (also auth.users)
-- Measured orphans (source rows with no profiles row) on both: 0.
-- user_sessions.user_id is the exception — it FKs auth.users(id), NOT profiles — and
-- carries 2 all-time orphans. Those 2 are therefore dropped by this change IN ADDITION to
-- the deactivated ones. That is intended and unavoidable: "is this profile deactivated?"
-- is only answerable from a profiles row, so a user_id with no profile cannot be cleared.
-- Such an id is an unaddressable ghost anyway (no role, no institution, no delivery
-- surface), and at the live 1-day window the orphan count is 0.
--
-- NULL SAFETY: `p.is_active = true` (not `IS NOT FALSE`) matches every sibling arm, and
-- profiles.is_active has ZERO NULLs on prod (0 null / 825 false / 6,417 true / 7,242 total),
-- so no third-state row is silently dropped.
--
-- UNTOUCHED ARMS PROVEN UNCHANGED: resolve_audience('1bc31f08-36c2-4146-ba26-2726c65febcb')
-- ('All JKKN College Learners', the college_students arm) returns count = 4942 — its value
-- immediately after the 2026-08-10 hardening — and this migration does not touch that arm.

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
        -- FIXED 2026-08-10: was missing the is_active guard its sibling branch
        -- (not_logged_in_days, directly above) has always had.
        SELECT ARRAY(
          SELECT DISTINCT us.user_id FROM public.user_sessions us
          JOIN public.profiles p ON p.id = us.user_id
          WHERE p.is_active = true
          AND us.created_at >= NOW() - ((v_params->>'logged_in_within_days')::int || ' days')::interval
        ) INTO v_user_ids;
      ELSE
        v_user_ids := ARRAY[]::UUID[];
      END IF;

    ELSIF v_built_in = 'push_subscribers' THEN
      -- FIXED 2026-08-10: was missing the is_active guard.
      SELECT ARRAY(
        SELECT DISTINCT ps.user_id FROM public.push_subscriptions ps
        JOIN public.profiles p ON p.id = ps.user_id
        WHERE p.is_active = true
      ) INTO v_user_ids;

    ELSIF v_built_in = 'no_push' THEN
      SELECT ARRAY(
        SELECT p.id FROM public.profiles p
        WHERE p.is_active = true
        AND NOT EXISTS (SELECT 1 FROM public.push_subscriptions ps WHERE ps.user_id = p.id)
      ) INTO v_user_ids;

    ELSIF v_built_in = 'attendance_below' THEN
      -- Use student_engagement_scores.is_at_risk flag for attendance-based filtering
      -- is_at_risk is computed from actual attendance data
      -- FIXED 2026-08-10: was missing the is_active guard.
      SELECT ARRAY(
        SELECT DISTINCT ses.user_id FROM public.student_engagement_scores ses
        JOIN public.profiles p ON p.id = ses.user_id
        WHERE ses.is_at_risk = true
          AND p.is_active = true
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
  'Resolves a notification_audiences row to its user_ids + count. SECURITY DEFINER with pinned search_path = public and fully schema-qualified table references (hardened 2026-08-09). Every built_in arm excludes deactivated profiles (is_active = true) — the attendance_below, push_subscribers and login_recency/logged_in_within_days arms were missing that guard until 2026-08-10. EXECUTE limited to service_role/postgres — invoked by the notification send path.';
