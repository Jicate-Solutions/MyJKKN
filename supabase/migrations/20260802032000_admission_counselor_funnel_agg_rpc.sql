-- 20260802032000_admission_counselor_funnel_agg_rpc.sql
--
-- fix(data): SQL aggregate for the admission counselor-funnel analytics —
-- kills a PostgREST 10k-row silent truncation (same disease as PR #2762).
--
-- WHY: /api/admission/analytics/counselor-funnel fetched EVERY assigned
-- admission_leads row (counselor_id, funnel_stage) and aggregated
-- per-counselor funnel counts in JS. PostgREST caps un-ranged selects at
-- 10,000 rows with HTTP 200, and prod holds 20,039 counselor-assigned leads —
-- so the global view aggregated HALF the data. Measured live 2026-08-02:
-- assigned total seen 10,000 (true 20,039), enrolled seen 4 (true 6). Every
-- counselor's assigned/contacted/qualified/applied/enrolled counts and the
-- conversion-rate ranking built from them were wrong.
--
-- Semantics mirror the route's JS exactly, stage = coalesce(funnel_stage,'new')
-- compared as text (funnel_stage is an enum):
--   * assigned  = all leads with this counselor
--   * contacted = stage <> 'new'
--   * qualified = stage in the route's QUALIFIED_STAGES list
--   * applied   = stage in the route's APPLIED_STAGES list (enrolled/confirmed
--                 deliberately excluded, matching the route)
--   * enrolled  = stage in ('enrolled','confirmed')
-- The route keeps its own counselor list and zero-fills counselors with no
-- leads; rows here for inactive/other-institution counselors are dropped by
-- the route, exactly as the JS dropped those leads.
--
-- SECURITY: INVOKER and EXECUTE locked to service_role only, following the
-- get_admission_lead_program_counts pattern (PR #2762).

CREATE OR REPLACE FUNCTION public.get_admission_counselor_funnel_agg(
  p_institution_id uuid DEFAULT NULL
)
RETURNS TABLE (
  counselor_id uuid,
  assigned bigint,
  contacted bigint,
  qualified bigint,
  applied bigint,
  enrolled bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    l.counselor_id,
    count(*) AS assigned,
    count(*) FILTER (
      WHERE coalesce(l.funnel_stage::text, 'new') <> 'new'
    ) AS contacted,
    count(*) FILTER (
      WHERE coalesce(l.funnel_stage::text, 'new') = ANY(ARRAY[
        'interested','follow_up_scheduled','engaged','qualified',
        'application_started','application_submitted','documents_pending',
        'documents_verified','interview_scheduled','interview_completed',
        'offer_sent','offer_accepted','token_paid','applied','interviewed',
        'offered','enrolled','confirmed'
      ])
    ) AS qualified,
    count(*) FILTER (
      WHERE coalesce(l.funnel_stage::text, 'new') = ANY(ARRAY[
        'application_started','application_submitted','documents_pending',
        'documents_verified','interview_scheduled','interview_completed',
        'offer_sent','offer_accepted','token_paid','applied','interviewed',
        'offered'
      ])
    ) AS applied,
    count(*) FILTER (
      WHERE coalesce(l.funnel_stage::text, 'new') IN ('enrolled', 'confirmed')
    ) AS enrolled
  FROM admission_leads l
  WHERE l.counselor_id IS NOT NULL
    AND (p_institution_id IS NULL OR l.institution_id = p_institution_id)
  GROUP BY l.counselor_id;
$$;

-- Lock: service_role only (Supabase default-grants EXECUTE to anon +
-- authenticated on every new function).
REVOKE EXECUTE ON FUNCTION public.get_admission_counselor_funnel_agg(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_admission_counselor_funnel_agg(uuid)
  TO service_role;

-- ROLLBACK:
-- DROP FUNCTION IF EXISTS public.get_admission_counselor_funnel_agg(uuid);
-- (Restore the previous route code in the same revert.)
