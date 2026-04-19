-- =====================================================================
-- Doctrines v1 — Cluster Leaderboard MV Refresh RPC
-- =====================================================================
-- Part of: feat/doctrines-composite-scores-v1
-- Related: Task 9 Sunday wrap cron (/api/cron/sunday-wrap)
--
-- PROBLEM: Supabase JS client cannot execute DDL (REFRESH MATERIALIZED
-- VIEW). Wrap the refresh in a SECURITY DEFINER function that the
-- Sunday wrap cron can invoke via supabase.rpc() using the service-role
-- key.
--
-- Refreshes BOTH:
--   - mv_cluster_leaderboard_colleges (Task 7a — 8 colleges by OHS)
--   - mv_cluster_leaderboard_hods     (Task 7b — 46 HODs by DHS)
--
-- CONCURRENTLY: requires a UNIQUE index (both MVs have one). Enables
-- refresh without blocking readers.
--
-- ACL: service_role only. Authenticated/anon MUST NOT be able to trigger
-- refreshes (DoS + stale-data-injection risk).
-- =====================================================================

CREATE OR REPLACE FUNCTION public.fn_refresh_cluster_leaderboards()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  v_started_at timestamptz := NOW();
  v_colleges_refreshed boolean := FALSE;
  v_hods_refreshed boolean := FALSE;
  v_error text;
BEGIN
  BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_cluster_leaderboard_colleges;
    v_colleges_refreshed := TRUE;
  EXCEPTION WHEN OTHERS THEN
    v_error := COALESCE(v_error || ' | ', '') || 'colleges: ' || SQLERRM;
  END;

  BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_cluster_leaderboard_hods;
    v_hods_refreshed := TRUE;
  EXCEPTION WHEN OTHERS THEN
    v_error := COALESCE(v_error || ' | ', '') || 'hods: ' || SQLERRM;
  END;

  RETURN jsonb_build_object(
    'started_at', v_started_at,
    'finished_at', NOW(),
    'duration_ms', EXTRACT(MILLISECONDS FROM (NOW() - v_started_at))::int,
    'colleges_refreshed', v_colleges_refreshed,
    'hods_refreshed', v_hods_refreshed,
    'error', v_error
  );
END;
$function$;

COMMENT ON FUNCTION public.fn_refresh_cluster_leaderboards() IS
'Doctrines v1 — Refreshes both cluster leaderboard MVs (colleges + hods) CONCURRENTLY. Called by the Sunday wrap cron (/api/cron/sunday-wrap) before composing wraps. service_role only.';

REVOKE ALL ON FUNCTION public.fn_refresh_cluster_leaderboards() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_refresh_cluster_leaderboards() FROM anon;
REVOKE ALL ON FUNCTION public.fn_refresh_cluster_leaderboards() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.fn_refresh_cluster_leaderboards() TO service_role;
