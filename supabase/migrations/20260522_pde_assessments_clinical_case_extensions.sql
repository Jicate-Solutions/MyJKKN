-- ============================================================================
-- Migration: 20260522_pde_assessments_clinical_case_extensions
-- AICBL → PDE Clinical Reasoning sprint, Agent A — Step A2
-- ============================================================================
-- Extends pde_assessments for the clinical_case assessment type:
--   - status: draft → published → archived lifecycle
--   - version: integer (per Batch 2, decision 7 — case edit creates new version,
--     past attempts tied to version they took via pde_submissions.assessment_version)
--   - metadata: JSONB for domain_weights and other case-config (no column existed)
--
-- Spec-vs-reality overrides:
--   - assessment_type already exists as VARCHAR(20) DEFAULT 'quiz' with no CHECK.
--     Adding a CHECK that admits existing default 'quiz' plus new 'standard' and
--     'clinical_case' so existing schema + future rows are both valid. Spec said
--     "TEXT DEFAULT 'standard'"; reality kept the existing VARCHAR + default.
--   - time_limit_minutes already exists (integer nullable). No-op for that column.
--   - course_id already exists as UUID REFERENCES vac_courses(id). No-op.
--   - metadata column did NOT exist (spec assumed it does). Adding it.
--
-- Idempotent. Safe to re-apply.
-- ============================================================================

ALTER TABLE pde_assessments
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- Add CHECK constraints only if they don't already exist
DO $$
BEGIN
  -- assessment_type CHECK: admit 'quiz' (existing default), 'standard', 'clinical_case'
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'pde_assessments_assessment_type_check'
      AND conrelid = 'public.pde_assessments'::regclass
  ) THEN
    ALTER TABLE pde_assessments
      ADD CONSTRAINT pde_assessments_assessment_type_check
      CHECK (assessment_type IN ('quiz', 'standard', 'clinical_case'));
  END IF;

  -- status CHECK: draft → published → archived
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'pde_assessments_status_check'
      AND conrelid = 'public.pde_assessments'::regclass
  ) THEN
    ALTER TABLE pde_assessments
      ADD CONSTRAINT pde_assessments_status_check
      CHECK (status IN ('draft', 'published', 'archived'));
  END IF;
END $$;

COMMENT ON COLUMN pde_assessments.status IS
  'Lifecycle state for clinical_case assessments: draft → published → archived. Standard quizzes can use draft/published.';

COMMENT ON COLUMN pde_assessments.version IS
  'Monotonically incremented when faculty edits a published case. Each pde_submissions row pins to the assessment_version it was taken under (decision 7).';

COMMENT ON COLUMN pde_assessments.metadata IS
  'Flexible JSONB store. For clinical_case rows: {domain_weights: {data_gathering:25, hypothesis_generation:25, ...}} summing to 100.';

CREATE INDEX IF NOT EXISTS idx_pde_assessments_type_status
  ON pde_assessments (assessment_type, status)
  WHERE status = 'published';
