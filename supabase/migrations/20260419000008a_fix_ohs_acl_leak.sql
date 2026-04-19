-- =====================================================================
-- Doctrines v1 — ACL Remediation for fn_compute_ohs_for_institution
-- =====================================================================
-- Part of: feat/doctrines-composite-scores-v1
-- Related: 20260419000007_doctrines_cluster_rank_public.sql (Task 7a)
--
-- PROBLEM: Task 7a shipped fn_compute_ohs_for_institution as SECURITY
-- DEFINER with only `REVOKE ALL FROM PUBLIC`. Supabase's auth roles
-- (`anon`, `authenticated`) receive explicit EXECUTE grants at function-
-- creation time independent of PUBLIC, so `REVOKE FROM PUBLIC` does NOT
-- remove them. Live ACL verification showed:
--   grantee=anon           privilege=EXECUTE
--   grantee=authenticated  privilege=EXECUTE
-- This is the documented ACL-discipline lesson (session 2026-04-20):
-- auth-bypass helpers must explicitly revoke from anon AND authenticated.
--
-- FIX: Explicit REVOKE FROM anon + REVOKE FROM authenticated. Helper is
-- meant to be callable only by service_role (used by MV refresh and by
-- the role-gated fn_cluster_rank_public RPC).
--
-- This idempotent migration can be re-run safely.
-- =====================================================================

REVOKE ALL ON FUNCTION public.fn_compute_ohs_for_institution(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_compute_ohs_for_institution(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.fn_compute_ohs_for_institution(uuid) FROM authenticated;

-- Re-assert service_role grant (already present; keeps the migration self-contained).
GRANT EXECUTE ON FUNCTION public.fn_compute_ohs_for_institution(uuid) TO service_role;

-- Self-test: assert no anon/authenticated privilege remains.
DO $$
DECLARE
  v_anon_can_call boolean;
  v_auth_can_call boolean;
BEGIN
  SELECT has_function_privilege('anon',          'public.fn_compute_ohs_for_institution(uuid)', 'EXECUTE'),
         has_function_privilege('authenticated', 'public.fn_compute_ohs_for_institution(uuid)', 'EXECUTE')
    INTO v_anon_can_call, v_auth_can_call;

  IF v_anon_can_call THEN
    RAISE EXCEPTION 'fn_compute_ohs_for_institution still callable by anon after fix';
  END IF;
  IF v_auth_can_call THEN
    RAISE EXCEPTION 'fn_compute_ohs_for_institution still callable by authenticated after fix';
  END IF;

  RAISE NOTICE 'fn_compute_ohs_for_institution ACL clean: service_role only.';
END;
$$;
