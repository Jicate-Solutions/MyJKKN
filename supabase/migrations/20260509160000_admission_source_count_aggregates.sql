-- ============================================================================
-- Phase 10: Server-side lead-count aggregates for the sources module
-- ============================================================================
-- Why:
--   Both the sources list page and the source detail's distribution tab were
--   fetching raw admission_leads rows and aggregating client-side. Supabase
--   PostgREST applies a default 1000-row cap, so any source with >1000 leads
--   (production has 14,412 on `education_fair`) silently under-reports.
--
--   Moving the aggregates to SQL fixes accuracy AND payload size — instead
--   of dragging 14k rows over the wire, we return ~14 grouped rows.
--
-- Why SECURITY INVOKER (not DEFINER):
--   - Admin / admission office users keep accurate counts (RLS allows full read).
--   - Strict counselor users get RLS-filtered counts that match what their
--     leads list actually shows. This is the correct, audit-safe behaviour.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. get_lead_counts_by_source — used by SourceMasterService.list()
--    Returns one row per lead_source enum value with totals + conversions.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_lead_counts_by_source(
  p_institution_id uuid DEFAULT NULL
)
RETURNS TABLE (
  source       lead_source,
  lead_count   bigint,
  conversions  bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    al.source,
    COUNT(*)                                                    AS lead_count,
    COUNT(*) FILTER (WHERE al.funnel_stage IN ('enrolled','confirmed')) AS conversions
  FROM admission_leads al
  WHERE p_institution_id IS NULL OR al.institution_id = p_institution_id
  GROUP BY al.source;
$$;

GRANT EXECUTE ON FUNCTION public.get_lead_counts_by_source(uuid) TO authenticated;

COMMENT ON FUNCTION public.get_lead_counts_by_source(uuid) IS
  'Returns lead counts and conversion counts grouped by source for the optional institution scope. Replaces a client-side count that hit the 1000-row PostgREST cap.';

-- ----------------------------------------------------------------------------
-- 2. get_source_distribution — used by LeadDistributionService.get()
--    Returns per-counselor stage breakdown for a given source within a window.
--    Uses LEFT JOIN admission_counselors so unassigned leads bucket as NULL.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_source_distribution(
  p_source           lead_source,
  p_from             timestamptz DEFAULT NULL,
  p_to               timestamptz DEFAULT NULL,
  p_institution_id   uuid        DEFAULT NULL
)
RETURNS TABLE (
  counselor_id       uuid,
  user_id            uuid,
  counselor_name     text,
  counselor_email    text,
  counselor_designation text,
  total_leads        bigint,
  new_leads          bigint,
  progressed_leads   bigint,
  conversions        bigint,
  lost_leads         bigint,
  last_assigned_at   timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH window_leads AS (
    SELECT *
    FROM admission_leads al
    WHERE al.source = p_source
      AND (p_from IS NULL OR al.created_at >= p_from)
      AND (p_to   IS NULL OR al.created_at <= p_to)
      AND (p_institution_id IS NULL OR al.institution_id = p_institution_id)
  )
  SELECT
    ac.id                                                             AS counselor_id,
    wl.assigned_counselor_id                                          AS user_id,
    ac.name                                                           AS counselor_name,
    ac.email                                                          AS counselor_email,
    ac.designation                                                    AS counselor_designation,
    COUNT(*)                                                          AS total_leads,
    COUNT(*) FILTER (WHERE wl.funnel_stage = 'new')                   AS new_leads,
    COUNT(*) FILTER (
      WHERE wl.funnel_stage IS NOT NULL
        AND wl.funnel_stage NOT IN ('new', 'lost', 'not_reachable', 'enrolled', 'confirmed')
    )                                                                 AS progressed_leads,
    COUNT(*) FILTER (WHERE wl.funnel_stage IN ('enrolled','confirmed')) AS conversions,
    COUNT(*) FILTER (WHERE wl.funnel_stage IN ('lost','not_reachable')) AS lost_leads,
    MAX(wl.assigned_at)                                               AS last_assigned_at
  FROM window_leads wl
  LEFT JOIN admission_counselors ac ON ac.user_id = wl.assigned_counselor_id
  GROUP BY ac.id, wl.assigned_counselor_id, ac.name, ac.email, ac.designation;
$$;

GRANT EXECUTE ON FUNCTION public.get_source_distribution(lead_source, timestamptz, timestamptz, uuid) TO authenticated;

COMMENT ON FUNCTION public.get_source_distribution(lead_source, timestamptz, timestamptz, uuid) IS
  'Per-counselor lead distribution for a given source within an optional date window and institution scope. Returns one row per (counselor or unassigned-bucket). Replaces a client-side aggregation that hit the 1000-row PostgREST cap.';

COMMIT;
