-- Updated: 2026-07-31 - "Payer not recorded" work queue
--
-- WHY
-- hr_staff_payroll records WHO PAYS each staff member, and NO ROW means the
-- payer has not been determined yet. That is the deliberate state of the 103
-- shared campus-services team members (bus drivers, hostel ayaahs, cooking
-- masters, scavengers, security) whose work location is "JKKN Main Office" - a
-- work location that runs no payroll.
--
-- Absence is only a useful signal if somebody can see it. Without this the gap
-- is invisible: the payslip generator simply excludes those people, every run
-- looks clean, and nobody finds out until a person asks why they were not paid.
--
-- WHY AN RPC AND NOT A CLIENT-SIDE ANTI-JOIN
-- Finding who is MISSING from hr_staff_payroll needs to read both staff and
-- hr_staff_payroll. PostgREST cannot express "rows of A with no match in B"
-- in one request, and doing it client-side would mean pulling every staff row
-- to the browser to subtract from. SECURITY DEFINER does it in one indexed
-- anti-join server-side.
--
-- SECURITY
-- SECURITY DEFINER bypasses RLS, so this function SELF-AUTHORIZES: it refuses
-- outright without hr.payroll.institution.view, the same key that gates
-- hr_staff_payroll itself. It then re-applies institution scoping through
-- role_has_institution_access(), so an institution-scoped HR manager sees only
-- their own colleges while an HR head with scope='all' sees everything.
-- auth.uid() still resolves inside a DEFINER function, so both checks read the
-- CALLER's identity and not the owner's.
--
-- Output column names are deliberately distinct from every column in the
-- underlying tables (works_at_id, not institution_id). A RETURNS TABLE output
-- name that collides with a real column raises 42702 "column reference is
-- ambiguous" at runtime, not at create time.
--
-- Every text-ish output is cast explicitly. institutions.name is
-- varchar(255), and returning it into a `text` output column raises 42804
-- "structure of query does not match function result type" - also at CALL
-- time, not at CREATE time, so it passes review and fails in front of a user.
-- Measured here on 2026-07-31: the uncast version created cleanly and threw on
-- the first call.

CREATE OR REPLACE FUNCTION public.hr_staff_without_payer()
RETURNS TABLE (
  staff_uuid    uuid,
  staff_code    text,
  person_name   text,
  role_title    text,
  works_at_id   uuid,
  works_at_name text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.user_has_permission('hr.payroll.institution.view') THEN
    RAISE EXCEPTION 'hr.payroll.institution.view is required to see who has no recorded payer.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  SELECT s.id,
         s.staff_id::text,
         TRIM(BOTH FROM COALESCE(s.first_name, '') || ' ' || COALESCE(s.last_name, ''))::text,
         s.designation::text,
         i.id,
         i.name::text
    FROM public.staff s
    JOIN public.institutions i ON i.id = s.institution_id
   WHERE COALESCE(s.is_active, false)
     AND NOT EXISTS (
           SELECT 1 FROM public.hr_staff_payroll p WHERE p.staff_id = s.id
         )
     AND public.role_has_institution_access(s.institution_id)
   ORDER BY i.name, s.designation, 3;
END;
$function$;

COMMENT ON FUNCTION public.hr_staff_without_payer() IS
  'Active staff with no row in hr_staff_payroll, i.e. nobody has recorded who pays them. Self-authorizes on hr.payroll.institution.view and re-applies institution scoping. Expected to be non-empty: the shared campus-services team works at JKKN Main Office, which runs no payroll.';

-- Callable by signed-in users only; the function itself decides who may proceed.
REVOKE ALL ON FUNCTION public.hr_staff_without_payer() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_staff_without_payer() FROM anon;
GRANT EXECUTE ON FUNCTION public.hr_staff_without_payer() TO authenticated;
