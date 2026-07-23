-- =====================================================================================
-- Job-level discussion thread for the recruitment approvals workspace
-- (/hr/recruitment/approvals/[jobId] — Notes tab). Mirrors the
-- hr_recruitment_candidate_comments pattern: visibility inherits the job row's
-- RLS via EXISTS — if you can see the job, you can read/write its notes.
-- =====================================================================================

CREATE TABLE IF NOT EXISTS hr_recruitment_job_notes (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id             uuid NOT NULL REFERENCES hr_recruitment_jobs(id) ON DELETE CASCADE,
  hr_organization_id uuid NOT NULL REFERENCES hr_organizations(id),
  author_id          uuid NOT NULL REFERENCES profiles(id),
  note               text NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hr_rec_job_notes_job
  ON hr_recruitment_job_notes(job_id, created_at);

CREATE TRIGGER hr_rec_job_notes_updated_at
  BEFORE UPDATE ON hr_recruitment_job_notes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE hr_recruitment_job_notes ENABLE ROW LEVEL SECURITY;

-- Read: anyone who can see the job row (inherits job RLS).
CREATE POLICY hr_rec_job_notes_select ON hr_recruitment_job_notes
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM hr_recruitment_jobs j
      WHERE j.id = hr_recruitment_job_notes.job_id
    )
  );

-- Write: must be able to see the job AND write as yourself.
CREATE POLICY hr_rec_job_notes_insert ON hr_recruitment_job_notes
  FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM hr_recruitment_jobs j
      WHERE j.id = hr_recruitment_job_notes.job_id
    )
  );
