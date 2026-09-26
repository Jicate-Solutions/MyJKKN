-- ============================================================================
-- fn_hr_orgs_for_institutions: also return is_payroll_entity (2026-09-23)
--
-- The salary register is grouped by PAYING institution again
-- (20260923120000), so the Generate dialog must offer only institutions that
-- pay salaries. Main Office (is_payroll_entity = false) would otherwise be
-- offered and produce an empty register.
--
-- The return type changes, so DROP + CREATE; body, SECURITY DEFINER,
-- search_path and grants are unchanged. Callers read columns by name, so an
-- added column is invisible to them.
-- ============================================================================

DROP FUNCTION IF EXISTS public.fn_hr_orgs_for_institutions();

CREATE FUNCTION public.fn_hr_orgs_for_institutions()
RETURNS TABLE(institution_id uuid, hr_organization_id uuid, organization_name text, is_payroll_entity boolean)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT o.institution_id, o.id, o.name, COALESCE(o.is_payroll_entity, true)
  FROM public.hr_organizations o
  WHERE o.institution_id IS NOT NULL
    AND o.included_in_hr
    AND public.role_has_institution_access(o.institution_id)
$function$;

REVOKE ALL ON FUNCTION public.fn_hr_orgs_for_institutions() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_hr_orgs_for_institutions() TO authenticated, service_role;
