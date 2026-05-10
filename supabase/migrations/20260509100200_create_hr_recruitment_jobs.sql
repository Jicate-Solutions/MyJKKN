-- ============================================================================
-- HR Recruitment — Jobs table (Phase 3, Cvviz-sunset scope)
-- ============================================================================
-- Created: 2026-05-09
-- Spec: specs/hr-recruitment-module-spec.md
-- Decomposition: specs/hr-module-decomposition-2026-05-09.md (Tier 1, T1.2)
--
-- Purpose
-- -------
-- The HR Recruitment service (lib/services/hr/recruitment-jobs-service.ts)
-- and API route (app/api/hr/recruitment/jobs/route.ts) reference a
-- `hr_recruitment_jobs` table that did not exist in production. Hitting
-- /hr/recruitment/jobs returned 404 (page) and 500 (API) because of this
-- schema gap.
--
-- Schema below mirrors the TS contract in types/hr-recruitment.ts
-- (HRRecruitmentJob, HRRecruitmentJobInsert, HRRecruitmentJobUpdate, JobStatus,
-- RoleCategory, JobRequirements) verbatim — no inference. The 7 service query
-- sites (listJobs filters, getJob, createJob, updateJob, publishJob, closeJob,
-- deleteJob) all read/write columns enumerated below.
--
-- RLS pattern mirrors hr_recruitment_candidates (supabase/setup/03_policies.sql
-- lines 5011-5036): super_admin OR admin OR (specific permission AND
-- role_has_institution_access). Permission keys reuse the existing
-- hr.recruitment.{view,create,edit,delete} grants in lib/constants/permissions.ts
-- so HR Officers gain access automatically without a new permission row.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hr_recruitment_jobs (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hr_organization_id      uuid NOT NULL,                                   -- shadow-tenant FK (mirrors hr_recruitment_candidates)
  institution_id          uuid REFERENCES public.institutions(id),         -- enables role_has_institution_access() scoping
  title                   text NOT NULL,
  role_category           text NOT NULL CHECK (role_category IN (
                            'teaching_faculty',
                            'medical',
                            'non_teaching',
                            'senior_leadership',
                            'contract'
                          )),
  description             text,
  requirements            jsonb NOT NULL DEFAULT '{}',                     -- JobRequirements: qualifications/experience/skills
  min_monthly_salary      numeric(12, 2),
  max_monthly_salary      numeric(12, 2),
  positions_open          integer NOT NULL DEFAULT 1 CHECK (positions_open >= 0),
  positions_filled        integer NOT NULL DEFAULT 0 CHECK (positions_filled >= 0),
  department_id           uuid REFERENCES public.departments(id),
  status                  text NOT NULL DEFAULT 'draft' CHECK (status IN (
                            'draft',
                            'open',
                            'on_hold',
                            'closed',
                            'filled'
                          )),
  is_public               boolean NOT NULL DEFAULT false,                  -- flips true on publish for /careers visibility
  posted_at               timestamptz,
  closes_at               timestamptz,
  created_by              uuid REFERENCES public.profiles(id),
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hr_recruitment_jobs_salary_range_chk CHECK (
    min_monthly_salary IS NULL
    OR max_monthly_salary IS NULL
    OR min_monthly_salary <= max_monthly_salary
  )
);

COMMENT ON TABLE public.hr_recruitment_jobs IS
  'HR Recruitment — Job postings. Shadow-tenant via hr_organization_id; institution_id scopes RLS for HR officers. Status flow: draft → open → (on_hold) → closed/filled. is_public=true exposes the row to the unauthenticated /careers page.';
COMMENT ON COLUMN public.hr_recruitment_jobs.is_public IS
  'When true, this job is visible on the public /careers page. publishJob() sets this in tandem with status=open.';
COMMENT ON COLUMN public.hr_recruitment_jobs.requirements IS
  'JobRequirements JSON: { qualifications?: string[], experience?: string, skills?: string[], ... }. Schema-less for forward compatibility per Learning #2 (role_specific_details pattern).';
COMMENT ON COLUMN public.hr_recruitment_jobs.min_monthly_salary IS
  'Lower bound of monthly salary range advertised (INR). NULL = not disclosed. Service enforces min <= max in createJob/updateJob.';

