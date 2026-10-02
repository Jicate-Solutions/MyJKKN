-- ============================================================================
-- Migration: 20270416120000_hr_pay_band_policies_rpc
-- hr_pay_band_policies() — the pay bands a caller may see, scoped per college
-- ============================================================================
-- Created: 2026-09-29 - PR #4103 (Pay Band Check), W12 review round 2.
--
-- WHY A FUNCTION AND NOT A TABLE READ. The bands are the institution-scoped
-- `hr.pay_scales` rows of platform_policies, whose SELECT policy is
-- `auth.uid() IS NOT NULL`. A plain read from the server route returned every
-- college's band to anyone holding hr.payroll.salary.view, so a role with
-- institution_scope 'own' that was ever given the key would see every other
-- college's pay matrix. This function applies the same two checks, in the same
-- order, as hr_staff_salary_directory(), which the same screen already uses
-- for the people side:
--   1. user_has_permission('hr.payroll.salary.view'), or RAISE, so an empty
--      result always means "no band in your colleges", never "not allowed";
--   2. role_has_institution_access(scope_id) on every row, evaluated as the
--      caller: SECURITY DEFINER, but both helpers read auth.uid(), which is the
--      caller's JWT subject, not the function owner. No college id is taken
--      from the request.
--
-- Rows with a NULL scope_id are excluded explicitly: role_has_institution_access
-- (NULL) returns true ("system-wide"), and a band with no college is not a band
-- for anyone.
--
-- The table's own SELECT policy is NOT changed here. That is a separate access
-- decision (the Pay Scales editor still reads the table from the browser).
--
-- READ ONLY. STABLE, no writes.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.hr_pay_band_policies()
RETURNS TABLE(
  institution_id  uuid,
  band            jsonb,
  band_updated_at timestamptz
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.user_has_permission('hr.payroll.salary.view') THEN
    RAISE EXCEPTION 'hr.payroll.salary.view is required to see pay bands.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  SELECT pp.scope_id,
         pp.value,
         pp.updated_at
    FROM public.platform_policies pp
   WHERE pp.policy_key = 'hr.pay_scales'
     AND pp.scope_type = 'institution'
     AND pp.scope_id IS NOT NULL
     AND public.role_has_institution_access(pp.scope_id)
   ORDER BY pp.scope_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.hr_pay_band_policies() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.hr_pay_band_policies() TO authenticated;

COMMENT ON FUNCTION public.hr_pay_band_policies() IS
  'Pay bands (hr.pay_scales) for the colleges the caller can access. Gated on hr.payroll.salary.view and scoped by role_has_institution_access, as hr_staff_salary_directory() is; raises rather than returning [] when the key is missing.';
