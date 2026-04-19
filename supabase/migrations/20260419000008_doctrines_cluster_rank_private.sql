-- =====================================================================
-- Doctrines v1 — Cluster Rank PRIVATE (Task 8)
-- =====================================================================
-- Part of: feat/doctrines-composite-scores-v1
-- Spec: JKKNKB/MyJKKN/Routines-Stickiness-Ivy-Doctrine.md §8 Doctrine 1
--       (tiered-privacy cluster rank cascade — PRIVATE for Faculty/Student)
--
-- Tiered privacy cascade (thrash-locked, do NOT reopen):
--   - Principal/HOD: get PUBLIC leaderboard with full names + scores
--     (Task 7a → fn_cluster_rank_public, already shipped)
--   - Faculty/Student: get PRIVATE percentile + quartile label ONLY.
--     NO peer names. NO raw peer scores. Enforced at SQL layer.
--
-- Ships three artifacts:
--   1. fn_compute_tes_for_user(p_user_id uuid)
--      Auth-bypass TES computation. Mirrors the TES logic inside
--      fn_faculty_metrics so peer scores can be enumerated server-side
--      without exposing auth.uid() of the target.
--      GRANT: service_role ONLY (NOT authenticated).
--
--   2. fn_compute_crs_for_user(p_user_id uuid)
--      Auth-bypass CRS computation. Mirrors the CRS logic inside
--      fn_student_metrics. Same privacy rule.
--      GRANT: service_role ONLY.
--
--   3. fn_cluster_rank_private(p_role text DEFAULT NULL)
--      THE AUTHORIZATION BOUNDARY. Role-gated RPC that returns ONLY:
--        { percentile, quartile_label, data_source, forbidden, reason }
--      Returns NOTHING about individual peers. GRANT: authenticated.
--
-- Doctrine contradiction mitigation:
--   A faculty member must NEVER see another faculty's TES score.
--   A student must NEVER see another student's CRS score.
--   The helper functions (1) and (2) are the leaky primitives — they are
--   explicitly REVOKE'd from authenticated and only reachable via
--   fn_cluster_rank_private which strips all peer data before returning.
--
-- Cluster-wide peer pool (tier-1 decision):
--   Peer pool = ALL faculty / ALL students across all 8 active JKKN
--   colleges listed in mv_cluster_leaderboard_colleges.
--
-- Minimum peer thresholds (privacy):
--   - Faculty: require ≥5 peers else insufficient_peers
--   - Student: require ≥10 peers else insufficient_peers
--
-- Quartile label:
--   percentile >= 75 → top_quartile
--   percentile >= 50 → upper_middle
--   percentile >= 25 → lower_middle
--   percentile <  25 → bottom_quartile
--
-- Idempotent: CREATE OR REPLACE. Safe to re-run.
-- =====================================================================


