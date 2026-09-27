-- ============================================================================
-- 20270413090000_revoke_anon_execute_ten_secdef_functions.sql       (2026-09-28)
-- ----------------------------------------------------------------------------
-- Signed-out callers (anon) can EXECUTE ten SECURITY DEFINER functions through
-- the default PUBLIC grant. The "Live anon-exposure sweep" on main has been red
-- over them since 2026-09-26. None of them is allow-listed, and none has a
-- signed-out caller in the app.
--
-- NO LIVE LEAK (read 2026-09-28 01:30 IST): every one of the ten works out the
-- caller from auth.uid() and refuses or answers empty when there is none, and
-- get_admin_overview raises unless is_admin() (the sweep's "no guard" label
-- missed that check). So this closes a broken rule, not an open door.
--
-- WHAT CHANGES: EXECUTE is revoked from PUBLIC and anon, and granted to
-- authenticated (and service_role, which already has it explicitly), per
-- overload signature. fn_procurement_rm_post_receipt has TWO overloads; only
-- the 5-argument one carried PUBLIC=X, and both are listed so the state is
-- the same afterwards whatever the ledger holds.
--
-- WHO NOTICES: nobody signed in. The app calls fn_my_hr_context,
-- hr_resolve_leave_ladder and fn_procurement_rm_post_receipt only from signed-in
-- server routes and services; gate_can_scan / gate_can_record have no caller in
-- app/, lib/, hooks/ or components/ outside the signed-in gate-security service.
-- One table rule uses one of them: public.sections INSERT / UPDATE / DELETE
-- (roles {public}) call fn_role_scope_all_grants. A signed-out WRITE to
-- sections was already refused by those rules; it now errors with 42501
-- instead. SELECT on sections does not call it. No read changes: the
-- precondition block below refuses to run if any read path calls one of the
-- ten, and supabase/tests/revoke-anon-ten-secdef-rehearsal.sql replays it.
-- ============================================================================

-- Precondition: signed-out READS must not depend on any of the ten. Revoking
-- EXECUTE makes a signed-out statement that reaches one of them error (42501),
-- so refuse to run if a view, a materialized view, a SELECT/ALL row rule, a
-- column default, or a SECURITY INVOKER function signed-out callers can run
-- calls one. Live inventory 2026-09-28 01:40 IST: none; the only callers are
-- the three sections INSERT / UPDATE / DELETE rules named in the header.
DO $pre$
DECLARE
  v_re   text := '(fn_is_any_leave_approver|fn_is_configured_leave_approver|fn_my_designated_hr_org_ids|fn_my_hr_context|fn_procurement_rm_post_receipt|fn_role_scope_all_grants|gate_can_record|gate_can_scan|get_admin_overview|hr_resolve_leave_ladder)';
  v_hits text;
BEGIN
  SELECT string_agg(hit, '; ') INTO v_hits FROM (
    SELECT 'view '||schemaname||'.'||viewname AS hit FROM pg_views WHERE definition ~ v_re
    UNION ALL SELECT 'materialized view '||schemaname||'.'||matviewname FROM pg_matviews WHERE definition ~ v_re
    UNION ALL SELECT 'row rule '||schemaname||'.'||tablename||'.'||policyname||' ('||cmd||')'
      FROM pg_policies
     WHERE cmd IN ('SELECT', 'ALL')
       AND coalesce(qual, '')||' '||coalesce(with_check, '') ~ v_re
    UNION ALL SELECT 'column default '||table_schema||'.'||table_name||'.'||column_name
      FROM information_schema.columns WHERE column_default ~ v_re
    UNION ALL SELECT 'invoker function '||p.oid::regprocedure::text
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
       AND NOT p.prosecdef AND p.prosrc ~ v_re
       AND has_function_privilege('anon', p.oid, 'EXECUTE')
  ) h;
  IF v_hits IS NOT NULL THEN
    RAISE EXCEPTION '20270413090000: a signed-out read path calls one of the ten, so revoking anon EXECUTE would break it: %', v_hits;
  END IF;
END $pre$;

REVOKE EXECUTE ON FUNCTION public.fn_is_any_leave_approver()                                          FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fn_is_configured_leave_approver()                                   FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fn_my_designated_hr_org_ids()                                       FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fn_my_hr_context()                                                  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fn_procurement_rm_post_receipt(uuid, uuid, integer, numeric)        FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fn_procurement_rm_post_receipt(uuid, uuid, integer, numeric, text[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fn_role_scope_all_grants(text)                                      FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.gate_can_record()                                                   FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.gate_can_scan()                                                     FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_admin_overview()                                                FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.hr_resolve_leave_ladder(uuid, jsonb)                                FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.fn_is_any_leave_approver()                                          TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_is_configured_leave_approver()                                   TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_my_designated_hr_org_ids()                                       TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_my_hr_context()                                                  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_procurement_rm_post_receipt(uuid, uuid, integer, numeric)        TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_procurement_rm_post_receipt(uuid, uuid, integer, numeric, text[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_role_scope_all_grants(text)                                      TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.gate_can_record()                                                   TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.gate_can_scan()                                                     TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_admin_overview()                                                TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.hr_resolve_leave_ladder(uuid, jsonb)                                TO authenticated, service_role;

-- Self-check: refuse to commit unless anon is locked out and signed-in callers are not.
DO $check$
DECLARE r record;
BEGIN
  FOR r IN SELECT p.oid::regprocedure AS sig FROM pg_proc p
            WHERE p.pronamespace = 'public'::regnamespace
              AND p.proname IN ('fn_is_any_leave_approver','fn_is_configured_leave_approver','fn_my_designated_hr_org_ids',
                                'fn_my_hr_context','fn_procurement_rm_post_receipt','fn_role_scope_all_grants',
                                'gate_can_record','gate_can_scan','get_admin_overview','hr_resolve_leave_ladder')
  LOOP
    IF has_function_privilege('anon', r.sig, 'EXECUTE') THEN
      RAISE EXCEPTION '20270413090000: anon can still EXECUTE %', r.sig;
    END IF;
    IF NOT has_function_privilege('authenticated', r.sig, 'EXECUTE') THEN
      RAISE EXCEPTION '20270413090000: authenticated lost EXECUTE on %', r.sig;
    END IF;
  END LOOP;
END $check$;
