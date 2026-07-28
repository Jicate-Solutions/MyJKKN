-- Fix: staff see leave types with BLANK NAMES on /hr/leave/apply.
--
-- SYMPTOM: the Leave Type dropdown rendered "— 24.0 day(s) available" with no
-- name, and "Your Current Balance" listed rows with an empty label. Day counts
-- were correct, only names were missing.
--
-- ROOT CAUSE — transitive RLS. hlt_select was:
--
--   USING (
--     hr_organization_id IN (
--       SELECT o.id FROM hr_organizations o
--       JOIN staff s ON s.institution_id = o.institution_id
--       WHERE s.profile_id = auth.uid()
--     )
--     OR user_has_permission('hr.leave.types.manage')
--   )
--
-- The subquery reads hr_organizations, which has its own RLS:
--   (id = auth_hr_organization_id()) OR is_super_admin()   [+ fn_is_hr_admin()]
-- A policy's subquery runs as the CALLER, so it is filtered by that policy too.
-- auth_hr_organization_id() reads user_hr_access, and ordinary staff have no
-- row there → returns NULL → hr_organizations yields 0 rows → the IN list is
-- empty → 0 leave types visible.
--
-- Measured for staff NOT260 (profile dc2e3fa9-…):
--   own staff row visible      1     (staff RLS is fine)
--   hr_organizations visible   0     ← the break
--   hr_leave_types visible     0
--   hr_leave_balances visible  6     (balances were always readable)
--
-- That mismatch is why the numbers rendered but the names did not: PostgREST
-- returns a NULL embed for an unreadable related row, and the service maps it
-- with `lt?.leave_type_name ?? ''`, so the failure surfaced as an empty string
-- instead of an error.
--
-- FIX: resolve the caller's organizations in a SECURITY DEFINER helper so the
-- mapping is not subject to hr_organizations RLS. The policy's INTENT is
-- unchanged — staff still see only leave types belonging to organizations at
-- their own institution. This does not widen access to hr_organizations
-- itself; the helper returns ids only.

-- Returns the hr_organization ids whose institution the caller is staff at.
-- SECURITY DEFINER: must not be filtered by the caller's hr_organizations RLS,
-- which is the whole bug. STABLE so the planner evaluates it once per query.
CREATE OR REPLACE FUNCTION public.hr_staff_visible_org_ids()
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT COALESCE(array_agg(DISTINCT o.id), ARRAY[]::uuid[])
  FROM public.hr_organizations o
  JOIN public.staff s ON s.institution_id = o.institution_id
  WHERE s.profile_id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.hr_staff_visible_org_ids() FROM anon;
GRANT EXECUTE ON FUNCTION public.hr_staff_visible_org_ids() TO authenticated;

DROP POLICY IF EXISTS hlt_select ON public.hr_leave_types;

-- `IN (SELECT unnest(fn()))` — NOT `= ANY(fn())`. The unnest form forces a
-- single evaluation of the function; = ANY(fn()) re-invokes it per row and has
-- produced 57014 statement timeouts elsewhere in this schema.
CREATE POLICY hlt_select ON public.hr_leave_types
  FOR SELECT TO authenticated
  USING (
    hr_organization_id IN (SELECT unnest(public.hr_staff_visible_org_ids()))
    OR public.user_has_permission('hr.leave.types.manage')
  );
