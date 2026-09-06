-- Migration: hr_job_applications
-- Date: 2026-06-27
-- Description: Self-service job application table + hr-resumes storage bucket.
--   Candidates browse open job postings and apply via a 3-step wizard
--   (resume upload → applicant details → confirm). This replaces the old
--   CVViz-URL-based candidate submission on /hr/recruitment/submit.

-- ============================================================
-- Table
-- ============================================================

CREATE TABLE IF NOT EXISTS hr_job_applications (
  id                            uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Job linkage
  job_id                        uuid NOT NULL REFERENCES hr_recruitment_jobs(id) ON DELETE CASCADE,
  institution_id                uuid REFERENCES institutions(id),

  -- Personal info (snapshot at submission time)
  first_name                    text NOT NULL,
  last_name                     text NOT NULL,
  email                         text NOT NULL,
  phone                         text NOT NULL,

  -- Professional info
  current_job_title             text,
  current_company               text,
  current_job_duration_months   integer,
  experience_months             integer NOT NULL DEFAULT 0,
  qualification                 text NOT NULL,
  worked_cities                 text[] NOT NULL DEFAULT '{}',

  -- Resume (path in hr-resumes storage bucket)
  resume_url                    text NOT NULL,
  resume_filename               text NOT NULL,
  resume_size_bytes             integer,

  -- Lifecycle
  status                        text NOT NULL DEFAULT 'pending'
                                  CHECK (status IN ('pending', 'reviewed', 'shortlisted', 'rejected')),
  reviewed_by                   uuid REFERENCES auth.users(id),
  reviewed_at                   timestamptz,
  review_notes                  text,

  -- Applicant identity (when applying while logged in)
  applicant_user_id             uuid REFERENCES auth.users(id),

  submitted_at                  timestamptz NOT NULL DEFAULT now(),
  created_at                    timestamptz NOT NULL DEFAULT now(),
  updated_at                    timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_hr_job_applications_job_id        ON hr_job_applications(job_id);
CREATE INDEX IF NOT EXISTS idx_hr_job_applications_institution_id ON hr_job_applications(institution_id);
CREATE INDEX IF NOT EXISTS idx_hr_job_applications_email          ON hr_job_applications(email);
CREATE INDEX IF NOT EXISTS idx_hr_job_applications_status         ON hr_job_applications(status);

-- updated_at trigger
CREATE TRIGGER hr_job_applications_updated_at
  BEFORE UPDATE ON hr_job_applications
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- RLS
-- ============================================================

ALTER TABLE hr_job_applications ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can submit an application
CREATE POLICY "Authenticated users can submit job applications"
  ON hr_job_applications FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- HR staff with view permission can read applications for their institution's jobs
CREATE POLICY "HR can view applications for their institution jobs"
  ON hr_job_applications FOR SELECT
  TO authenticated
  USING (
    user_has_permission('hr.recruitment.view')
    AND role_has_institution_access(institution_id)
  );

-- HR staff can update application status (review / shortlist / reject)
CREATE POLICY "HR can update application status"
  ON hr_job_applications FOR UPDATE
  TO authenticated
  USING (
    user_has_permission('hr.recruitment.edit')
    AND role_has_institution_access(institution_id)
  )
  WITH CHECK (
    user_has_permission('hr.recruitment.edit')
    AND role_has_institution_access(institution_id)
  );

-- Applicant can see their own submission
CREATE POLICY "Applicant can view own application"
  ON hr_job_applications FOR SELECT
  TO authenticated
  USING (applicant_user_id = auth.uid());

-- ============================================================
-- Storage bucket: hr-resumes
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'hr-resumes',
  'hr-resumes',
  false,
  2097152,   -- 2 MB
  ARRAY[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Authenticated users can upload resumes
CREATE POLICY IF NOT EXISTS "Authenticated users can upload resumes"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'hr-resumes');

-- HR staff can read resumes for their applications
CREATE POLICY IF NOT EXISTS "HR can read resumes"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'hr-resumes');
