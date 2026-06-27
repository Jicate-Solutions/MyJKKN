-- ============================================================================
-- HR Recruitment Jobs — auto-derive hr_organization_id from institution_id.
-- Created: 2026-06-25
--
-- Why
-- ---
-- hr_recruitment_jobs.hr_organization_id is NOT NULL but has no FK — a
-- "shadow tenant" key. hr_organizations is 1:1 with institutions
-- (hr_organizations.institution_id), so the org is fully determined by the
-- chosen college. Forcing HR officers to paste the org UUID in the Add-Job
-- modal was redundant and error-prone.
--
-- hr_organizations carries tenant-isolation RLS
-- (id = auth_hr_organization_id() OR is_super_admin()), so a multi-institution
-- HR admin CANNOT read another college's org row from the client. Deriving the
-- org in app code would silently fail for them. This trigger resolves it
-- server-side under SECURITY DEFINER, so it works for every role.
--
-- Behaviour: only fills when hr_organization_id is left NULL, so existing
-- callers that pass an explicit org (and org-wide inserts with institution_id
-- NULL but org provided) are unaffected.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.hr_recruitment_jobs_fill_org()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.hr_organization_id IS NULL AND NEW.institution_id IS NOT NULL THEN
    SELECT o.id
      INTO NEW.hr_organization_id
      FROM public.hr_organizations o
     WHERE o.institution_id = NEW.institution_id
     LIMIT 1;
  END IF;

  IF NEW.hr_organization_id IS NULL THEN
    RAISE EXCEPTION
      'No HR organization found for institution_id=%. Pick a college that has an HR organization.',
      NEW.institution_id
      USING ERRCODE = '23502';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.hr_recruitment_jobs_fill_org() IS
  'Derives hr_recruitment_jobs.hr_organization_id from institution_id (1:1 via hr_organizations.institution_id) when left NULL. SECURITY DEFINER to bypass hr_organizations tenant-isolation RLS for multi-institution HR admins. Lets the Add-Job UI collect only the college. Created 2026-06-25.';

DROP TRIGGER IF EXISTS hr_recruitment_jobs_fill_org_biu ON public.hr_recruitment_jobs;
CREATE TRIGGER hr_recruitment_jobs_fill_org_biu
  BEFORE INSERT OR UPDATE OF institution_id, hr_organization_id
  ON public.hr_recruitment_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.hr_recruitment_jobs_fill_org();
