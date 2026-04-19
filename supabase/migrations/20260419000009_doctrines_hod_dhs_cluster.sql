-- =====================================================================
-- Doctrines v1 — HOD-DHS Cluster Leaderboard (Task 7b)
-- =====================================================================
-- Part of: feat/doctrines-composite-scores-v1
-- Spec: JKKNKB/MyJKKN/Routines-Stickiness-Ivy-Doctrine.md §8 Doctrine 1
--       (tiered-privacy cluster rank cascade — HODs peer-visible to HODs)
-- Related: 20260419000007 (Task 7a college leaderboard) — mirror pattern
--
-- Locked decisions (2026-04-20 Q&A):
--   - HOD gets BOTH cluster tiles: college OHS leaderboard (Task 7a) AND
--     own-DHS rank among all HODs cluster-wide (this migration).
--   - Roster source is profiles.role='hod' (authoritative — departments
--     table has NO head_staff_id column despite the brief's guess).
--   - Peer pool = HODs in institutions filtered via
--     mv_cluster_leaderboard_colleges (inherits iqac_code filter →
--     excludes JKKN Testing Institution automatically).
--
-- Ships three artifacts:
--   1. fn_compute_dhs_for_user(uuid) — auth-bypass DHS computation.
--      Extracts the DHS block from fn_hod_metrics, takes p_user_id
--      instead of auth.uid(). service_role ONLY.
--
--   2. mv_cluster_leaderboard_hods — one row per HOD, ranked by DHS.
--      Filters: profiles.role='hod' + joined department + institution
--      in cluster.
--
--   3. fn_cluster_rank_hods_public() — HOD-peer-only RPC returning full
--      leaderboard with names + scores + caller rank. Peers see peers.
--      super_admin may call for testing.
--
-- ACL pattern (explicit triple revoke — Lesson #1 from session 2026-04-20):
--   Supabase auth roles (anon, authenticated) receive explicit EXECUTE
--   grants at function-creation time, not via PUBLIC inheritance. Must
--   REVOKE FROM PUBLIC + anon + authenticated separately.
--
-- Idempotent: DROP MV IF EXISTS + CREATE OR REPLACE. Safe to re-run.
-- =====================================================================


-- ---------------------------------------------------------------------
-- Helper 1: fn_compute_dhs_for_user
-- ---------------------------------------------------------------------
-- Pure DHS computation given a user_id. Resolves department_id +
-- institution_id from profiles. Mirrors the 4-component DHS composite
-- inside fn_hod_metrics (dept_attendance / faculty_marking /
-- grievance_resolution / learner_pass_rate), using the same 30-day
-- rolling window and compute_renormalized_composite helper.
--
-- GRANT: service_role ONLY. Authenticated callers MUST NOT be able to
-- reach this directly — the authorization boundary lives on
-- fn_cluster_rank_hods_public (HOD-only).
--
-- Returns: { score int, band text, components: {...}, data_source text }
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_compute_dhs_for_user(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  v_dept_id uuid;
  v_inst_id uuid;
  v_today date := (CURRENT_DATE AT TIME ZONE 'Asia/Kolkata')::date;
  v_30d_start date := v_today - interval '30 days';

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
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'score', 0, 'band', 'red',
      'components', '{}'::jsonb,
      'data_source', 'null_user_id'
    );
  END IF;

  SELECT department_id, institution_id INTO v_dept_id, v_inst_id
  FROM profiles WHERE id = p_user_id;

  IF v_dept_id IS NULL OR v_inst_id IS NULL THEN
    RETURN jsonb_build_object(
      'score', 0, 'band', 'red',
      'components', '{}'::jsonb,
      'data_source', 'no_department'
    );
  END IF;

  -- Component 1: dept_attendance (25%) — 30-day % Present in this dept
  BEGIN
    SELECT
      COALESCE(SUM((SELECT COUNT(*) FROM jsonb_each(sa.attendance_data) AS pkv,
        LATERAL jsonb_array_elements(pkv.value -> 'students') AS se
        WHERE se ->> 'status' = 'Present')), 0),
      COALESCE(SUM((SELECT COUNT(*) FROM jsonb_each(sa.attendance_data) AS pkv,
        LATERAL jsonb_array_elements(pkv.value -> 'students') AS se)), 0)
    INTO v_dhs_att_present, v_dhs_att_total
    FROM student_attendance sa
    WHERE sa.department_id = v_dept_id
      AND sa.institution_id = v_inst_id
      AND sa.attendance_date >= v_30d_start;

    IF v_dhs_att_total > 0 THEN
      v_dhs_att := LEAST(100, GREATEST(0, ROUND((v_dhs_att_present::numeric / v_dhs_att_total::numeric) * 100)));
    END IF;
  EXCEPTION WHEN OTHERS THEN v_dhs_att := NULL; END;

  -- Component 2: faculty_marking (25%) — distinct days marked / 22 target
  BEGIN
    SELECT COUNT(DISTINCT sa.attendance_date) INTO v_dhs_mark_days
    FROM student_attendance sa
    WHERE sa.department_id = v_dept_id
      AND sa.institution_id = v_inst_id
      AND sa.attendance_date >= v_30d_start
      AND sa.attendance_date <= v_today;
    v_dhs_marking := LEAST(100, GREATEST(0, ROUND((v_dhs_mark_days::numeric / 22.0) * 100)));
  EXCEPTION WHEN OTHERS THEN v_dhs_marking := NULL; END;

  -- Component 3: grievance_resolution (25%) — resolved/closed ratio trailing 30d
  BEGIN
    SELECT
      COUNT(*) FILTER (WHERE status IN ('resolved', 'closed', 'Resolved', 'Closed')),
      COUNT(*)
    INTO v_dhs_griev_resolved, v_dhs_griev_total
    FROM grievance_tickets
    WHERE department_id = v_dept_id
      AND institution_id = v_inst_id
      AND created_at >= v_30d_start::timestamptz;

    IF v_dhs_griev_total > 0 THEN
      v_dhs_griev := LEAST(100, GREATEST(0, ROUND((v_dhs_griev_resolved::numeric / v_dhs_griev_total::numeric) * 100)));
    END IF;
  EXCEPTION WHEN OTHERS THEN v_dhs_griev := NULL; END;

  -- Component 4: learner_pass_rate (25%) — schema gap, always NULL
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

  RETURN v_dhs_composite || jsonb_build_object(
    'components', jsonb_build_object(
      'dept_attendance', v_dhs_att,
      'faculty_marking', v_dhs_marking,
      'grievance_resolution', v_dhs_griev,
      'learner_pass_rate', v_dhs_pass
    ),
    'data_source', 'live'
  );
END;
$function$;

COMMENT ON FUNCTION public.fn_compute_dhs_for_user(uuid) IS
'Doctrines v1 — Auth-bypass DHS computation for a given HOD user. Mirrors fn_hod_metrics DHS composite (4 components × 25%, renormalized). SECURITY DEFINER. Authorization boundary lives on fn_cluster_rank_hods_public — this primitive is NEVER granted to authenticated.';

-- Explicit triple revoke (Lesson #1: REVOKE FROM PUBLIC does NOT strip
-- auth-role grants created by Supabase defaults at function-creation time).
REVOKE ALL ON FUNCTION public.fn_compute_dhs_for_user(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_compute_dhs_for_user(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.fn_compute_dhs_for_user(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.fn_compute_dhs_for_user(uuid) TO service_role;


-- ---------------------------------------------------------------------
-- Materialized View: mv_cluster_leaderboard_hods
-- ---------------------------------------------------------------------
-- One row per HOD with a resolved department + institution in the cluster.
-- Ranked by DHS DESC, ties broken by hod_name ASC (stable).
-- Refreshed weekly alongside mv_cluster_leaderboard_colleges in the
-- Sunday wrap cron route (Task 9 pre-step).
-- ---------------------------------------------------------------------
DROP MATERIALIZED VIEW IF EXISTS public.mv_cluster_leaderboard_hods;

CREATE MATERIALIZED VIEW public.mv_cluster_leaderboard_hods AS
WITH cluster_institutions AS (
  SELECT institution_id FROM public.mv_cluster_leaderboard_colleges
),
hods AS (
  SELECT
    p.id AS hod_user_id,
    COALESCE(NULLIF(TRIM(p.full_name), ''), p.email) AS hod_name,
    p.department_id,
    d.department_name,
    p.institution_id,
    i.name AS institution_name,
    public.fn_compute_dhs_for_user(p.id) AS dhs_payload
  FROM public.profiles p
  JOIN public.departments d ON d.id = p.department_id
  JOIN public.institutions i ON i.id = p.institution_id
  JOIN cluster_institutions ci ON ci.institution_id = p.institution_id
  WHERE p.role = 'hod'
    AND p.department_id IS NOT NULL
    AND p.institution_id IS NOT NULL
    AND d.is_active IS NOT FALSE
)
SELECT
  hod_user_id,
  hod_name,
  department_id,
  department_name,
  institution_id,
  institution_name,
  (dhs_payload->>'score')::int AS dhs_score,
  dhs_payload->>'band' AS dhs_band,
  dhs_payload->'components' AS dhs_components,
  dhs_payload->>'data_source' AS dhs_data_source,
  dense_rank() OVER (ORDER BY (dhs_payload->>'score')::int DESC, hod_name ASC) AS rank,
  NOW() AS refreshed_at
FROM hods;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_cluster_leaderboard_hods_pk
  ON public.mv_cluster_leaderboard_hods (hod_user_id);

CREATE INDEX IF NOT EXISTS idx_mv_cluster_leaderboard_hods_rank
  ON public.mv_cluster_leaderboard_hods (rank);

CREATE INDEX IF NOT EXISTS idx_mv_cluster_leaderboard_hods_institution
  ON public.mv_cluster_leaderboard_hods (institution_id);

COMMENT ON MATERIALIZED VIEW public.mv_cluster_leaderboard_hods IS
'Doctrines v1 — HOD DHS leaderboard across cluster institutions (inherits iqac_code filter via join to mv_cluster_leaderboard_colleges). Refreshed weekly in the Sunday wrap cron. Fed by fn_compute_dhs_for_user.';


-- ---------------------------------------------------------------------
-- Public RPC: fn_cluster_rank_hods_public
-- ---------------------------------------------------------------------
-- Returns: {
--   leaderboard: [{hod_user_id, hod_name, department_name, institution_name,
--                  dhs_score, dhs_band, rank}, ...],
--   caller_rank, caller_score, caller_department_id, caller_institution_id,
--   refreshed_at, forbidden, reason
-- }
--
-- Role gate: caller must be 'hod' OR super_admin. Other roles →
-- forbidden. HODs see peers (by design — peers seeing peers).
--
-- RLS boundary: the helper fn_compute_dhs_for_user is service_role only;
-- authenticated users reach the leaderboard only via this role-gated RPC.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_cluster_rank_hods_public()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_caller_profile profiles;
  v_caller_is_allowed boolean := FALSE;
  v_caller_rank int := NULL;
  v_caller_score int := NULL;
  v_leaderboard jsonb;
  v_refreshed_at timestamptz;
BEGIN
  -- Auth gate
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object(
      'leaderboard', '[]'::jsonb,
      'caller_rank', NULL, 'caller_score', NULL,
      'caller_department_id', NULL, 'caller_institution_id', NULL,
      'refreshed_at', NULL, 'forbidden', TRUE, 'reason', 'not_authenticated'
    );
  END IF;

  SELECT * INTO v_caller_profile FROM profiles WHERE id = v_caller;
  IF v_caller_profile.id IS NULL THEN
    RETURN jsonb_build_object(
      'leaderboard', '[]'::jsonb,
      'caller_rank', NULL, 'caller_score', NULL,
      'caller_department_id', NULL, 'caller_institution_id', NULL,
      'refreshed_at', NULL, 'forbidden', TRUE, 'reason', 'no_caller_profile'
    );
  END IF;

  -- Role gate: hod OR super_admin only
  v_caller_is_allowed := (
    COALESCE(v_caller_profile.is_super_admin, FALSE)
    OR v_caller_profile.role = 'hod'
  );

  IF NOT v_caller_is_allowed THEN
    RETURN jsonb_build_object(
      'leaderboard', '[]'::jsonb,
      'caller_rank', NULL, 'caller_score', NULL,
      'caller_department_id', v_caller_profile.department_id,
      'caller_institution_id', v_caller_profile.institution_id,
      'refreshed_at', NULL, 'forbidden', TRUE, 'reason', 'role_not_allowed'
    );
  END IF;

  -- Build leaderboard from MV
  SELECT
    jsonb_agg(
      jsonb_build_object(
        'hod_user_id', hod_user_id,
        'hod_name', hod_name,
        'department_id', department_id,
        'department_name', department_name,
        'institution_id', institution_id,
        'institution_name', institution_name,
        'dhs_score', dhs_score,
        'dhs_band', dhs_band,
        'rank', rank
      ) ORDER BY rank ASC, hod_name ASC
    ),
    MAX(refreshed_at)
    INTO v_leaderboard, v_refreshed_at
  FROM public.mv_cluster_leaderboard_hods;

  -- Caller's own rank + score (only meaningful if caller is a HOD in the MV)
  IF v_caller_profile.role = 'hod' THEN
    SELECT rank, dhs_score INTO v_caller_rank, v_caller_score
    FROM public.mv_cluster_leaderboard_hods
    WHERE hod_user_id = v_caller;
  END IF;

  RETURN jsonb_build_object(
    'leaderboard', COALESCE(v_leaderboard, '[]'::jsonb),
    'caller_rank', v_caller_rank,
    'caller_score', v_caller_score,
    'caller_department_id', v_caller_profile.department_id,
    'caller_institution_id', v_caller_profile.institution_id,
    'refreshed_at', v_refreshed_at,
    'forbidden', FALSE,
    'reason', NULL
  );
END;
$function$;

COMMENT ON FUNCTION public.fn_cluster_rank_hods_public() IS
'Doctrines v1 — HOD cluster leaderboard. Returns all HODs ranked by DHS + caller rank. Role-gated: hod or super_admin only. Peers see peers (locked decision). Data source: mv_cluster_leaderboard_hods.';

REVOKE ALL ON FUNCTION public.fn_cluster_rank_hods_public() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_cluster_rank_hods_public() FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_cluster_rank_hods_public() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_cluster_rank_hods_public() TO service_role;


-- ---------------------------------------------------------------------
-- Self-test: MV populated + ACL correct + RPC shape
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_mv_count int;
  v_dhs_anon boolean;
  v_dhs_auth boolean;
  v_dhs_svc boolean;
  v_result jsonb;
BEGIN
  SELECT COUNT(*) INTO v_mv_count FROM public.mv_cluster_leaderboard_hods;
  IF v_mv_count = 0 THEN
    RAISE WARNING 'mv_cluster_leaderboard_hods is empty — verify HOD roster and cluster-institution join';
  END IF;

  SELECT has_function_privilege('anon',          'public.fn_compute_dhs_for_user(uuid)', 'EXECUTE'),
         has_function_privilege('authenticated', 'public.fn_compute_dhs_for_user(uuid)', 'EXECUTE'),
         has_function_privilege('service_role',  'public.fn_compute_dhs_for_user(uuid)', 'EXECUTE')
    INTO v_dhs_anon, v_dhs_auth, v_dhs_svc;
  IF v_dhs_anon THEN RAISE EXCEPTION 'fn_compute_dhs_for_user callable by anon — ACL LEAK'; END IF;
  IF v_dhs_auth THEN RAISE EXCEPTION 'fn_compute_dhs_for_user callable by authenticated — ACL LEAK'; END IF;
  IF NOT v_dhs_svc THEN RAISE EXCEPTION 'fn_compute_dhs_for_user NOT granted to service_role'; END IF;

  -- Unauthenticated shape test
  v_result := public.fn_cluster_rank_hods_public();
  IF NOT (v_result ? 'leaderboard') OR NOT (v_result ? 'caller_rank') OR NOT (v_result ? 'forbidden') THEN
    RAISE EXCEPTION 'fn_cluster_rank_hods_public missing expected keys';
  END IF;
  IF NOT (v_result->>'forbidden')::boolean THEN
    RAISE EXCEPTION 'fn_cluster_rank_hods_public unauthenticated call expected forbidden=true';
  END IF;

  RAISE NOTICE 'Doctrines v1 Task 7b: MV has % rows, DHS helper service_role-only, RPC shape OK.', v_mv_count;
END;
$$;