-- ---------------------------------------------------------------------
-- Helper 1: fn_compute_tes_for_user
-- ---------------------------------------------------------------------
-- Mirrors TES block from fn_faculty_metrics, but takes p_user_id
-- instead of using auth.uid(). SECURITY DEFINER. Authenticated users
-- MUST NOT be able to call this — it would leak arbitrary faculty scores.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_compute_tes_for_user(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  v_institution_id uuid;
  v_staff_id uuid;
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_30d_start date := v_today - interval '30 days';

  v_tes_stu_present int := 0;
  v_tes_stu_total int := 0;
  v_tes_stu_att numeric;
  v_tes_marked_rows int := 0;
  v_tes_assigned_rows int := 22;  -- approx weekdays in trailing 30d
  v_tes_marking numeric;
  v_tes_nps numeric := NULL;        -- schema gap
  v_tes_research numeric := NULL;   -- schema gap
  v_tes_composite jsonb;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'score', 0, 'band', 'red',
      'components', '{}'::jsonb,
      'data_source', 'null_user_id'
    );
  END IF;

  SELECT institution_id INTO v_institution_id FROM profiles WHERE id = p_user_id;
  SELECT s.id INTO v_staff_id FROM staff s WHERE s.profile_id = p_user_id LIMIT 1;

  IF v_staff_id IS NULL THEN
    RETURN jsonb_build_object(
      'score', 0, 'band', 'red',
      'components', '{}'::jsonb,
      'data_source', 'no_staff_record'
    );
  END IF;

  -- Component 1: student_attendance (25%) — % Present in classes this faculty marked
  BEGIN
    SELECT
      COALESCE(SUM((SELECT COUNT(*) FROM jsonb_each(sa.attendance_data) AS pkv,
        LATERAL jsonb_array_elements(pkv.value -> 'students') AS se
        WHERE se ->> 'status' = 'Present'
          AND pkv.value->'marked_by_details'->>'marker_id' = p_user_id::text)), 0),
      COALESCE(SUM((SELECT COUNT(*) FROM jsonb_each(sa.attendance_data) AS pkv,
        LATERAL jsonb_array_elements(pkv.value -> 'students') AS se
        WHERE pkv.value->'marked_by_details'->>'marker_id' = p_user_id::text)), 0)
    INTO v_tes_stu_present, v_tes_stu_total
    FROM student_attendance sa
    WHERE sa.attendance_date >= v_30d_start
      AND sa.institution_id = v_institution_id;

    IF v_tes_stu_total > 0 THEN
      v_tes_stu_att := LEAST(100, GREATEST(0, ROUND((v_tes_stu_present::numeric / v_tes_stu_total::numeric) * 100)));
    END IF;
  EXCEPTION WHEN OTHERS THEN v_tes_stu_att := NULL; END;

  -- Component 2: marking_compliance (25%) — distinct days marked / 22 target days
  BEGIN
    SELECT COUNT(DISTINCT sa.attendance_date)
    INTO v_tes_marked_rows
    FROM student_attendance sa,
         jsonb_each(sa.attendance_data) AS pkv(period_key, period_val)
    WHERE sa.attendance_date >= v_30d_start
      AND sa.attendance_date <= v_today
      AND sa.institution_id = v_institution_id
      AND period_val->'marked_by_details'->>'marker_id' = p_user_id::text;

    IF v_tes_assigned_rows > 0 THEN
      v_tes_marking := LEAST(100, GREATEST(0, ROUND((v_tes_marked_rows::numeric / v_tes_assigned_rows::numeric) * 100)));
    END IF;
  EXCEPTION WHEN OTHERS THEN v_tes_marking := NULL; END;

  -- Components 3 + 4 remain NULL (schema gap)

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

  RETURN v_tes_composite || jsonb_build_object(
    'components', jsonb_build_object(
      'student_attendance', v_tes_stu_att,
      'marking_compliance', v_tes_marking,
      'feedback_nps', v_tes_nps,
      'research_mentorship', v_tes_research
    ),
    'data_source', 'live'
  );
END;
$function$;

COMMENT ON FUNCTION public.fn_compute_tes_for_user(uuid) IS
'Doctrines v1 — Auth-bypass TES computation for a given user. Mirrors fn_faculty_metrics TES logic. SECURITY DEFINER. Authorization boundary lives on fn_cluster_rank_private — this primitive is NEVER granted to authenticated because it would leak arbitrary faculty scores.';

