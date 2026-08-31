-- The payroll organisation directory's "Role" column shows the actual role.
--
-- It has always rendered `staff.designation` under a header reading "Role" —
-- so the column showed "Assistant Professor" or "Pharmacy College Ayaah",
-- which are job titles, not roles. In this application "role" has a precise
-- meaning: the Role Management assignment (custom_roles via user_roles) that
-- decides what a person may do. The column now shows that.
--
-- Aggregated, because roles are many-to-one: of 765 active staff, 539 hold
-- exactly one role, 215 hold two to six, and 11 hold none (they render as an
-- em dash, like any other empty cell). A LATERAL rather than a scalar
-- subquery so the same computed value can also drive ORDER BY.
--
-- Only inactive-role rows are dropped (cr.is_active): a retired role is not
-- something the person still is.
--
-- The sibling directories (hr_staff_salary_directory, hr_staff_bank_directory)
-- keep designation in their role_title — neither displays it as a "Role"
-- column; it only feeds their client-side search box.
--
-- Body otherwise identical to 20260827220000, which swapped this function onto
-- v_hr_staff for the HR-category gate.

CREATE OR REPLACE FUNCTION public.hr_staff_payroll_directory()
 RETURNS TABLE(staff_uuid uuid, staff_code text, person_name text, role_title text, works_at_id uuid, works_at_name text, payer_org_id uuid, payer_org_name text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.user_has_permission('hr.payroll.institution.view') THEN
    RAISE EXCEPTION 'hr.payroll.institution.view is required to see payroll organisations.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  SELECT s.id,
         s.staff_id::text,
         TRIM(BOTH FROM COALESCE(s.first_name, '') || ' ' || COALESCE(s.last_name, ''))::text,
         r.role_names::text,
         i.id,
         i.name::text,
         o.id,
         o.name::text
    FROM public.v_hr_staff s
    JOIN public.institutions i ON i.id = s.institution_id
    LEFT JOIN public.hr_staff_payroll p ON p.staff_id = s.id
    LEFT JOIN public.hr_organizations o ON o.id = p.hr_organization_id
    LEFT JOIN LATERAL (
      SELECT string_agg(cr.role_name, ', ' ORDER BY cr.role_name) AS role_names
        FROM public.user_roles ur
        JOIN public.custom_roles cr ON cr.id = ur.role_id
       WHERE ur.user_id = s.profile_id
         AND cr.is_active
    ) r ON true
   WHERE COALESCE(s.is_active, false)
     AND public.role_has_institution_access(s.institution_id)
   -- Unassigned payers first (this is a work queue), then institution, then
   -- role, then name. Was ordered by designation here for the same reason.
   ORDER BY (p.staff_id IS NOT NULL), i.name, r.role_names NULLS LAST, 3;
END;
$function$;

COMMENT ON FUNCTION public.hr_staff_payroll_directory() IS
  'Payroll payer directory. role_title is the staff member''s Role Management role(s), comma-separated — NOT their designation.';
