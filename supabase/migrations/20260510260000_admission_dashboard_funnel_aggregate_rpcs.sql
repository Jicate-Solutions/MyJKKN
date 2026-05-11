-- ============================================================================
-- Server-side aggregate RPCs for the admission dashboard + funnel summaries.
--
-- The previous LeadService.getDashboardSummary and getFunnelSummary methods
-- did .from('admission_leads').select(...) without .range(), so PostgREST's
-- max_rows = 10000 silently truncated their results. The /admission/analytics
-- page kept showing "Total Leads: 10,000" exactly — it was the cap, not the
-- real count.
--
-- These RPCs replace the row-fetch+client-count pattern with a single SQL
-- aggregate. No more max_rows ceiling — COUNT(*) returns one row regardless
-- of the underlying table size.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1) Dashboard summary: total / new / converted / application-started /
--    pending followups / today followups, plus derived rates.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_admission_dashboard_summary_aggregate(
  p_institution_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH agg AS (
    SELECT
      COUNT(*)                                                                                                AS total_leads,
      COUNT(*) FILTER (WHERE created_at >= date_trunc('day', now()))                                          AS new_leads,
      COUNT(*) FILTER (WHERE COALESCE(stage::text, funnel_stage::text) = 'enrolled')                          AS converted_leads,
      COUNT(*) FILTER (WHERE learner_profile_id IS NOT NULL)                                                  AS application_started_leads,
      COUNT(*) FILTER (
        WHERE next_followup_at IS NOT NULL
          AND next_followup_at <= now()
          AND COALESCE(stage::text, funnel_stage::text) NOT IN ('enrolled','lost')
      )                                                                                                        AS pending_followups,
      COUNT(*) FILTER (
        WHERE next_followup_at::date = CURRENT_DATE
          AND COALESCE(stage::text, funnel_stage::text) NOT IN ('enrolled','lost')
      )                                                                                                        AS today_followups
    FROM admission_leads
    WHERE p_institution_id IS NULL OR institution_id = p_institution_id
  )
  SELECT jsonb_build_object(
    'totalLeads',              total_leads,
    'newLeads',                new_leads,
    'convertedLeads',          converted_leads,
    'applicationStartedLeads', application_started_leads,
    'pendingFollowups',        pending_followups,
    'todayFollowups',          today_followups,
    'conversionRate',
      CASE WHEN total_leads > 0
        THEN ROUND((converted_leads::numeric / total_leads) * 1000) / 10
        ELSE 0
      END,
    'applicationStartRate',
      CASE WHEN total_leads > 0
        THEN ROUND((application_started_leads::numeric / total_leads) * 1000) / 10
        ELSE 0
      END
  )
  FROM agg;
$$;

GRANT EXECUTE ON FUNCTION public.get_admission_dashboard_summary_aggregate(uuid) TO authenticated;

COMMENT ON FUNCTION public.get_admission_dashboard_summary_aggregate(uuid) IS
  'Returns the admission dashboard KPI summary as a single jsonb. Replaces the prior row-fetch+client-count which was silently capped at PostgREST max_rows.';

-- ----------------------------------------------------------------------------
-- 2) Funnel summary: per-stage counts + hot/priority totals.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_admission_funnel_summary_aggregate(
  p_institution_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH base AS (
    SELECT * FROM admission_leads
    WHERE p_institution_id IS NULL OR institution_id = p_institution_id
  ),
  totals AS (
    SELECT
      COUNT(*)                                              AS total_count,
      COUNT(*) FILTER (WHERE is_hot_lead = true)            AS hot_count,
      COUNT(*) FILTER (WHERE is_hot_lead = true OR is_priority = true) AS priority_count
    FROM base
  ),
  stages AS (
    SELECT
      COALESCE(stage::text, funnel_stage::text) AS stage_key,
      COUNT(*)                                  AS count
    FROM base
    WHERE COALESCE(stage::text, funnel_stage::text) IS NOT NULL
    GROUP BY COALESCE(stage::text, funnel_stage::text)
  )
  SELECT jsonb_build_object(
    'totalLeads',     (SELECT total_count FROM totals),
    'hotLeads',       (SELECT hot_count FROM totals),
    'priorityLeads',  (SELECT priority_count FROM totals),
    'byStage',
      COALESCE((SELECT jsonb_object_agg(stage_key, count) FROM stages), '{}'::jsonb)
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_admission_funnel_summary_aggregate(uuid) TO authenticated;

COMMENT ON FUNCTION public.get_admission_funnel_summary_aggregate(uuid) IS
  'Returns funnel summary as jsonb: totalLeads, hotLeads, priorityLeads, byStage map. Single aggregate query — no row fetch, no max_rows ceiling.';

COMMIT;
