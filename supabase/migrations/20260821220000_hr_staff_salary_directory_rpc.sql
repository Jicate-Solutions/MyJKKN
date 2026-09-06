-- Every payable person and what they earn, INCLUDING the ones who earn nothing yet.
--
-- WHY A DIRECTORY AND NOT A READ OF hr_staff_salaries
-- --------------------------------------------------
-- The salaries page read the table directly and rendered "0 employees" against a
-- 754-person roster, because a salary that has not been recorded has no row to
-- read. The work the screen exists for is exactly that gap, so the roster has to
-- be the driver and the salary the optional half of a LEFT JOIN.
--
-- Modelled on hr_staff_payroll_directory(), down to the "unset first" ordering:
-- the page is a work queue before it is a report.
--
-- WHY SECURITY DEFINER
--   PostgREST cannot express "rows of staff with no match in hr_staff_salaries"
--   in one request, and a client-side anti-join would need the caller to read
--   the whole staff table. DEFINER also lets this RAISE for a caller without the
--   key instead of quietly returning [] -- an empty directory must mean "nobody
--   works here", never "you cannot see it".
--
-- THE GATE COPIES THE RLS PREDICATE. hr_staff_salaries_select allows
-- hr.payroll.salary.view; this checks the same key, NOT the organisation key the
-- payer directory uses. Seeing who pays someone and seeing what they are paid
-- are separate decisions and are granted separately.
--
-- role_has_institution_access() is carried over unchanged: a DEFINER function
-- bypasses RLS, so dropping it would hand every institution's payroll to anyone
-- holding the key.

CREATE OR REPLACE FUNCTION public.hr_staff_salary_directory()
RETURNS TABLE(
  staff_uuid             uuid,
  staff_code             text,
  person_name            text,
  role_title             text,
  is_active              boolean,
  works_at_id            uuid,
  works_at_name          text,
  payer_org_id           uuid,
  payer_org_name         text,
  salary_id              uuid,
  salary_structure       text,
  monthly_gross          numeric,
  annual_gross           numeric,
  overtime_level         text,
  overtime_amount        numeric,
  eligible_for_pf        boolean,
  exempt_edli            boolean,
  eligible_for_insurance boolean,
  eligible_for_gratuity  boolean,
  eligible_for_etf       boolean,
  effective_from         date,
  notes                  text
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.user_has_permission('hr.payroll.salary.view') THEN
    RAISE EXCEPTION 'hr.payroll.salary.view is required to see employee salaries.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  SELECT s.id,
         s.staff_id::text,
         TRIM(BOTH FROM COALESCE(s.first_name, '') || ' ' || COALESCE(s.last_name, ''))::text,
         s.designation::text,
         COALESCE(s.is_active, false),
         i.id,
         i.name::text,
         o.id,
         o.name::text,
         sal.id,
         sal.salary_structure::text,
         sal.monthly_gross,
         sal.annual_gross,
         sal.overtime_level::text,
         sal.overtime_amount,
         sal.eligible_for_pf,
         sal.exempt_edli,
         sal.eligible_for_insurance,
         sal.eligible_for_gratuity,
         sal.eligible_for_etf,
         sal.effective_from,
         sal.notes
    FROM public.staff s
    JOIN public.institutions i ON i.id = s.institution_id
    LEFT JOIN public.hr_staff_payroll p ON p.staff_id = s.id
    LEFT JOIN public.hr_organizations o ON o.id = p.hr_organization_id
    -- The salary IN FORCE only. Without superseded_by IS NULL a person who has
    -- had two raises would appear three times in a roster listing.
    LEFT JOIN public.hr_staff_salaries sal
           ON sal.staff_id = s.id AND sal.superseded_by IS NULL
   -- Active staff, PLUS anyone inactive who still holds a salary. Filtering on
   -- is_active alone would hide a relieved employee awaiting final settlement --
   -- money attached to an invisible row is the one thing this list must not do.
   WHERE (COALESCE(s.is_active, false) OR sal.id IS NOT NULL)
     AND public.role_has_institution_access(s.institution_id)
   -- Unset first: this is a work queue before it is a report.
   ORDER BY (sal.id IS NOT NULL), i.name, 3;
END;
$function$;

REVOKE ALL ON FUNCTION public.hr_staff_salary_directory() FROM anon;
GRANT EXECUTE ON FUNCTION public.hr_staff_salary_directory() TO authenticated, service_role;

COMMENT ON FUNCTION public.hr_staff_salary_directory() IS
  'Every active staff member with their salary in force, or NULL where none is recorded. Gated on hr.payroll.salary.view; raises rather than returning [] so an empty list never means "denied".';
