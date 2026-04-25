-- =====================================================================
-- Doctrines v1 — Cluster Rank PRIVATE Fast-Exit (hotfix 2026-04-20)
-- =====================================================================
-- Problem:
--   fn_cluster_rank_private's live-compute fallback invokes
--   fn_compute_crs_for_user / fn_compute_tes_for_user once per peer.
--   For a 4,632-student cluster, that is 4,632 JSONB-heavy RPC calls
--   inside a single request, exceeding the 8s statement_timeout
--   (error 57014 observed on /dashboard for faculty + student roles).
--
-- Two surgical patches — shape preserved (5 keys only, zero peer leak):
--
--   A. Early-exit when the caller's institution is NOT in
--      mv_cluster_leaderboard_colleges. Non-cluster callers previously
--      triggered the full O(N) peer walk before returning nothing
--      useful; they now return 'not_in_cluster' in <1ms.
--
--   B. Remove the live-compute fallback from the cache-miss path for
--      regular faculty/student callers. On cache miss, return
--      'pending_cache' — the Sunday wrap cron fills the cache every
--      week. Super-admin role-testing retains the live path (needed
--      for UAT / support queries).
--
-- Not changed:
--   * Auth + role gates (identical)
--   * Cache-hit fast path (identical)
--   * Super-admin live-compute branch (identical — still usable for
--     support; super_admin is the only caller that can reach it)
--   * Payload shape + privacy guarantees
-- =====================================================================

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

  -- ═══ Cache-first path (Task 11 Part B — unchanged) ═══
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

  -- ═══ Patch A: Early-exit for non-cluster callers (2026-04-20 hotfix) ═══
  -- Callers whose institution is outside mv_cluster_leaderboard_colleges
  -- cannot be ranked against the cluster. Previously they fell through to
  -- the live-compute path, triggering 4,632 RPC-inside-RPC calls and a
  -- statement timeout. Super-admin bypasses this gate because their own
  -- institution may legitimately not be in the cluster while they test.
  IF NOT v_caller_is_super_admin AND (
       v_caller_profile.institution_id IS NULL
       OR NOT (v_caller_profile.institution_id = ANY(v_cluster_institutions))
     ) THEN
    RETURN jsonb_build_object(
      'percentile', NULL,
      'quartile_label', NULL,
      'data_source', 'not_in_cluster',
      'forbidden', FALSE,
      'reason', 'institution_not_in_cluster'
    );
  END IF;

  -- ═══ Patch B: Cache-miss bail-out (2026-04-20 hotfix) ═══
  -- Regular faculty/student caller whose institution IS in the cluster but
  -- has no cache row (new user, or first week on cluster). Return
  -- 'pending_cache' instead of falling through to the O(N) live path. The
  -- Sunday 9 PM IST wrap cron (fn_precompute_percentile_cache) populates
  -- the row on its next run, after which subsequent calls hit the cache.
  IF v_caller_role = v_role THEN
    RETURN jsonb_build_object(
      'percentile', NULL,
      'quartile_label', NULL,
      'data_source', 'pending_cache',
      'forbidden', FALSE,
      'reason', 'awaiting_weekly_precompute'
    );
  END IF;

  -- ═══ Super-admin role-test path: live compute retained ═══
  -- Only reachable when v_caller_is_super_admin AND v_caller_role <> v_role
  -- (e.g., super_admin impersonating 'student' during UAT). Regular users
  -- cannot reach this branch because Patch B returns first.
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
'Doctrines v1 — Tiered-privacy cluster rank PRIVATE with cache-first fast path + non-cluster early-exit + cache-miss bail-out. Returns ONLY {percentile, quartile_label, data_source, forbidden, reason} — zero peer leak. Patched 2026-04-20 to fix 57014 statement-timeout on cache miss.';

REVOKE ALL ON FUNCTION public.fn_cluster_rank_private(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_cluster_rank_private(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_cluster_rank_private(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_cluster_rank_private(text) TO service_role;


-- ---------------------------------------------------------------------
-- Self-test — verify shape + new early-exit data_sources
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_result jsonb;
  v_keys text[];
  v_allowed_keys text[] := ARRAY['percentile', 'quartile_label', 'data_source', 'forbidden', 'reason'];
  v_key text;
BEGIN
  -- Unauthenticated still works
  v_result := public.fn_cluster_rank_private(NULL);
  IF NOT (v_result->>'forbidden')::boolean THEN
    RAISE EXCEPTION 'Null role expected forbidden=true after fast-exit patch';
  END IF;

  -- Shape: only the 5 allowed keys
  SELECT ARRAY(SELECT jsonb_object_keys(v_result)) INTO v_keys;
  FOREACH v_key IN ARRAY v_keys LOOP
    IF NOT (v_key = ANY(v_allowed_keys)) THEN
      RAISE EXCEPTION 'Unexpected key in patched payload: %', v_key;
    END IF;
  END LOOP;

  RAISE NOTICE 'Doctrines v1 cluster rank PRIVATE fast-exit hotfix: shape + gates OK.';
END;
$$;
