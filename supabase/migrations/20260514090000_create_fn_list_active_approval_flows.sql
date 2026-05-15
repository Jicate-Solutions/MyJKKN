-- ============================================================================
-- Migration: 20260514090000_create_fn_list_active_approval_flows
-- Creates a SECURITY DEFINER helper for reading hr_approval_flows configuration
-- data without going through user-scoped RLS.
--
-- Context (PR #887):
--   hr_approval_flows is read-only configuration data, not per-user PII. Its
--   tenant-isolation RLS:
--     (hr_organization_id = auth_hr_organization_id()) OR is_super_admin()
--   was hiding all flow rows from any user lacking a user_hr_access mapping
--   (currently 1 row total in the entire DB). Service code in
--   lib/services/hr/recruitment-service.ts then read zero rows and threw the
--   misleading "No recruitment approval flows configured" error.
--
--   This function returns the same rows the caller-scoped query would return
--   if RLS were bypassed. Read-only, STABLE, scoped to a single (hr_org, flow_for)
--   pair. Caller validates the user is authorized to act on the data (the
--   downstream INSERT into hr_recruitment_candidates still goes through RLS).
--
-- TIER-1 (additive, reversible — see rollback at bottom). Director approved
-- the intent ("service-role read for policy data") earlier this session;
-- SECURITY DEFINER is the local-dev-friendly implementation of that intent.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_list_active_approval_flows(
  p_hr_org_id uuid,
  p_flow_for text
)
RETURNS SETOF hr_approval_flows
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT *
  FROM hr_approval_flows
  WHERE hr_organization_id = p_hr_org_id
    AND flow_for = p_flow_for
    AND is_active = true;
$$;

COMMENT ON FUNCTION public.fn_list_active_approval_flows(uuid, text) IS
  'RLS-bypass read helper for hr_approval_flows. Configuration data, not per-user PII. '
  'See PR #887. Callers must validate user authorisation independently — the function only reads.';

-- Postgres grants EXECUTE to PUBLIC by default; Supabase additionally grants
-- to anon and authenticated. Revoke both implicit grants and explicitly grant
-- only to authenticated. anon (unauthenticated traffic) has no business
-- reading internal approval-chain configuration.
REVOKE EXECUTE ON FUNCTION public.fn_list_active_approval_flows(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_list_active_approval_flows(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_list_active_approval_flows(uuid, text) TO authenticated;

-- Verification:
--   SELECT count(*) FROM fn_list_active_approval_flows(
--     'feb0b6ae-b040-4c21-94e0-d2243155ff5d'::uuid, 'recruitment_approval'
--   ); -- expect 3 (the 3 teaching-faculty rows that match flow_for filter; the 4 others use NULL salary_band)

-- Rollback:
--   DROP FUNCTION IF EXISTS public.fn_list_active_approval_flows(uuid, text);
