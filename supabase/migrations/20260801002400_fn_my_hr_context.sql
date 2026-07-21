-- ─── fn_my_hr_context() — resolve the caller's HR identity ──────────────────
-- 2026-07-21 (applied via MCP as `fn_my_hr_context`)
--
-- WHY THIS EXISTS. Every HR self-service page resolves "who am I" through
-- getCurrentEmployee() in lib/services/hr/regularization-service.ts, which
-- queried `hr_employees`. That table has 0 rows — all 740 active staff were
-- moved to `staff` by 20260524083600_consolidate_hr_employees_to_staff — so it
-- returned NULL for every user, and leave apply / attendance regularization
-- were unreachable for the entire organisation.
--
-- WHY AN RPC RATHER THAN A PLAIN QUERY. The replacement needs
-- hr_organization_id, which lives on hr_staff_details and hr_organizations.
-- BOTH of those tables gate RLS on auth_hr_organization_id(), which reads
-- user_hr_access — a table holding 1 row for 844 staff. So an ordinary staff
-- member cannot read either table, and a client-side join would just swap one
-- dead end for another. This SECURITY DEFINER function reads past that broken
-- tenancy gate.
--
-- WHY THAT IS SAFE. The function is SELF-AUTHORIZING: the WHERE clause pins
-- s.profile_id = auth.uid() internally, and no parameter is accepted. A caller
-- can only ever receive their own row — there is no argument to tamper with,
-- so it cannot be turned into an enumeration primitive. (Compare the IDOR in
-- /api/hr/leave/balance, which takes employee_id from the query string.)
--
-- ORG RESOLUTION, in priority order:
--   1. hr_staff_details.hr_organization_id — authoritative, but only 543 of
--      740 active staff have a row.
--   2. hr_organizations.institution_id = staff.institution_id — verified 1:1
--      (14 orgs ↔ 14 distinct institutions) and resolvable for all 740.
-- The COALESCE means every active staff member resolves, while those with real
-- HR details keep the authoritative value.
--
-- DELIBERATELY NOT a fix for the underlying tenancy break: the 32 tables gated
-- on auth_hr_organization_id() are addressed by the Phase 0b RLS retrofit.
-- This function only unblocks identity resolution.

CREATE OR REPLACE FUNCTION public.fn_my_hr_context()
RETURNS TABLE (
  staff_id           uuid,
  profile_id         uuid,
  hr_organization_id uuid,
  institution_id     uuid,
  first_name         text,
  last_name          text,
  email              text,
  employee_code      text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    s.id,
    s.profile_id,
    COALESCE(d.hr_organization_id, o.id),
    s.institution_id,
    s.first_name::text,
    s.last_name::text,
    s.email::text,
    COALESCE(d.hr_employee_code, s.staff_id)::text
  FROM public.staff s
  LEFT JOIN public.hr_staff_details d ON d.staff_id = s.id
  LEFT JOIN public.hr_organizations o ON o.institution_id = s.institution_id
  WHERE s.profile_id = auth.uid()
    AND s.is_active
  LIMIT 1;
$$;

-- Callable by signed-in users only. REVOKE from anon explicitly — granting to
-- PUBLIC would include the anon role.
REVOKE ALL ON FUNCTION public.fn_my_hr_context() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_my_hr_context() FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_my_hr_context() TO authenticated;

COMMENT ON FUNCTION public.fn_my_hr_context() IS
  'Resolves the calling user''s HR identity (staff row + hr_organization_id). Self-authorizing: pins to auth.uid(), takes no arguments. Replaces the dead hr_employees lookup in getCurrentEmployee().';
