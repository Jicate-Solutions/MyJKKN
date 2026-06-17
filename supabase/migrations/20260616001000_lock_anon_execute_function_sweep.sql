-- Migration: Lock anon EXECUTE on SECURITY DEFINER functions (2026-06-16 sweep)
-- Applied live via Management API 2026-06-16; this file is the audit trail + rebuild record.
--
-- Context: the 2026-06-07 anon-exposure sweep's last open item was ~383 non-ai_rpc
--   SECURITY DEFINER functions that anon could EXECUTE (Postgres grants EXECUTE to
--   PUBLIC by default on every function, and Supabase additionally grants anon directly;
--   anon is a member of PUBLIC, so a function is anon-callable unless BOTH are revoked).
--
-- Result of this sweep: 383 -> 34 anon-executable. The remaining 34 are intentional:
--   * 29 RLS gatekeeper functions referenced directly in RLS policy expressions
--     (is_super_admin, role_has_institution_access, auth_institution_id, sh_is_*, ...).
--     RLS policies evaluate in the QUERYING role's context, so anon MUST retain EXECUTE
--     on these or table queries error instead of cleanly denying. They are SECURITY
--     DEFINER, so their internal callees run as the definer and never need anon (verified:
--     no SECURITY INVOKER function is referenced in any RLS policy -> no invoker-chain leak).
--   * 5 fn_get_policy* config-lookup readers — documented intentional-public (CLAUDE.md
--     "intentionally-public RPCs"); low-sensitivity config values; also reached by
--     service_role webhook/cron routes that keep working regardless.
--
-- Phase 3a — 126 trigger functions: anon EXECUTE is meaningless (Postgres does not check
--   EXECUTE on trigger functions when fired by a trigger; a direct RPC call errors anyway).
--   Revoke anon+PUBLIC (lock to owner/superuser).
--
-- Phase 3b — 220 business functions:
--   Bucket A (7) — lock to service_role ONLY (revoke anon+authenticated+PUBLIC). These run
--     dynamic SQL / create privileged rows / dump security metadata with NO internal auth
--     guard. Granting authenticated would expose them as direct PostgREST RPC endpoints to
--     EVERY logged-in user, bypassing their routes' superadmin gate. All are either
--     service_role-routed (run-sql, rls-policies) or have zero UI caller:
--       exec_sql_safe (arbitrary SQL), create_user_profile (arbitrary-role profile creation),
--       get_rls_policies, get_tables_with_rls (security-metadata dump),
--       ensure_usage_events_partitions, sync_user_role_enum (maintenance),
--       hr_policy_restore (destructive HR write, no UI caller).
--   Bucket B (213) — standard template: revoke anon+PUBLIC, GRANT authenticated. Verified
--     safe: every caller is an authenticated session client (pages, lib/services, hooks) or
--     a server route using SUPABASE_SERVICE_ROLE_KEY (cron/webhooks). None is reached from a
--     public/anon-browser page (route groups (public)/apply/student-form/guest/c/m/verify).
--
-- FOLLOW-UP (out of scope — this task closes the ANON hole): a separate audit should add
--   internal is_super_admin / permission guards to unguarded sensitive functions that are
--   now authenticated-callable via direct REST (e.g. hr_policy_diff/history), so the
--   route-level gate isn't the only defense.
--
-- Reference: reference_myjkkn_live_anon_exposure_2026_06_07, PR #1256,
--   feedback_supabase_anon_execute_default_grant, CLAUDE.md "Lock new RPCs from anon".

-- ============================================================================
-- Phase 3a: trigger functions -> revoke anon+PUBLIC
-- ============================================================================
DO $$
DECLARE r record; cnt int := 0;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.prosecdef
      AND has_function_privilege('anon',p.oid,'EXECUTE')
      AND p.proname NOT LIKE 'ai_rpc_%'
      AND p.prorettype='pg_catalog.trigger'::regtype
  LOOP
    EXECUTE 'REVOKE EXECUTE ON FUNCTION '||r.sig::text||' FROM anon, PUBLIC';
    cnt := cnt + 1;
  END LOOP;
  RAISE NOTICE 'Phase 3a: revoked anon+PUBLIC on % trigger functions', cnt;
END $$;

-- ============================================================================
-- Phase 3b: business functions -> Bucket A (service_role only) + Bucket B (authenticated)
-- ============================================================================
DO $$
DECLARE
  r record; cnt_a int := 0; cnt_b int := 0; policy_body text;
  bucket_a text[] := ARRAY[
    'exec_sql_safe','get_rls_policies','get_tables_with_rls',
    'ensure_usage_events_partitions','sync_user_role_enum',
    'create_user_profile','hr_policy_restore'];
BEGIN
  -- Snapshot of all RLS policy expressions: any function named here is a gatekeeper anon must keep.
  SELECT string_agg(
    COALESCE(pg_get_expr(pol.polqual, pol.polrelid),'') || ' ' ||
    COALESCE(pg_get_expr(pol.polwithcheck, pol.polrelid),''), ' ')
    INTO policy_body FROM pg_policy pol;

  -- Guard: if policies aren't present yet (e.g. out-of-order rebuild), do NOT run — would
  -- wrongly strip anon from the gatekeepers. They're created in earlier RLS migrations/setup.
  IF policy_body IS NULL OR length(policy_body) < 50 THEN
    RAISE NOTICE 'Phase 3b SKIPPED: RLS policy snapshot empty (run after policies exist)';
    RETURN;
  END IF;

  -- Bucket A: lock to service_role only.
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.prosecdef AND p.proname = ANY(bucket_a)
  LOOP
    EXECUTE 'REVOKE EXECUTE ON FUNCTION '||r.sig::text||' FROM anon, authenticated, PUBLIC';
    EXECUTE 'GRANT EXECUTE ON FUNCTION '||r.sig::text||' TO service_role';
    cnt_a := cnt_a + 1;
  END LOOP;

  -- Bucket B: revoke anon+PUBLIC, grant authenticated. Excludes triggers, ai_rpc_*,
  -- fn_get_policy* (intentional-public), Bucket A, and RLS-policy-referenced gatekeepers.
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.prosecdef
      AND has_function_privilege('anon',p.oid,'EXECUTE')
      AND p.proname NOT LIKE 'ai_rpc_%'
      AND p.prorettype <> 'pg_catalog.trigger'::regtype
      AND p.proname NOT LIKE 'fn_get_policy%'
      AND NOT (p.proname = ANY(bucket_a))
      AND NOT (policy_body ~ ('\m'||p.proname||'\M'))
  LOOP
    EXECUTE 'REVOKE EXECUTE ON FUNCTION '||r.sig::text||' FROM anon, PUBLIC';
    EXECUTE 'GRANT EXECUTE ON FUNCTION '||r.sig::text||' TO authenticated';
    cnt_b := cnt_b + 1;
  END LOOP;

  RAISE NOTICE 'Phase 3b: Bucket A (service_role only)=%, Bucket B (authenticated)=%', cnt_a, cnt_b;
END $$;

NOTIFY pgrst, 'reload schema';
