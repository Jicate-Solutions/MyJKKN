-- Updated: 2026-08-04 - Full payroll-organisation directory (assigned AND unassigned)
--
-- WHY
-- hr_staff_without_payer() (20260731090000) answers only "who is MISSING a
-- payer". That was the whole job while the queue was the whole screen, but it
-- makes the other side of the record unreachable: 638 of 744 active staff have
-- a payer that was written by the backfill in 20260731071358, and nothing in
-- the product can display or change it. Every one of those 638 rows is an
-- ASSUMPTION (backfill set payer = work institution for everyone), not a
-- decision somebody made - and for the central officers the assumption is
-- exactly the case that is wrong.
--
-- Reported 2026-08-04: the Payroll Organisation screen shows 744 active team
-- members in its coverage card but only ever lists the unassigned ones, so its
-- "Works at" filter offers a single work location while staff actually sit
-- across 13. There was no way to reach anyone already assigned, and therefore
-- no way to CORRECT a payer once recorded.
--
-- WHY A SECOND FUNCTION AND NOT A PARAMETER ON THE FIRST
-- hr_staff_without_payer() is called by StaffPayrollService.listWithoutPayer
-- and is the payslip-gap signal. Adding a parameter to it would create an
-- OVERLOAD rather than replace it (CREATE OR REPLACE cannot change the
-- signature), leaving two live functions with one name and PostgREST free to
-- resolve either. A separate, additively-named function leaves the existing
-- contract untouched.
--
-- SECURITY - identical posture to the sibling function
-- SECURITY DEFINER bypasses RLS, so this SELF-AUTHORIZES on
-- hr.payroll.institution.view (the same key that gates hr_staff_payroll) and
-- then re-applies institution scoping via role_has_institution_access(), so an
-- institution-scoped HR manager still sees only their own colleges. auth.uid()
-- resolves to the CALLER inside a DEFINER function, so both checks read the
-- caller's identity, not the owner's.
--
-- Note the LEFT JOIN onto hr_staff_payroll is deliberately reached under
-- DEFINER: the caller has already been proven to hold the view key above, and
-- an RLS-respecting join here would silently return NULL payers to anyone the
-- policy happened to filter, which reads as "nobody has a payer" - the exact
-- false negative the payslip generator has a guard for.
--
-- 42702 / 42804 - both fail at CALL time, not CREATE time
--   * Output names avoid every column name in the underlying tables
--     (works_at_id, not institution_id; payer_org_id, not hr_organization_id),
--     or the body raises 42702 "column reference is ambiguous".
--   * institutions.name is varchar(255); returning it into a `text` output
--     raises 42804. Every text-ish output is cast explicitly, including
--     hr_organizations.name which is already text - consistency here is cheaper
--     than remembering which one is which.
--
-- BLAST RADIUS: none. Additive function only. No table, policy, grant or
-- existing function is touched, and hr_staff_without_payer() keeps every caller
-- it has today.

CREATE OR REPLACE FUNCTION public.hr_staff_payroll_directory()
RETURNS TABLE (
  staff_uuid     uuid,
  staff_code     text,
  person_name    text,
  role_title     text,
  works_at_id    uuid,
  works_at_name  text,
  payer_org_id   uuid,
  payer_org_name text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
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
         s.designation::text,
         i.id,
         i.name::text,
         -- NULL for both when nobody has recorded a payer. Absence is the
         -- "not yet decided" state; the client renders it as an empty picker
         -- rather than defaulting to the work location.
         o.id,
         o.name::text
    FROM public.staff s
    JOIN public.institutions i ON i.id = s.institution_id
    -- LEFT so the unassigned stay in the result. An inner join here would
    -- silently reproduce hr_staff_without_payer()'s complement and drop
    -- exactly the people this screen exists to fix.
    LEFT JOIN public.hr_staff_payroll p ON p.staff_id = s.id
    LEFT JOIN public.hr_organizations o ON o.id = p.hr_organization_id
   WHERE COALESCE(s.is_active, false)
     AND public.role_has_institution_access(s.institution_id)
   -- Unassigned first: the outstanding work stays on page 1 even though the
   -- table now defaults to showing everyone.
   ORDER BY (p.staff_id IS NOT NULL), i.name, s.designation, 3;
END;
$function$;

COMMENT ON FUNCTION public.hr_staff_payroll_directory() IS
  'Every ACTIVE staff member with their recorded payer (hr_staff_payroll), or NULL when none is recorded. Self-authorizes on hr.payroll.institution.view and re-applies institution scoping. Superset of hr_staff_without_payer(), which stays as the payslip-gap signal. Unassigned rows sort first.';

-- Callable by signed-in users only; the function itself decides who may proceed.
REVOKE ALL ON FUNCTION public.hr_staff_payroll_directory() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_staff_payroll_directory() FROM anon;
GRANT EXECUTE ON FUNCTION public.hr_staff_payroll_directory() TO authenticated;
