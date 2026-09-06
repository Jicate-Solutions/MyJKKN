-- =====================================================================================
-- Bridge hr_job_applications → hr_recruitment_candidates (approval pipeline).
-- Applications were a dead end: the apply wizard wrote rows here, but the
-- approval machinery (chains, /hr/recruitment/approvals) only operates on
-- hr_recruitment_candidates and nothing connected the two. HR now screens
-- applications and promotes shortlisted ones into the approval pipeline.
-- =====================================================================================

ALTER TABLE hr_job_applications
  ADD COLUMN IF NOT EXISTS promoted_candidate_id uuid REFERENCES hr_recruitment_candidates(id);

ALTER TABLE hr_job_applications DROP CONSTRAINT hr_job_applications_status_check;
ALTER TABLE hr_job_applications ADD CONSTRAINT hr_job_applications_status_check
  CHECK (status IN ('pending', 'reviewed', 'shortlisted', 'rejected', 'promoted'));

CREATE INDEX IF NOT EXISTS idx_hr_job_applications_promoted
  ON hr_job_applications(promoted_candidate_id) WHERE promoted_candidate_id IS NOT NULL;
