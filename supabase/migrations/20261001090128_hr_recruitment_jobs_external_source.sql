-- ============================================================================
-- HR Recruitment Jobs — external-source provenance (CVViZ import)
-- Created: 2026-10-01
--
-- Why
-- ---
-- Job postings are being migrated from CVViZ (the external ATS being sunset)
-- into hr_recruitment_jobs. These columns record where an imported row came
-- from so the import is idempotent (re-running inserts nothing twice) and the
-- CVViZ-only data that has no MyJKKN column (screening questions, feedback
-- criteria, recruiters, candidate/stage counts, close reason, original salary
-- as entered, ...) is preserved instead of dropped.
--
-- Native MyJKKN jobs leave all four NULL.
-- ============================================================================

ALTER TABLE public.hr_recruitment_jobs
  ADD COLUMN IF NOT EXISTS external_source text,
  ADD COLUMN IF NOT EXISTS external_id     text,
  ADD COLUMN IF NOT EXISTS external_url    text,
  ADD COLUMN IF NOT EXISTS external_meta   jsonb;

ALTER TABLE public.hr_recruitment_jobs
  DROP CONSTRAINT IF EXISTS hr_recruitment_jobs_external_pair_chk;
ALTER TABLE public.hr_recruitment_jobs
  ADD CONSTRAINT hr_recruitment_jobs_external_pair_chk CHECK (
    (external_source IS NULL) = (external_id IS NULL)
  );

-- One row per external record; NULL pairs (native jobs) are exempt.
DROP INDEX IF EXISTS public.uq_hr_recruitment_jobs_external;
CREATE UNIQUE INDEX uq_hr_recruitment_jobs_external
  ON public.hr_recruitment_jobs(external_source, external_id);

COMMENT ON COLUMN public.hr_recruitment_jobs.external_source IS
  'Source system of an imported job (e.g. ''cvviz''). NULL for jobs created in MyJKKN.';
COMMENT ON COLUMN public.hr_recruitment_jobs.external_id IS
  'Job id in the source system. Unique together with external_source.';
COMMENT ON COLUMN public.hr_recruitment_jobs.external_url IS
  'Public link to the job in the source system, kept for reference.';
COMMENT ON COLUMN public.hr_recruitment_jobs.external_meta IS
  'Source-only fields with no MyJKKN column (screening questions, feedback criteria, recruiters, candidate/stage counts, original salary as entered, etc.).';