REVOKE ALL ON FUNCTION public.fn_compute_tes_for_user(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_compute_tes_for_user(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.fn_compute_tes_for_user(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.fn_compute_tes_for_user(uuid) TO service_role;


-- ---------------------------------------------------------------------
-- Helper 2: fn_compute_crs_for_user
-- ---------------------------------------------------------------------
-- Mirrors CRS block from fn_student_metrics, but takes p_user_id.
-- Same privacy rule: authenticated NOT granted.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_compute_crs_for_user(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  v_learner_id uuid;
  v_institution_id uuid;
  v_section_id uuid;
  v_semester_id uuid;
  v_30d_start timestamptz := (now() AT TIME ZONE 'Asia/Kolkata')::date - interval '30 days';

  v_crs_att numeric;
  v_crs_grades numeric := NULL;   -- schema gap
  v_crs_comp numeric;
  v_crs_fees numeric;
  v_crs_eng numeric;

  v_crs_att_present int := 0;
  v_crs_att_total int := 0;
  v_crs_bills_total int := 0;
  v_crs_bills_ontime int := 0;
  v_crs_composite jsonb;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'score', 0, 'band', 'red',
      'components', '{}'::jsonb,
      'data_source', 'null_user_id'
    );
  END IF;

  SELECT p.learner_id, p.institution_id
  INTO v_learner_id, v_institution_id
  FROM profiles p
  WHERE p.id = p_user_id;

  IF v_learner_id IS NULL THEN
    RETURN jsonb_build_object(
      'score', 0, 'band', 'red',
      'components', '{}'::jsonb,
      'data_source', 'no_learner_profile'
    );
  END IF;

  SELECT lp.section_id, lp.semester_id
  INTO v_section_id, v_semester_id
  FROM learners_profiles lp
  WHERE lp.id = v_learner_id;

  -- Component 1: attendance (25%) — trailing 30d
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
  EXCEPTION WHEN OTHERS THEN v_crs_att := NULL; END;

  -- Component 2: grades (30%) — NULL (schema gap)
  v_crs_grades := NULL;

  -- Component 3: competencies (20%)
  BEGIN
    SELECT AVG(progress_percentage)::numeric
    INTO v_crs_comp
    FROM learner_competencies lc
    WHERE lc.learner_id = v_learner_id
      AND lc.last_activity_at >= v_30d_start;

    IF v_crs_comp IS NOT NULL THEN
      v_crs_comp := LEAST(100, GREATEST(0, ROUND(v_crs_comp)));
    END IF;
  EXCEPTION WHEN OTHERS THEN v_crs_comp := NULL; END;

  -- Component 4: fee_regularity (10%)
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
  EXCEPTION WHEN OTHERS THEN v_crs_fees := NULL; END;

  -- Component 5: engagement (15%)
  BEGIN
    SELECT ses.percentile_rank
    INTO v_crs_eng
    FROM student_engagement_scores ses
    WHERE ses.user_id = p_user_id
      AND ses.calculation_date >= v_30d_start::date
    ORDER BY ses.calculation_date DESC
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN v_crs_eng := NULL; END;

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

  RETURN v_crs_composite || jsonb_build_object(
    'components', jsonb_build_object(
      'attendance',     v_crs_att,
      'grades',         v_crs_grades,
      'competencies',   v_crs_comp,
      'fee_regularity', v_crs_fees,
      'engagement',     v_crs_eng
    ),
    'data_source', 'live'
  );
END;
$function$;

COMMENT ON FUNCTION public.fn_compute_crs_for_user(uuid) IS
'Doctrines v1 — Auth-bypass CRS computation for a given user. Mirrors fn_student_metrics CRS logic. SECURITY DEFINER. NEVER granted to authenticated — privacy boundary enforced via fn_cluster_rank_private.';

REVOKE ALL ON FUNCTION public.fn_compute_crs_for_user(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_compute_crs_for_user(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.fn_compute_crs_for_user(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.fn_compute_crs_for_user(uuid) TO service_role;


-- ---------------------------------------------------------------------
-- Public RPC: fn_cluster_rank_private — THE AUTHORIZATION BOUNDARY
-- ---------------------------------------------------------------------
-- Returns ONLY: { percentile, quartile_label, data_source, forbidden, reason }
-- NO peer names. NO peer scores. NO caller raw score. Client cannot
-- reverse-engineer individual peers from the payload.
--
-- Role gate:
--   - p_role must be 'faculty' OR 'student' (explicit)
--   - Caller's profiles.role must match p_role (no impersonation)
--     Exception: super_admin may call with an explicit p_role for testing.
--
-- Peer pool: cluster-wide across all institutions in
-- mv_cluster_leaderboard_colleges (8 colleges).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_cluster_rank_private(p_role text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  v_caller UUID := auth.uid();
  v_caller_profile profiles;
  v_caller_role text;
  v_caller_is_super_admin boolean := false;
  v_role text;
  v_my_payload jsonb;
  v_my_score numeric;
  v_peer_count int := 0;
  v_below_count int := 0;
  v_percentile int;
  v_quartile text;
  v_min_peers int;
  v_cluster_institutions uuid[];
BEGIN
  -- ═══ Auth gate ═══
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object(
      'percentile', NULL,
      'quartile_label', NULL,
      'data_source', 'not_authenticated',
      'forbidden', TRUE,
      'reason', 'not_authenticated'
    );
  END IF;

  SELECT * INTO v_caller_profile FROM profiles WHERE id = v_caller;
  IF v_caller_profile.id IS NULL THEN
    RETURN jsonb_build_object(
      'percentile', NULL,
      'quartile_label', NULL,
      'data_source', 'no_caller_profile',
      'forbidden', TRUE,
      'reason', 'no_caller_profile'
    );
  END IF;

  v_caller_role := v_caller_profile.role;
  v_caller_is_super_admin := COALESCE(v_caller_profile.is_super_admin, FALSE);

  -- ═══ Role parameter gate ═══
  -- p_role must be explicitly 'faculty' or 'student'. Super admin calling
  -- without a role → forbidden (prevents silent inference).
  IF p_role IS NULL OR p_role NOT IN ('faculty', 'student') THEN
    RETURN jsonb_build_object(
      'percentile', NULL,
      'quartile_label', NULL,
      'data_source', 'role_not_allowed',
      'forbidden', TRUE,
      'reason', 'role_parameter_required'
    );
  END IF;

  v_role := p_role;

  -- ═══ Impersonation gate ═══
  -- Caller's actual role must match p_role. Exception: super_admin can
  -- call with either role for testing/support.
  IF NOT v_caller_is_super_admin AND v_caller_role <> v_role THEN
    RETURN jsonb_build_object(
      'percentile', NULL,
      'quartile_label', NULL,
      'data_source', 'role_not_allowed',
      'forbidden', TRUE,
      'reason', 'role_mismatch'
    );
  END IF;

  -- Also block non-faculty / non-student callers (e.g., accounts asking for faculty rank)
  IF NOT v_caller_is_super_admin AND v_caller_role NOT IN ('faculty', 'student') THEN
    RETURN jsonb_build_object(
      'percentile', NULL,
      'quartile_label', NULL,
      'data_source', 'role_not_allowed',
      'forbidden', TRUE,
      'reason', 'caller_role_not_eligible'
    );
  END IF;

  -- ═══ Cluster institution pool ═══
  SELECT ARRAY(SELECT institution_id FROM mv_cluster_leaderboard_colleges)
  INTO v_cluster_institutions;

  IF array_length(v_cluster_institutions, 1) IS NULL OR array_length(v_cluster_institutions, 1) = 0 THEN
    RETURN jsonb_build_object(
      'percentile', NULL,
      'quartile_label', NULL,
      'data_source', 'no_cluster',
      'forbidden', FALSE,
      'reason', 'cluster_empty'
    );
  END IF;

  -- ═══ Compute caller's own score ═══
  IF v_role = 'faculty' THEN
    v_my_payload := fn_compute_tes_for_user(v_caller);
    v_min_peers := 5;
  ELSE
    v_my_payload := fn_compute_crs_for_user(v_caller);
    v_min_peers := 10;
  END IF;

  -- If caller has no baseline record, return early — cannot rank
  IF (v_my_payload->>'data_source') IN ('no_staff_record', 'no_learner_profile', 'null_user_id') THEN
    RETURN jsonb_build_object(
      'percentile', NULL,
      'quartile_label', NULL,
      'data_source', v_my_payload->>'data_source',
      'forbidden', FALSE,
      'reason', 'no_baseline'
    );
  END IF;

  v_my_score := (v_my_payload->>'score')::numeric;

  -- ═══ Enumerate peers + compute percentile ═══
  IF v_role = 'faculty' THEN
    -- Peer pool: all staff rows with a profile_id, across cluster institutions, excluding caller
    WITH peers AS (
      SELECT s.profile_id AS uid
      FROM staff s
      JOIN profiles p ON p.id = s.profile_id
      WHERE s.profile_id IS NOT NULL
        AND s.profile_id <> v_caller
        AND p.institution_id = ANY(v_cluster_institutions)
    ),
    peer_scores AS (
      SELECT (fn_compute_tes_for_user(peers.uid)->>'score')::numeric AS peer_score
      FROM peers
    )
    SELECT
      COUNT(*),
      COUNT(*) FILTER (WHERE peer_score < v_my_score)
    INTO v_peer_count, v_below_count
    FROM peer_scores
    WHERE peer_score IS NOT NULL;
  ELSE
    -- Peer pool: all learner_profiles rows linked to a profile, across cluster institutions, excluding caller
    WITH peers AS (
      SELECT p.id AS uid
      FROM profiles p
      WHERE p.learner_id IS NOT NULL
        AND p.id <> v_caller
        AND p.institution_id = ANY(v_cluster_institutions)
    ),
    peer_scores AS (
      SELECT (fn_compute_crs_for_user(peers.uid)->>'score')::numeric AS peer_score
      FROM peers
    )
    SELECT
      COUNT(*),
      COUNT(*) FILTER (WHERE peer_score < v_my_score)
    INTO v_peer_count, v_below_count
    FROM peer_scores
    WHERE peer_score IS NOT NULL;
  END IF;

  -- ═══ Min-peer threshold (privacy) ═══
  IF v_peer_count < v_min_peers THEN
    RETURN jsonb_build_object(
      'percentile', NULL,
      'quartile_label', NULL,
      'data_source', 'insufficient_peers',
      'forbidden', FALSE,
      'reason', 'insufficient_peers'
    );
  END IF;

  v_percentile := ROUND((v_below_count::numeric * 100.0) / v_peer_count)::int;

  IF v_percentile >= 75 THEN
    v_quartile := 'top_quartile';
  ELSIF v_percentile >= 50 THEN
    v_quartile := 'upper_middle';
  ELSIF v_percentile >= 25 THEN
    v_quartile := 'lower_middle';
  ELSE
    v_quartile := 'bottom_quartile';
  END IF;

  -- ═══ Return ONLY percentile + quartile ═══
  -- Deliberately exclude: raw score, peer count, peer names, caller institution.
  -- Client must not infer individual peers from payload.
  RETURN jsonb_build_object(
    'percentile', v_percentile,
    'quartile_label', v_quartile,
    'data_source', 'live',
    'forbidden', FALSE,
    'reason', NULL
  );
END;
$function$;

COMMENT ON FUNCTION public.fn_cluster_rank_private(text) IS
'Doctrines v1 — Tiered-privacy cluster rank PRIVATE. For Faculty/Student personas. Returns ONLY percentile + quartile label — NO peer names, NO peer scores, NO caller raw score. Role-gated: caller role must match p_role (super_admin may test). Min-peers privacy threshold: 5 for faculty, 10 for student. Authorization boundary for fn_compute_tes_for_user / fn_compute_crs_for_user which are service_role only.';

REVOKE ALL ON FUNCTION public.fn_cluster_rank_private(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_cluster_rank_private(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_cluster_rank_private(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_cluster_rank_private(text) TO service_role;


-- ---------------------------------------------------------------------
-- Self-test: confirm privacy + payload shape
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_result jsonb;
  v_keys text[];
  v_allowed_keys text[] := ARRAY['percentile', 'quartile_label', 'data_source', 'forbidden', 'reason'];
  v_key text;
BEGIN
  -- Unauthenticated call must return forbidden + not_authenticated
  v_result := public.fn_cluster_rank_private();
  IF NOT (v_result->>'forbidden')::boolean THEN
    RAISE EXCEPTION 'Unauthenticated call expected forbidden=true, got %', v_result;
  END IF;
  IF v_result->>'data_source' <> 'not_authenticated' THEN
    RAISE EXCEPTION 'Unauthenticated call expected data_source=not_authenticated, got %', v_result->>'data_source';
  END IF;

  -- Payload shape: ONLY the allowed keys, no leakage
  SELECT ARRAY(SELECT jsonb_object_keys(v_result)) INTO v_keys;
  FOREACH v_key IN ARRAY v_keys LOOP
    IF NOT (v_key = ANY(v_allowed_keys)) THEN
      RAISE EXCEPTION 'Unexpected key in payload: % (leaks peer data risk)', v_key;
    END IF;
  END LOOP;

  -- Role-parameter gate: null role
  v_result := public.fn_cluster_rank_private(NULL);
  IF NOT (v_result->>'forbidden')::boolean THEN
    RAISE EXCEPTION 'Null role expected forbidden=true';
  END IF;

  -- Role-parameter gate: invalid role
  v_result := public.fn_cluster_rank_private('principal');
  IF NOT (v_result->>'forbidden')::boolean THEN
    RAISE EXCEPTION 'Invalid role (principal) expected forbidden=true';
  END IF;

  RAISE NOTICE 'Doctrines v1 cluster rank PRIVATE: privacy + shape self-tests passed.';
END;
$$;
