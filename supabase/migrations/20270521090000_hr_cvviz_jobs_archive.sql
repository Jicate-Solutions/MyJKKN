-- =====================================================================
-- CVViZ → MyJKKN migration, Phase 1: jobs archive
-- Spec: specs/cvviz-to-myjkkn-recruitment-migration-2026-10-01.md (§5.2, §8)
--
-- hr_cvviz_jobs holds every CVViZ job (388 at the 2026-10-01 snapshot) as a
-- READ-ONLY archive. Typed columns for filtering/display + the original API
-- payload in raw. Rows are written only by scripts/apply-hr-cvviz-jobs.mjs
-- (service role, idempotent upsert on cvviz_job_id) — there is no
-- INSERT/UPDATE/DELETE policy, so no app user can change archive rows.
--
-- Visibility follows the decision of 2026-10-01: institution-wise, admins see
-- all. NOTE role_has_institution_access(NULL) returns TRUE, so rows without an
-- institution are explicitly restricted to admins below.
--
-- Promotion to the live hr_recruitment_jobs is a later phase; myjkkn_job_id
-- records that link when it happens.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.hr_cvviz_jobs (
  cvviz_job_id          bigint PRIMARY KEY,
  job_code              text,
  title                 text NOT NULL,

  -- CVViZ status: 3 Pending Approval, 5 In Progress, 9 Cancelled, 10 Closed, 11 Archived
  status_code           integer NOT NULL,
  status_label          text NOT NULL,
  approval_status       integer,
  approval_group_id     integer,
  current_stage         integer,
  is_deleted            boolean NOT NULL DEFAULT false,  -- deleted in CVViZ (47 at snapshot), still archived
  is_draft              boolean NOT NULL DEFAULT false,

  cvviz_department_id   bigint,
  cvviz_department_name text,
  job_function          text,
  industry              text,
  employer_type         text,
  job_type              text,
  education_level       text,
  qualifications        text[] NOT NULL DEFAULT '{}',
  skills                jsonb  NOT NULL DEFAULT '[]',
  min_experience_years  integer,
  max_experience_years  integer,
  salary_min            numeric(12, 2),
  salary_max            numeric(12, 2),
  salary_currency       text,
  salary_interval       text,
  country               text,
  state                 text,
  city                  text,
  zip_code              text,
  is_remote             boolean NOT NULL DEFAULT false,
  description_html      text,
  parsed_skills         text,
  validity_days         integer,

  -- application form + interview settings
  resume_mandatory          boolean,
  show_resume_upload        boolean,
  show_salary_on_career_page boolean,
  include_prescreening      boolean,
  feedback_type             integer,                      -- 1 basic, 2 detailed
  feedback_criteria         jsonb NOT NULL DEFAULT '[]',
  benchmark_data            jsonb NOT NULL DEFAULT '[]',
  career_page_url           text,

  assigned_recruiters   jsonb NOT NULL DEFAULT '[]',
  hiring_manager        jsonb,
  approvers             jsonb NOT NULL DEFAULT '[]',
  screening_questions   jsonb NOT NULL DEFAULT '[]',
  publication           jsonb,
  share_url             text,
  stage_counts          jsonb,
  candidate_total       integer NOT NULL DEFAULT 0,
  job_notes             jsonb NOT NULL DEFAULT '[]',

  created_by_cvviz_id   bigint,
  created_by_name       text,
  updated_by_name       text,
  cvviz_created_at      timestamptz,
  cvviz_updated_at      timestamptz,
  last_evaluated_at     timestamptz,
  closed_at             timestamptz,
  close_reason          text,

  -- MyJKKN placement (from the reviewed department map)
  institution_code      text,
  institution_id        uuid REFERENCES public.institutions(id),
  department_id         uuid REFERENCES public.departments(id),
  mapping_status        text NOT NULL DEFAULT 'auto'
                          CHECK (mapping_status IN ('auto', 'pending', 'confirmed')),
  mapping_note          text,

  myjkkn_job_id         uuid REFERENCES public.hr_recruitment_jobs(id) ON DELETE SET NULL,

  -- Full CVViZ payload: every field, including those empty for all 388 jobs at
  -- snapshot (employer, tags, visa*, customer, contactEmail, externalRecruiters,
  -- workflowTemplateId, criteriaData, chatbotScript, duration, hourlyRate …).
  raw                   jsonb NOT NULL,
  imported_at           timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.hr_cvviz_jobs IS
  'Read-only archive of CVViZ jobs (tenant 2814). Written only by scripts/apply-hr-cvviz-jobs.mjs.';
COMMENT ON COLUMN public.hr_cvviz_jobs.mapping_status IS
  'auto = derived from CVViZ department name; pending = needs reviewer decision (e.g. CAS Self vs Aided); confirmed = reviewer signed off.';

CREATE INDEX IF NOT EXISTS idx_hr_cvviz_jobs_institution ON public.hr_cvviz_jobs(institution_id);
CREATE INDEX IF NOT EXISTS idx_hr_cvviz_jobs_status      ON public.hr_cvviz_jobs(status_code);
CREATE INDEX IF NOT EXISTS idx_hr_cvviz_jobs_created     ON public.hr_cvviz_jobs(cvviz_created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hr_cvviz_jobs_job_code    ON public.hr_cvviz_jobs(job_code);

ALTER TABLE public.hr_cvviz_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hr_cvviz_jobs_select" ON public.hr_cvviz_jobs;
CREATE POLICY "hr_cvviz_jobs_select"
  ON public.hr_cvviz_jobs FOR SELECT USING (
    is_super_admin() OR is_admin()
    OR (user_has_permission('hr.recruitment.view')
        AND institution_id IS NOT NULL
        AND role_has_institution_access(institution_id))
  );
-- No INSERT / UPDATE / DELETE policies: archive is service-role-write only.

GRANT SELECT ON public.hr_cvviz_jobs TO authenticated;
