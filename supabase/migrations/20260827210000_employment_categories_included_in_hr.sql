-- "Include in HR" on an employment category, and the primitives that read it.
--
-- Every HR surface currently sees all 765 active staff, because the only filter
-- anywhere is staff.is_active. Several categories are not managed by HR at all
-- — Ayaah alone is 105 active staff with 0 leave applications and 0
-- hr_staff_details rows — so they clutter every picker, inflate every count and
-- get imported into attendance nobody administers.
--
-- DEFAULT TRUE, DELIBERATELY. This ships as a no-op: all 30 categories stay
-- included until HR unticks one. A false default would empty the entire HR
-- module for every staff member the moment it deployed.
--
-- Follows the allows_login precedent (20260515001000): ADD COLUMN IF NOT
-- EXISTS + COMMENT ON COLUMN, no RLS or grant changes — employment_categories'
-- policies are column-agnostic, and CategoryService reads with select('*') so
-- the column reaches the UI without touching a query.

BEGIN;

ALTER TABLE public.employment_categories
  ADD COLUMN IF NOT EXISTS included_in_hr boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.employment_categories.included_in_hr IS
  'Staff in this category participate in the HR module (attendance, leave, comp off, payroll, biometric import). Off = they never appear in HR and cannot raise HR requests; existing records are kept, not deleted.';

-- The canonical membership test. Used by triggers and point checks; list
-- queries should join v_hr_staff instead, so the planner gets a hash join
-- rather than a per-row function call.
--
-- SECURITY INVOKER (the default, stated for the reader): employment_categories
-- is readable by every authenticated user, so no elevation is needed, and
-- staff's own RLS still decides which rows the caller can see.
CREATE OR REPLACE FUNCTION public.fn_is_hr_staff(p_staff_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $fn$
  SELECT EXISTS (
    SELECT 1
      FROM public.staff s
      JOIN public.employment_categories ec ON ec.id = s.category_id
     WHERE s.id = p_staff_id
       AND ec.included_in_hr
  );
$fn$;

COMMENT ON FUNCTION public.fn_is_hr_staff(uuid) IS
  'True when this staff member''s employment category is flagged included_in_hr. A staff row with no category is NOT in HR.';

-- The row source every HR staff list should read instead of `staff`.
--
-- security_invoker = true is REQUIRED. A definer view would bypass staff's RLS
-- and hand every HR screen the whole staff table; with invoker it inherits the
-- caller's existing row scoping and only narrows it by category. This view is
-- a scoping convenience, never a security boundary.
CREATE OR REPLACE VIEW public.v_hr_staff
WITH (security_invoker = true) AS
  SELECT s.*
    FROM public.staff s
    JOIN public.employment_categories ec ON ec.id = s.category_id
   WHERE ec.included_in_hr;

COMMENT ON VIEW public.v_hr_staff IS
  'Active-or-not staff whose employment category is included in HR. Same columns as staff; swap the table name in HR queries. Inherits staff RLS (security_invoker).';

REVOKE ALL ON public.v_hr_staff FROM anon;
GRANT SELECT ON public.v_hr_staff TO authenticated;

COMMIT;
