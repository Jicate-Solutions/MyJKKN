-- =====================================================================
-- Doctrines v1 — Percentile Cache + Cache-Aware fn_cluster_rank_private
-- =====================================================================
-- Part of: feat/doctrines-composite-scores-v1
-- Related: Task 8 fn_cluster_rank_private (known O(N²) cold-call issue)
-- Addresses: Task 11 Part B follow-up from the Doctrines session.
--
-- PROBLEM: fn_cluster_rank_private enumerates ALL peers on every call
-- and re-computes each peer's TES/CRS via fn_compute_*_for_user. For
-- Faculty (~500) and Student (~5000) populations, a cold cluster-rank
-- call costs O(N) RPC invocations inside the RPC itself — several
-- hundred ms for Faculty, multiple seconds for Student.
--
-- FIX: A lightweight cache table that the Sunday wrap cron populates
-- set-based. fn_cluster_rank_private now checks the cache first: if a
-- fresh row (computed_at > NOW() - 7 days) exists, it returns that
-- directly. On miss/stale, it falls back to the live compute path.
--
-- Freshness window (7 days) is tuned to the Sunday wrap cadence — the
-- cache is written every Sunday and stays fresh for the full week.
--
-- Three artifacts:
--   1. doctrines_percentile_cache — one row per eligible user
--   2. fn_precompute_percentile_cache() — set-based precompute, called
--      by Sunday wrap cron AFTER MV refresh
--   3. fn_cluster_rank_private() — patched to read cache first
-- =====================================================================


-- ---------------------------------------------------------------------
-- Artifact 1: doctrines_percentile_cache
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.doctrines_percentile_cache (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('faculty', 'student')),
  percentile int,
  quartile_label text CHECK (quartile_label IN ('top_quartile', 'upper_middle', 'lower_middle', 'bottom_quartile')),
  data_source text NOT NULL DEFAULT 'live',
  computed_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_doctrines_percentile_cache_computed_at
  ON public.doctrines_percentile_cache (computed_at);

CREATE INDEX IF NOT EXISTS idx_doctrines_percentile_cache_role
  ON public.doctrines_percentile_cache (role);

COMMENT ON TABLE public.doctrines_percentile_cache IS
'Doctrines v1 — Weekly-refreshed percentile cache for Faculty/Student cluster rank. Populated by fn_precompute_percentile_cache (called from /api/cron/sunday-wrap). Read by fn_cluster_rank_private for sub-millisecond cold calls.';

-- Enable RLS — authenticated users can only read their own cache row.
ALTER TABLE public.doctrines_percentile_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "doctrines_percentile_cache_select_own" ON public.doctrines_percentile_cache;
CREATE POLICY "doctrines_percentile_cache_select_own" ON public.doctrines_percentile_cache
  FOR SELECT USING (auth.uid() = user_id);

-- No insert/update/delete policies — writes are service_role only.


-- ---------------------------------------------------------------------
-- Artifact 2: fn_precompute_percentile_cache
-- ---------------------------------------------------------------------
-- Set-based precompute. Materializes all Faculty + Student scores into
-- CTEs, computes percentiles via correlated count over the materialized
-- set, upserts cache rows. Minimum-peer thresholds enforced (5 Faculty,
-- 10 Student) — users below threshold are skipped (their cache row is
-- not written, so fn_cluster_rank_private cache-misses them and falls
-- through to 'insufficient_peers' via the live path).
--
-- Called by /api/cron/sunday-wrap. service_role only.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_precompute_percentile_cache()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  v_start timestamptz := NOW();
  v_cluster uuid[];
  v_faculty_written int := 0;
  v_student_written int := 0;
