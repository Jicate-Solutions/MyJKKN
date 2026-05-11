-- ============================================================================
-- Extend get_lead_counts_by_source to also return assigned_count and
-- unassigned_count per source. Powers the new analytics columns on the
-- /admission/settings/sources list page.
--
-- "Assigned" = lead has counselor_id NOT NULL (a counselor business entity
-- has been picked, regardless of whether the auth user_id was also written
-- to assigned_counselor_id). "Unassigned" = counselor_id IS NULL.
-- ============================================================================

BEGIN;

DROP FUNCTION IF EXISTS public.get_lead_counts_by_source(uuid);

CREATE OR REPLACE FUNCTION public.get_lead_counts_by_source(p_institution_id uuid DEFAULT NULL)
RETURNS TABLE (
  source           lead_source,
  lead_count       bigint,
  assigned_count   bigint,
  unassigned_count bigint,
  conversions      bigint
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    al.source,
    COUNT(*)                                                                  AS lead_count,
    COUNT(*) FILTER (WHERE al.counselor_id IS NOT NULL)                       AS assigned_count,
    COUNT(*) FILTER (WHERE al.counselor_id IS NULL)                           AS unassigned_count,
    COUNT(*) FILTER (WHERE al.funnel_stage IN ('enrolled','confirmed'))       AS conversions
  FROM admission_leads al
  WHERE p_institution_id IS NULL OR al.institution_id = p_institution_id
  GROUP BY al.source;
$$;

COMMENT ON FUNCTION public.get_lead_counts_by_source(uuid) IS
  'Aggregate per-source lead stats: total, assigned, unassigned, conversions. p_institution_id NULL aggregates across all institutions; UUID filters to one. Used by the sources list page on /admission/settings/sources.';

COMMIT;
