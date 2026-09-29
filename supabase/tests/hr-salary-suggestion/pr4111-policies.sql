-- #4111's two restrictive SELECT policies, VERBATIM from
-- supabase/migrations/20270506090000_hr_pay_policies_readable_only_with_salary_view.sql
-- (branch fix/hr-pay-policies-not-readable-by-everyone, commit b9bb1480d8), lines 122-171:
-- sections 1 and 2 only. run.sh uses the real file instead once it is in the repo.
-- Rehearsal input for fn_hr_salary_rule_lock_present(); never applied anywhere else.
-- ----------------------------------------------------------------------------
-- 1. platform_policies — pay rows need the salary key and the college
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS platform_policies_pay_keys_restricted ON public.platform_policies;
CREATE POLICY platform_policies_pay_keys_restricted ON public.platform_policies
  AS RESTRICTIVE
  FOR SELECT
  TO authenticated, anon
  USING (
    policy_key NOT IN ('hr.pay_scales', 'hr.allowances_and_increments', 'hr.salary_suggestion_rule')
    OR (SELECT public.is_super_admin())
    OR (SELECT public.is_admin())
    OR (
      scope_type = 'institution'
      AND scope_id IS NOT NULL
      AND (SELECT public.user_has_permission('hr.payroll.salary.view'))
      AND public.role_has_institution_access(scope_id)
    )
  );

COMMENT ON POLICY platform_policies_pay_keys_restricted ON public.platform_policies IS
  'Pay rows (hr.pay_scales, hr.allowances_and_increments, hr.salary_suggestion_rule): admins any row; '
  'hr.payroll.salary.view holders only college rows of colleges they can access; '
  'group-wide (NULL scope) rows admin-only. RESTRICTIVE: ANDed with every '
  'permissive SELECT policy. Other keys unaffected. Migration 20270506090000.';

-- ----------------------------------------------------------------------------
-- 2. hr_policy_audit_log — the same figures as old_value / new_value
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS hr_policy_audit_log_pay_keys_restricted ON public.hr_policy_audit_log;
CREATE POLICY hr_policy_audit_log_pay_keys_restricted ON public.hr_policy_audit_log
  AS RESTRICTIVE
  FOR SELECT
  TO authenticated, anon
  USING (
    policy_key NOT IN ('hr.pay_scales', 'hr.allowances_and_increments', 'hr.salary_suggestion_rule')
    OR (SELECT public.is_super_admin())
    OR (SELECT public.is_admin())
    OR (
      scope_type = 'institution'
      AND scope_id IS NOT NULL
      AND (SELECT public.user_has_permission('hr.payroll.salary.view'))
      AND public.role_has_institution_access(scope_id)
    )
  );

COMMENT ON POLICY hr_policy_audit_log_pay_keys_restricted ON public.hr_policy_audit_log IS
  'Audit rows of the pay keys carry the pay figures; same rule as '
  'platform_policies_pay_keys_restricted. Migration 20270506090000.';

