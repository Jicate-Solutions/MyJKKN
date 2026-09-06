-- ============================================================================
-- Migration: 20260522_pde_submissions_versioning_and_audit
-- AICBL → PDE Clinical Reasoning sprint, Agent A — Step A4
-- ============================================================================
-- Adds 2 columns to pde_submissions for clinical_case integration:
--   - assessment_version: pin each submission to the version of the case it
--     was taken under (decision 7 — case edit creates new version; past
--     attempts stay tied to their version for audit).
--   - roll_number_snapshot: capture student's roll_number at attempt time
--     (decision 9 — store BOTH canonical learner_id AND roll_number for
--     audit/export resilience to ID mutations).
--
-- Spec-vs-reality overrides:
--   - Spec said add `attempt_index INTEGER NOT NULL DEFAULT 1` — reality
--     already has `attempt_number INTEGER NOT NULL DEFAULT 1`. Reuse existing
--     column. NO new column. App layer treats attempt_number as the cap-check
--     counter (1..5 lifetime).
--   - All other pde_submissions columns from spec (learner_id, final_score,
--     etc.) already exist.
--
-- Idempotent. Safe to re-apply.
-- ============================================================================

ALTER TABLE pde_submissions
  ADD COLUMN IF NOT EXISTS assessment_version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS roll_number_snapshot TEXT;

COMMENT ON COLUMN pde_submissions.assessment_version IS
  'Version of pde_assessments at time of attempt. When faculty edits a published case, pde_assessments.version increments; new attempts pin to new version, past attempts stay tied to their original version for audit (decision 7).';

COMMENT ON COLUMN pde_submissions.roll_number_snapshot IS
  'Student roll_number at time of attempt. Captured from learners_profiles.roll_number. Preserves audit trail if roll-number mutates (transfer, repeat year) — canonical FK stays learner_id (decision 9).';

-- Index for filtering attempts by case + learner + version (audit drilldowns)
CREATE INDEX IF NOT EXISTS idx_pde_submissions_assessment_learner_version
  ON pde_submissions (assessment_id, learner_id, assessment_version, attempt_number);
