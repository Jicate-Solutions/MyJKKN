-- =====================================================================================
-- fn_hr_orgs_for_institutions — accessible institution ↔ HR organization mapping
--
-- Maps the caller's accessible institutions to their shadow HR organizations.
-- SECURITY DEFINER: hr_organizations RLS only exposes the caller's own org row
-- (id = auth_hr_organization_id() OR is_super_admin()), so multi-institution HR
-- admins cannot build this mapping client-side — the same reason
-- hr_recruitment_jobs_fill_org (20260625120000) is SECURITY DEFINER.
-- Self-authorizing: only returns rows whose institution passes
-- role_has_institution_access() (which already covers super admins and
-- scope='all' roles), so exposing EXECUTE to authenticated is safe.
--
-- Consumed by hooks/hr/use-hr-org-mappings.ts to drive the institution dropdowns
-- in /hr/leave/* (approve, calendar) and the HR PolicyEditor, replacing the raw
-- "HR Organization ID" UUID text inputs.
-- =====================================================================================

CREATE OR REPLACE FUNCTION public.fn_hr_orgs_for_institutions()
RETURNS TABLE (institution_id uuid, hr_organization_id uuid, organization_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.institution_id, o.id, o.name
  FROM public.hr_organizations o
  WHERE o.institution_id IS NOT NULL
    AND public.role_has_institution_access(o.institution_id)
$$;

REVOKE EXECUTE ON FUNCTION public.fn_hr_orgs_for_institutions() FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_hr_orgs_for_institutions() TO authenticated;