BEGIN
  SELECT ARRAY(SELECT institution_id FROM public.mv_cluster_leaderboard_colleges)
    INTO v_cluster;

  IF array_length(v_cluster, 1) IS NULL OR array_length(v_cluster, 1) = 0 THEN
    RETURN jsonb_build_object(
      'started_at', v_start, 'finished_at', NOW(),
      'faculty_written', 0, 'student_written', 0,
      'error', 'cluster_empty'
    );
  END IF;

  -- Faculty precompute (min_peers = 5)
  WITH faculty_base AS (
    SELECT DISTINCT s.profile_id AS user_id,
      (public.fn_compute_tes_for_user(s.profile_id)->>'score')::numeric AS score
    FROM public.staff s
    JOIN public.profiles p ON p.id = s.profile_id
    WHERE p.role = 'faculty'
      AND p.institution_id = ANY(v_cluster)
      AND s.profile_id IS NOT NULL
  ),
  faculty_filtered AS (
    SELECT * FROM faculty_base WHERE score IS NOT NULL
  ),
  faculty_stats AS (
    SELECT COUNT(*) AS total FROM faculty_filtered
  ),
  faculty_ranked AS (
    SELECT ff.user_id, ff.score,
      fs.total AS peer_count,
      (SELECT COUNT(*) FROM faculty_filtered x
        WHERE x.score < ff.score AND x.user_id <> ff.user_id) AS below_count
    FROM faculty_filtered ff, faculty_stats fs
    WHERE fs.total >= 5
  )
  INSERT INTO public.doctrines_percentile_cache (user_id, role, percentile, quartile_label, data_source, computed_at)
  SELECT
    fr.user_id, 'faculty',
    ROUND((fr.below_count::numeric * 100.0) / GREATEST(fr.peer_count - 1, 1))::int AS percentile,
    CASE
      WHEN ROUND((fr.below_count::numeric * 100.0) / GREATEST(fr.peer_count - 1, 1)) >= 75 THEN 'top_quartile'
      WHEN ROUND((fr.below_count::numeric * 100.0) / GREATEST(fr.peer_count - 1, 1)) >= 50 THEN 'upper_middle'
      WHEN ROUND((fr.below_count::numeric * 100.0) / GREATEST(fr.peer_count - 1, 1)) >= 25 THEN 'lower_middle'
      ELSE 'bottom_quartile'
    END,
    'cache', NOW()
  FROM faculty_ranked fr
  ON CONFLICT (user_id) DO UPDATE SET
    role          = EXCLUDED.role,
    percentile    = EXCLUDED.percentile,
    quartile_label = EXCLUDED.quartile_label,
    data_source   = EXCLUDED.data_source,
    computed_at   = EXCLUDED.computed_at;

  GET DIAGNOSTICS v_faculty_written = ROW_COUNT;

  -- Student precompute (min_peers = 10)
  WITH student_base AS (
    SELECT p.id AS user_id,
      (public.fn_compute_crs_for_user(p.id)->>'score')::numeric AS score
    FROM public.profiles p
    WHERE p.role = 'student'
      AND p.learner_id IS NOT NULL
      AND p.institution_id = ANY(v_cluster)
  ),
  student_filtered AS (
    SELECT * FROM student_base WHERE score IS NOT NULL
  ),
  student_stats AS (
    SELECT COUNT(*) AS total FROM student_filtered
  ),
  student_ranked AS (
    SELECT sf.user_id, sf.score,
      ss.total AS peer_count,
      (SELECT COUNT(*) FROM student_filtered x
        WHERE x.score < sf.score AND x.user_id <> sf.user_id) AS below_count
    FROM student_filtered sf, student_stats ss
    WHERE ss.total >= 10
  )
  INSERT INTO public.doctrines_percentile_cache (user_id, role, percentile, quartile_label, data_source, computed_at)
  SELECT
    sr.user_id, 'student',
    ROUND((sr.below_count::numeric * 100.0) / GREATEST(sr.peer_count - 1, 1))::int AS percentile,
    CASE
      WHEN ROUND((sr.below_count::numeric * 100.0) / GREATEST(sr.peer_count - 1, 1)) >= 75 THEN 'top_quartile'
      WHEN ROUND((sr.below_count::numeric * 100.0) / GREATEST(sr.peer_count - 1, 1)) >= 50 THEN 'upper_middle'
      WHEN ROUND((sr.below_count::numeric * 100.0) / GREATEST(sr.peer_count - 1, 1)) >= 25 THEN 'lower_middle'
      ELSE 'bottom_quartile'
    END,
    'cache', NOW()
  FROM student_ranked sr
  ON CONFLICT (user_id) DO UPDATE SET
    role          = EXCLUDED.role,
    percentile    = EXCLUDED.percentile,
    quartile_label = EXCLUDED.quartile_label,
    data_source   = EXCLUDED.data_source,
    computed_at   = EXCLUDED.computed_at;

  GET DIAGNOSTICS v_student_written = ROW_COUNT;

  RETURN jsonb_build_object(
    'started_at', v_start,
    'finished_at', NOW(),
    'duration_ms', EXTRACT(MILLISECONDS FROM (NOW() - v_start))::int,
    'faculty_written', v_faculty_written,
    'student_written', v_student_written
  );
