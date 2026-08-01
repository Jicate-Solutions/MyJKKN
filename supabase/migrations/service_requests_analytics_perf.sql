-- Perf: /api/service-requests/analytics?type=counts (service-requests hub stat cards)
--
-- The service layer previously issued NINE parallel per-status
-- `select count(*) head:true` PostgREST calls (one per service_request_status).
-- Each call runs a full RLS-filtered scan of service_requests, and the RLS
-- quals include per-row function calls (user_is_request_named_approver(id),
-- approval-step EXISTS) — so the endpoint burned 9 round-trips and 9x the RLS
-- cost. Measured live under personas on 2026-08-01: 320-2222ms of DB time for
-- the nine-count shape vs 19-272ms for this single aggregate (~8x).
--
-- This function computes all nine status counts in ONE RLS-respecting scan
-- using count(*) FILTER. SECURITY INVOKER: RLS on service_requests applies to
-- the caller exactly as it did to the nine separate counts — results verified
-- md5-identical across 24 persona runs (20 unfiltered + 4 institution-filtered,
-- visibility ranging 1 to 2055 rows) on 2026-08-01.
--
-- NOTE: this function already exists in production (created out-of-band,
-- never codified in a migration). This migration adopts it into the repo;
-- CREATE OR REPLACE with an identical body is idempotent.

CREATE OR REPLACE FUNCTION public.get_service_request_status_counts(
  p_institution_id uuid DEFAULT NULL,
  p_service_type_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'draft',     count(*) FILTER (WHERE status = 'draft'),
    'submitted', count(*) FILTER (WHERE status = 'submitted'),
    'in_review', count(*) FILTER (WHERE status = 'in_review'),
    'approved',  count(*) FILTER (WHERE status = 'approved'),
    'rejected',  count(*) FILTER (WHERE status = 'rejected'),
    'returned',  count(*) FILTER (WHERE status = 'returned'),
    'fulfilled', count(*) FILTER (WHERE status = 'fulfilled'),
    'closed',    count(*) FILTER (WHERE status = 'closed'),
    'cancelled', count(*) FILTER (WHERE status = 'cancelled')
  )
  FROM public.service_requests
  WHERE (p_institution_id IS NULL OR institution_id = p_institution_id)
    AND (p_service_type_id IS NULL OR service_type_id = p_service_type_id);
$$;

REVOKE ALL ON FUNCTION public.get_service_request_status_counts(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_service_request_status_counts(uuid, uuid) TO authenticated, service_role;
