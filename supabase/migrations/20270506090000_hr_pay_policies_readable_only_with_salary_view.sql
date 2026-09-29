-- ============================================================================
-- Migration: 20270506090000_hr_pay_policies_readable_only_with_salary_view
-- Created:   2026-09-29
-- TIER:      POLICY TIGHTENING + one CREATE OR REPLACE (read path only)
-- STATUS:    FILE ONLY. Draft PR. Rehearsed on a throwaway PostgreSQL 16;
--            never applied anywhere else. Waits for the Director's number.
-- ============================================================================
--
-- WHY
--   Every college's pay matrix (`hr.pay_scales`) and allowance amounts
--   (`hr.allowances_and_increments`) live as rows in platform_policies. That
--   table's SELECT policy is `auth.uid() IS NOT NULL`
--   (20260429000002_platform_policies_substrate.sql), so ANY signed-in account,
--   a learner included, can read both with the public anon key:
--       supabase.from('platform_policies').select('*').eq('policy_key','hr.pay_scales')
--   Two more read paths hand out the same figures:
--     * fn_get_policy (SECURITY DEFINER, EXECUTE to authenticated) returns any
--       key's value, bypassing RLS. fn_get_policy_json / _int / _text / _bool
--       all read through it, so they leak the same way.
--     * hr_policy_audit_log keeps old_value / new_value of edited policies, and
--       its SELECT policy shows every global-scope row and every own-college row
--       to any signed-in account.
--   Raised by the reviews of PR #4080 and PR #4103.
--
-- WHAT CHANGES
--   1. platform_policies gets a RESTRICTIVE select policy. For the two pay keys
--      a row is visible only when the caller passes
--          is_super_admin() OR is_admin() OR user_has_permission('hr.payroll.salary.view')
--      (the key Employee Salaries, Pay Band Check and Annual Increments already
--      gate on). Restrictive policies are ANDed with every permissive one, so
--      no existing permissive policy can reopen these rows.
--   2. hr_policy_audit_log gets the same restrictive select policy, keyed on its
--      own policy_key column.
--   3. fn_get_policy refuses the two pay keys, with SQLSTATE 42501 and a plain
--      message, to a SIGNED-IN caller who fails the same test. Callers with no
--      signed-in user (service role, cron, migrations) are unaffected: anon has
--      no EXECUTE on it (20260731200000), so a NULL auth.uid() here means a
--      trusted server-side caller.
--      The function moves from LANGUAGE sql to plpgsql only so it can RAISE; the
--      SELECT it returns is byte-identical to 20260731180000 (the newest body in
--      the repo). A refusal is loud on purpose (rule #27): returning NULL would
--      make fn_get_policy_json quietly hand back its default instead.
--
-- WHAT DOES NOT CHANGE
--   * Every other policy_key: the restrictive policy's first arm is
--     `policy_key NOT IN (...)`, so for them it is always true and today's
--     permissive policies decide exactly as before. fn_get_policy checks the key
--     first and never calls the permission helpers for any other key.
--   * Writes. INSERT / UPDATE / DELETE policies are untouched. The Pay Scales,
--     Allowances and Motivation Fund editors still save from the browser under
--     the existing admin policies (super admin / admin pass the new rule).
--   * SECURITY DEFINER functions that read platform_policies directly by SQL
--     (they run as the table owner and bypass RLS) — none of them read these
--     two keys except via fn_get_policy.
--   * Grants. fn_get_policy keeps EXECUTE for authenticated + service_role only;
--     restated below so re-applying this file cannot widen them.
--   * hr.motivation_fund, hr.payroll.tds_slabs / pf_rate / esi_rate /
--     professional_tax / standard_deduction / formula / component_definitions:
--     statutory rates and structure, no one's pay. Left readable as today.
--
-- WHO NOTICES
--   * A signed-in account WITHOUT hr.payroll.salary.view (and not admin):
--     the two pay rows disappear from table reads; fn_get_policy on those keys
--     raises 42501.
--   * fn_prepare_payroll_period (20260629000000) snapshots hr.pay_scales via
--     fn_get_policy and lets roles hr_officer / hr_admin / hr_manager / director
--     in by NAME. Such a caller who does not also hold hr.payroll.salary.view
--     now gets a clear 42501 instead of a snapshot. Grant the key to that role
--     in Role Management if that person should prepare payroll.
--   * A principal editing these two rows under "Admins can update
--     platform_policies" (role-name policy, 20260525200000) would no longer see
--     them unless holding the key. The editors are super-admin-only pages.
--
-- BEFORE APPLYING: diff the live body, `SELECT pg_get_functiondef(
--   'public.fn_get_policy(text,uuid)'::regprocedure)`, against the SELECT below.
--   Production has had live-only fixes before; if the live body differs, carry
--   the difference into this file first rather than reverting it.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. platform_policies — pay rows need the salary permission
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS platform_policies_pay_keys_restricted ON public.platform_policies;
CREATE POLICY platform_policies_pay_keys_restricted ON public.platform_policies
  AS RESTRICTIVE
  FOR SELECT
  TO authenticated, anon
  USING (
    policy_key NOT IN ('hr.pay_scales', 'hr.allowances_and_increments')
    OR (SELECT public.is_super_admin())
    OR (SELECT public.is_admin())
    OR (SELECT public.user_has_permission('hr.payroll.salary.view'))
  );

COMMENT ON POLICY platform_policies_pay_keys_restricted ON public.platform_policies IS
  'Pay rows (hr.pay_scales, hr.allowances_and_increments) are readable only with '
  'hr.payroll.salary.view or as admin. RESTRICTIVE: ANDed with every permissive '
  'SELECT policy. Other keys unaffected. Migration 20270506090000.';

-- ----------------------------------------------------------------------------
-- 2. hr_policy_audit_log — the same figures as old_value / new_value
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS hr_policy_audit_log_pay_keys_restricted ON public.hr_policy_audit_log;
CREATE POLICY hr_policy_audit_log_pay_keys_restricted ON public.hr_policy_audit_log
  AS RESTRICTIVE
  FOR SELECT
  TO authenticated, anon
  USING (
    policy_key NOT IN ('hr.pay_scales', 'hr.allowances_and_increments')
    OR (SELECT public.is_super_admin())
    OR (SELECT public.is_admin())
    OR (SELECT public.user_has_permission('hr.payroll.salary.view'))
  );

COMMENT ON POLICY hr_policy_audit_log_pay_keys_restricted ON public.hr_policy_audit_log IS
  'Audit rows of the pay keys carry the pay figures; same rule as '
  'platform_policies_pay_keys_restricted. Migration 20270506090000.';

-- ----------------------------------------------------------------------------
-- 3. fn_get_policy — refuse the pay keys to a signed-in caller without the key
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_get_policy(p_key text, p_scope_id uuid DEFAULT NULL::uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- Added 2026-09-29 (20270506090000): pay keys need hr.payroll.salary.view.
  -- The key is tested first so no other key pays for the permission lookup.
  IF p_key IN ('hr.pay_scales', 'hr.allowances_and_increments') THEN
    IF auth.uid() IS NOT NULL
       AND NOT (
         public.is_super_admin()
         OR public.is_admin()
         OR public.user_has_permission('hr.payroll.salary.view')
       )
    THEN
      RAISE EXCEPTION 'You do not have access to the pay policy % (it needs hr.payroll.salary.view).', p_key
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN (
  SELECT value FROM platform_policies
  WHERE policy_key = p_key AND is_active = true
    AND (
      (scope_type='institution' AND scope_id=p_scope_id)
      OR (scope_type='global' AND scope_id IS NULL)
      OR (scope_type='role' AND scope_id IN (
            SELECT cr.id FROM custom_roles cr WHERE EXISTS (
              SELECT 1 FROM user_roles ur JOIN profiles p ON p.id=ur.user_id
              WHERE ur.role_id=cr.id AND p.id=auth.uid()
            )
          ))
      OR (scope_type='user' AND scope_id=auth.uid())
      -- cohort scope: the caller passes the batch's cohorts.id as p_scope_id.
      OR (scope_type='cohort' AND scope_id=p_scope_id)
      -- ...falling back to the programme-wide cohort default.
      OR (scope_type='cohort' AND scope_id IS NULL)
    )
  ORDER BY
    CASE
      WHEN scope_type = 'user'                                  THEN 1
      WHEN scope_type = 'cohort' AND scope_id IS NOT NULL        THEN 2
      WHEN scope_type = 'institution'                            THEN 3
      WHEN scope_type = 'role'                                   THEN 4
      WHEN scope_type = 'cohort' AND scope_id IS NULL            THEN 5
      WHEN scope_type = 'global'                                 THEN 6
      ELSE 99
    END
  LIMIT 1
  );
END;
$function$;

COMMENT ON FUNCTION public.fn_get_policy(text, uuid) IS
  'Config lookup. NOT reachable by anon — it can return any platform_policies '
  'value, including the Meta webhook verify tokens, which leaked twice through '
  'this path (2026-07-30 and 2026-07-31). The two unauthenticated webhook routes '
  'that read policy values use service-role clients and are unaffected. Do not '
  're-grant anon without re-reading migration 20260731200000. '
  'Pay keys (hr.pay_scales, hr.allowances_and_increments) raise 42501 for a '
  'signed-in caller without hr.payroll.salary.view — migration 20270506090000.';

REVOKE EXECUTE ON FUNCTION public.fn_get_policy(text, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_get_policy(text, uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
