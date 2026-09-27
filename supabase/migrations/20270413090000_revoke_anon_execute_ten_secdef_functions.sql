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
-- instead. SELECT on sections does not call it. No read changes.
-- ============================================================================

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
