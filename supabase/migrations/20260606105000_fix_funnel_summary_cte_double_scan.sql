-- ============================================================================
-- Fix: statement timeout in get_admission_funnel_summary_aggregate
-- ============================================================================
-- Root cause:
--   The base CTE does SELECT * FROM admission_leads and is referenced by
--   BOTH `totals` and `stages`. PostgreSQL materialises any CTE that is
--   referenced more than once (regardless of PG version), so the full wide
--   table (70+ columns × ~20k rows) is copied into working memory TWICE.
--   On Supabase's default work_mem (4 MB) this spills to a temp file,
--   turning a sub-second aggregate into a minutes-long disk read that hits
--   the 8-second statement_timeout (pg error 57014).
--
-- Fix:
--   Replace the SELECT * base CTE with a single GROUP BY pass that reads
--   only the 5 columns actually used (institution_id, stage, funnel_stage,
--   is_hot_lead, is_priority). Total / hot / priority counts are derived
--   from SUM of per-stage partial counts — mathematically identical to
--   the original but in one scan instead of two.
-- ============================================================================

-- Function rewrite runs in a transaction; index creation is outside (CONCURRENTLY
-- cannot run inside a transaction block).

BEGIN;

CREATE OR REPLACE FUNCTION public.get_admission_funnel_summary_aggregate(
  p_institution_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  -- Single pass over admission_leads: group by stage and accumulate all
  -- three aggregate metrics at once. No base CTE, no materialisation,
  -- no SELECT * — reads only the 5 columns the query actually needs.
  WITH stage_agg AS (
    SELECT
      COALESCE(stage::text, funnel_stage::text)                          AS stage_key,
      COUNT(*)                                                            AS stage_count,
      COUNT(*) FILTER (WHERE is_hot_lead = true)                          AS hot_count,
      COUNT(*) FILTER (WHERE is_hot_lead = true OR is_priority = true)    AS priority_count
    FROM admission_leads
    WHERE p_institution_id IS NULL OR institution_id = p_institution_id
    GROUP BY COALESCE(stage::text, funnel_stage::text)
  ),
  lifecycle_agg AS (
    -- Collapses admitted + active into a single 'admitted' bucket per spec.
    -- GROUP BY the CASE expression handles the merge in one scan.
    SELECT
      CASE WHEN lifecycle_status::text IN ('admitted', 'active')
           THEN 'admitted'
           ELSE lifecycle_status::text
      END     AS stage_key,
      COUNT(*) AS cnt
    FROM learners_profiles
    WHERE p_institution_id IS NULL OR institution_id = p_institution_id
    GROUP BY 1
  )
  SELECT jsonb_build_object(
    'totalLeads',    COALESCE(SUM(stage_count),    0),
    'hotLeads',      COALESCE(SUM(hot_count),      0),
    'priorityLeads', COALESCE(SUM(priority_count), 0),
    -- NULL stage_key rows are counted in totals above but excluded from byStage
    'byStage',
      COALESCE(
        jsonb_object_agg(stage_key, stage_count)
          FILTER (WHERE stage_key IS NOT NULL),
        '{}'::jsonb
      ),
    'lifecycleByStage',
      COALESCE(
        (SELECT jsonb_object_agg(stage_key, cnt) FROM lifecycle_agg),
        '{}'::jsonb
      )
  )
  FROM stage_agg;
$$;

GRANT EXECUTE ON FUNCTION public.get_admission_funnel_summary_aggregate(uuid) TO authenticated;

COMMENT ON FUNCTION public.get_admission_funnel_summary_aggregate(uuid) IS
  'Returns funnel summary as jsonb. 2026-06-06: rewrote to eliminate SELECT * base CTE that was materialised twice and spilling to disk on limited work_mem, causing 57014 statement timeouts.';

COMMIT;

-- ============================================================================
-- Covering index (outside transaction — CONCURRENTLY requires it).
-- When p_institution_id is provided the planner can satisfy the entire
-- aggregate via an index-only scan without touching the heap.
-- ============================================================================
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_admission_leads_funnel_agg
  ON public.admission_leads (institution_id, is_hot_lead, is_priority)
  INCLUDE (stage, funnel_stage);
