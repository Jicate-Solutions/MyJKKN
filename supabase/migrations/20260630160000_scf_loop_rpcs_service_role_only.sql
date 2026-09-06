-- =============================================================================
-- 20260630160000_scf_loop_rpcs_service_role_only.sql
-- Cross-tenant lockdown of the SCF generator/measurement RPCs (PR #1681 review).
-- =============================================================================
-- These functions are SECURITY DEFINER (bypass RLS) and read/write data across
-- ALL tenants with no per-caller institution scoping. They were granted to
-- `authenticated`, so any logged-in user could call them via PostgREST and:
--   * fn_scf_ai_signal           — read another tenant's per-course understanding
--                                  signal INCLUDING anonymized free-text comments
--   * fn_scf_prior_suggestion    — read another tenant's AI suggestion history
--   * fn_scf_record_suggestion   — FORGE / overwrite another tenant's suggestion
--   * fn_scf_measure_suggestion_outcomes — recompute/overwrite outcome rows
-- All callers are server-side service-role (createServiceRoleClient) — verified
-- no client/browser caller exists — so the correct grant is service_role ONLY.
-- (fn_scf_candidate_windows is locked the same way in its own migration, 150000.)
--
-- This is a deliberate, MORE-restrictive deviation from the default "GRANT
-- authenticated" anon-lock template, which is only safe for RPCs that scope to
-- auth.uid()/auth.jwt() internally. These do not, and are never called as a user.
-- =============================================================================

REVOKE EXECUTE ON FUNCTION public.fn_scf_ai_signal(text, date, date, uuid, text)
  FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_ai_signal(text, date, date, uuid, text)
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.fn_scf_prior_suggestion(text, text, uuid)
  FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_prior_suggestion(text, text, uuid)
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.fn_scf_record_suggestion(
  uuid, text, text, date, date, integer, integer, numeric, jsonb, text, uuid, text
) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_record_suggestion(
  uuid, text, text, date, date, integer, integer, numeric, jsonb, text, uuid, text
) TO service_role;

REVOKE EXECUTE ON FUNCTION public.fn_scf_measure_suggestion_outcomes(integer)
  FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_measure_suggestion_outcomes(integer)
  TO service_role;

NOTIFY pgrst, 'reload schema';