-- ---------------------------------------------------------------------------
-- 2) Indexes
-- ---------------------------------------------------------------------------
-- Match the access patterns hit by RecruitmentJobsService.listJobs() filters.
CREATE INDEX IF NOT EXISTS idx_hr_recruitment_jobs_hr_org
  ON public.hr_recruitment_jobs(hr_organization_id);

CREATE INDEX IF NOT EXISTS idx_hr_recruitment_jobs_institution
  ON public.hr_recruitment_jobs(institution_id);

CREATE INDEX IF NOT EXISTS idx_hr_recruitment_jobs_status
  ON public.hr_recruitment_jobs(status);

CREATE INDEX IF NOT EXISTS idx_hr_recruitment_jobs_role_category
  ON public.hr_recruitment_jobs(role_category);

CREATE INDEX IF NOT EXISTS idx_hr_recruitment_jobs_department
  ON public.hr_recruitment_jobs(department_id);

-- Public /careers page lists open + public rows ordered by recency.
CREATE INDEX IF NOT EXISTS idx_hr_recruitment_jobs_public
  ON public.hr_recruitment_jobs(is_public, status, posted_at DESC)
  WHERE is_public = true;

CREATE INDEX IF NOT EXISTS idx_hr_recruitment_jobs_created_at
  ON public.hr_recruitment_jobs(created_at DESC);

-- ---------------------------------------------------------------------------
-- 3) Trigger — keep updated_at fresh on every UPDATE.
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS hr_recruitment_jobs_updated_at
  ON public.hr_recruitment_jobs;
CREATE TRIGGER hr_recruitment_jobs_updated_at
  BEFORE UPDATE ON public.hr_recruitment_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 4) Row Level Security
-- ---------------------------------------------------------------------------
ALTER TABLE public.hr_recruitment_jobs ENABLE ROW LEVEL SECURITY;

-- SELECT: super_admin / admin always; otherwise hr.recruitment.view + institution scope.
-- Public surface (the /careers page) reads via a service-role client bypassing RLS;
-- if that is later switched to anon, extend this policy with `OR is_public = true`.
DROP POLICY IF EXISTS "hr_recruitment_jobs_select_permission"
  ON public.hr_recruitment_jobs;
CREATE POLICY "hr_recruitment_jobs_select_permission"
  ON public.hr_recruitment_jobs FOR SELECT USING (
    is_super_admin() OR is_admin()
    OR (user_has_permission('hr.recruitment.view')
        AND role_has_institution_access(institution_id))
  );

-- INSERT: super_admin / admin always; otherwise hr.recruitment.create.
DROP POLICY IF EXISTS "hr_recruitment_jobs_insert_permission"
  ON public.hr_recruitment_jobs;
CREATE POLICY "hr_recruitment_jobs_insert_permission"
  ON public.hr_recruitment_jobs FOR INSERT WITH CHECK (
    is_super_admin() OR is_admin()
    OR user_has_permission('hr.recruitment.create')
  );

-- UPDATE: super_admin / admin always; otherwise hr.recruitment.edit + institution scope.
DROP POLICY IF EXISTS "hr_recruitment_jobs_update_permission"
  ON public.hr_recruitment_jobs;
CREATE POLICY "hr_recruitment_jobs_update_permission"
  ON public.hr_recruitment_jobs FOR UPDATE USING (
    is_super_admin() OR is_admin()
    OR (user_has_permission('hr.recruitment.edit')
        AND role_has_institution_access(institution_id))
  );

-- DELETE: super_admin / admin always; otherwise hr.recruitment.delete.
DROP POLICY IF EXISTS "hr_recruitment_jobs_delete_permission"
  ON public.hr_recruitment_jobs;
CREATE POLICY "hr_recruitment_jobs_delete_permission"
  ON public.hr_recruitment_jobs FOR DELETE USING (
    is_super_admin() OR is_admin()
    OR user_has_permission('hr.recruitment.delete')
  );

-- ---------------------------------------------------------------------------
-- 5) Done. Table starts empty per task scope (no seed migration).
-- ---------------------------------------------------------------------------
