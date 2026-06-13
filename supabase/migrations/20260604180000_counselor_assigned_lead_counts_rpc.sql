-- get_counselor_assigned_lead_counts
-- Collapses the per-counselor N+1 COUNT(*) on the Team → Members data table
-- (app/(routes)/admission/counselors/_components/counselor-list.tsx) into a
-- single aggregated round-trip. Returns one row per assigned_counselor_id that
-- appears in p_ids, with its assigned-lead count.
--
-- SECURITY INVOKER (default): RLS on admission_leads applies exactly as it did
-- for the prior per-id client-side COUNT queries, so visibility/counts are
-- unchanged — this is purely a round-trip reduction (103 queries -> 1).
--
-- admission_leads.assigned_counselor_id is written by different code paths with
-- EITHER profiles.id (auth.uid()) OR admission_counselors.id, so callers pass
-- BOTH candidate ids per counselor and sum the matching buckets client-side.
-- Backed by idx_admission_leads_assigned_counselor_created.

CREATE OR REPLACE FUNCTION public.get_counselor_assigned_lead_counts(p_ids uuid[])
RETURNS TABLE(assigned_counselor_id uuid, lead_count bigint)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  SELECT al.assigned_counselor_id, COUNT(*) AS lead_count
  FROM admission_leads al
  WHERE al.assigned_counselor_id = ANY(p_ids)
  GROUP BY al.assigned_counselor_id;
$function$;

GRANT EXECUTE ON FUNCTION public.get_counselor_assigned_lead_counts(uuid[]) TO authenticated, service_role;
