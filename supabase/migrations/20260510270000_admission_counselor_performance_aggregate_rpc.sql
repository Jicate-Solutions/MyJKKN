-- ============================================================================
-- Server-side aggregate for the counselor performance leaderboard.
--
-- The counselors page (/admission/counselors) uses useCounselorPerformance
-- which fetched admission_leads rows then grouped them client-side by
-- counselor_id. Without .range(), PostgREST capped at max_rows = 10000 so
-- any institution with > 10K leads had its leaderboard stats silently
-- under-counted. This RPC does the GROUP BY in SQL — single aggregate
-- query, no row-cap exposure.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.get_admission_counselor_performance_aggregate(
  p_institution_id uuid DEFAULT NULL,
  p_from           timestamptz DEFAULT NULL,
  p_to             timestamptz DEFAULT NULL
)
RETURNS TABLE (
  counselor_id     uuid,
  total_leads      bigint,
  converted_leads  bigint,
  hot_leads        bigint,
  score_sum        bigint,
  messages_sent    bigint
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    counselor_id,
    COUNT(*)::bigint                                                                              AS total_leads,
    COUNT(*) FILTER (
      WHERE COALESCE(stage::text, funnel_stage::text) IN ('enrolled','offer_accepted','token_paid')
    )::bigint                                                                                      AS converted_leads,
    COUNT(*) FILTER (WHERE is_hot_lead = true)::bigint                                            AS hot_leads,
    COALESCE(SUM(score), 0)::bigint                                                                AS score_sum,
    COALESCE(SUM(total_messages_sent), 0)::bigint                                                  AS messages_sent
  FROM admission_leads
  WHERE counselor_id IS NOT NULL
    AND (p_institution_id IS NULL OR institution_id = p_institution_id)
    AND (p_from IS NULL OR created_at >= p_from)
    AND (p_to   IS NULL OR created_at <= p_to)
  GROUP BY counselor_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_admission_counselor_performance_aggregate(uuid, timestamptz, timestamptz) TO authenticated;

COMMENT ON FUNCTION public.get_admission_counselor_performance_aggregate(uuid, timestamptz, timestamptz) IS
  'Per-counselor lead-stats aggregate (total/converted/hot/score-sum/messages-sent). Replaces the prior row-fetch-and-count which was silently capped at PostgREST max_rows. Powers /admission/counselors leaderboard.';

COMMIT;