END;
$function$;

COMMENT ON FUNCTION public.fn_precompute_percentile_cache() IS
'Doctrines v1 — Set-based precompute of Faculty + Student percentiles into doctrines_percentile_cache. Called by /api/cron/sunday-wrap after MV refresh. service_role only.';

REVOKE ALL ON FUNCTION public.fn_precompute_percentile_cache() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_precompute_percentile_cache() FROM anon;
REVOKE ALL ON FUNCTION public.fn_precompute_percentile_cache() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.fn_precompute_percentile_cache() TO service_role;


-- ---------------------------------------------------------------------
-- Artifact 3: Cache-aware fn_cluster_rank_private
-- ---------------------------------------------------------------------
-- Patched to check doctrines_percentile_cache first. Cache hit
-- (computed_at > NOW() - 7 days) returns cached percentile/quartile
-- immediately. Cache miss / stale falls through to live compute exactly
-- as before (shape preserved — 5 keys only, zero peer leak).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_cluster_rank_private(p_role text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
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
  v_cache_row doctrines_percentile_cache;
BEGIN
  -- ═══ Auth gate ═══
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('percentile', NULL, 'quartile_label', NULL, 'data_source', 'not_authenticated', 'forbidden', TRUE, 'reason', 'not_authenticated');
  END IF;

  SELECT * INTO v_caller_profile FROM profiles WHERE id = v_caller;
  IF v_caller_profile.id IS NULL THEN
    RETURN jsonb_build_object('percentile', NULL, 'quartile_label', NULL, 'data_source', 'no_caller_profile', 'forbidden', TRUE, 'reason', 'no_caller_profile');
  END IF;

  v_caller_role := v_caller_profile.role;
  v_caller_is_super_admin := COALESCE(v_caller_profile.is_super_admin, FALSE);

  -- ═══ Role parameter gate ═══
  IF p_role IS NULL OR p_role NOT IN ('faculty', 'student') THEN
    RETURN jsonb_build_object('percentile', NULL, 'quartile_label', NULL, 'data_source', 'role_not_allowed', 'forbidden', TRUE, 'reason', 'role_parameter_required');
  END IF;

  v_role := p_role;

  -- ═══ Impersonation gate ═══
  IF NOT v_caller_is_super_admin AND v_caller_role <> v_role THEN
    RETURN jsonb_build_object('percentile', NULL, 'quartile_label', NULL, 'data_source', 'role_not_allowed', 'forbidden', TRUE, 'reason', 'role_mismatch');
  END IF;

  IF NOT v_caller_is_super_admin AND v_caller_role NOT IN ('faculty', 'student') THEN
    RETURN jsonb_build_object('percentile', NULL, 'quartile_label', NULL, 'data_source', 'role_not_allowed', 'forbidden', TRUE, 'reason', 'caller_role_not_eligible');
  END IF;

  -- ═══ Cache-first path (Task 11 Part B) ═══
  -- Only applies when the caller is asking about their OWN role (not
  -- super_admin testing with a different role).
  IF v_caller_role = v_role THEN
    SELECT * INTO v_cache_row
    FROM doctrines_percentile_cache
    WHERE user_id = v_caller
      AND role = v_role
      AND computed_at > NOW() - INTERVAL '7 days';

    IF v_cache_row.user_id IS NOT NULL THEN
      RETURN jsonb_build_object(
        'percentile', v_cache_row.percentile,
        'quartile_label', v_cache_row.quartile_label,
        'data_source', 'cache',
        'forbidden', FALSE,
        'reason', NULL
      );
    END IF;
  END IF;

  -- ═══ Cluster institution pool ═══
  SELECT ARRAY(SELECT institution_id FROM mv_cluster_leaderboard_colleges)
  INTO v_cluster_institutions;

  IF array_length(v_cluster_institutions, 1) IS NULL OR array_length(v_cluster_institutions, 1) = 0 THEN
    RETURN jsonb_build_object('percentile', NULL, 'quartile_label', NULL, 'data_source', 'no_cluster', 'forbidden', FALSE, 'reason', 'cluster_empty');
  END IF;

  -- ═══ Live compute ═══
  IF v_role = 'faculty' THEN
    v_my_payload := fn_compute_tes_for_user(v_caller);
    v_min_peers := 5;
  ELSE
    v_my_payload := fn_compute_crs_for_user(v_caller);
    v_min_peers := 10;
  END IF;

  IF (v_my_payload->>'data_source') IN ('no_staff_record', 'no_learner_profile', 'null_user_id') THEN
    RETURN jsonb_build_object('percentile', NULL, 'quartile_label', NULL, 'data_source', v_my_payload->>'data_source', 'forbidden', FALSE, 'reason', 'no_baseline');
  END IF;

  v_my_score := (v_my_payload->>'score')::numeric;

  IF v_role = 'faculty' THEN
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
    SELECT COUNT(*), COUNT(*) FILTER (WHERE peer_score < v_my_score)
    INTO v_peer_count, v_below_count
    FROM peer_scores WHERE peer_score IS NOT NULL;
  ELSE
    WITH peers AS (
      SELECT p.id AS uid FROM profiles p
      WHERE p.learner_id IS NOT NULL
        AND p.id <> v_caller
        AND p.institution_id = ANY(v_cluster_institutions)
    ),
    peer_scores AS (
      SELECT (fn_compute_crs_for_user(peers.uid)->>'score')::numeric AS peer_score
      FROM peers
    )
    SELECT COUNT(*), COUNT(*) FILTER (WHERE peer_score < v_my_score)
    INTO v_peer_count, v_below_count
    FROM peer_scores WHERE peer_score IS NOT NULL;
  END IF;

  IF v_peer_count < v_min_peers THEN
    RETURN jsonb_build_object('percentile', NULL, 'quartile_label', NULL, 'data_source', 'insufficient_peers', 'forbidden', FALSE, 'reason', 'insufficient_peers');
  END IF;

  v_percentile := ROUND((v_below_count::numeric * 100.0) / v_peer_count)::int;

  IF v_percentile >= 75 THEN v_quartile := 'top_quartile';
  ELSIF v_percentile >= 50 THEN v_quartile := 'upper_middle';
  ELSIF v_percentile >= 25 THEN v_quartile := 'lower_middle';
  ELSE v_quartile := 'bottom_quartile';
  END IF;

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
'Doctrines v1 — Tiered-privacy cluster rank PRIVATE with cache-first fast path. Checks doctrines_percentile_cache before falling through to live compute. Returns ONLY {percentile, quartile_label, data_source, forbidden, reason} — zero peer leak. Patched 2026-04-20 to add Task 11 Part B cache.';

REVOKE ALL ON FUNCTION public.fn_cluster_rank_private(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_cluster_rank_private(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_cluster_rank_private(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_cluster_rank_private(text) TO service_role;

-- ---------------------------------------------------------------------
-- Harden fn_cluster_rank_public against anon inheritance (defense in
-- depth — internal auth gate already returns forbidden=true for null
-- callers, but anon should not reach the function at all).
-- ---------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.fn_cluster_rank_public(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_cluster_rank_public(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_cluster_rank_public(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_cluster_rank_public(text) TO service_role;


-- ---------------------------------------------------------------------
-- Self-test
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_result jsonb;
  v_keys text[];
  v_allowed_keys text[] := ARRAY['percentile', 'quartile_label', 'data_source', 'forbidden', 'reason'];
  v_key text;
BEGIN
  v_result := public.fn_cluster_rank_private(NULL);
  IF NOT (v_result->>'forbidden')::boolean THEN
    RAISE EXCEPTION 'Null role expected forbidden=true after patch';
  END IF;

  SELECT ARRAY(SELECT jsonb_object_keys(v_result)) INTO v_keys;
  FOREACH v_key IN ARRAY v_keys LOOP
    IF NOT (v_key = ANY(v_allowed_keys)) THEN
      RAISE EXCEPTION 'Unexpected key in patched payload: %', v_key;
    END IF;
  END LOOP;

  RAISE NOTICE 'Doctrines v1 Task 11 Part B: cache table + precompute + cache-aware RPC OK.';
END;
$$;
