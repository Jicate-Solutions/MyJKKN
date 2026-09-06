-- ============================================================================
-- Migration: 20260522_pde_assessment_questions_clinical_q_types
-- AICBL → PDE Clinical Reasoning sprint, Agent A — Step A3
-- ============================================================================
-- Extends pde_assessment_questions for the 3 clinical_case question types
-- (decisions 22, 25, 26).
--
-- Spec-vs-reality overrides:
--   - Spec said add `mcq_options JSONB` → reality already has `options JSONB`,
--     reusable for mcq_warmup. No new column.
--   - Spec said add `image_url TEXT` → reality already has `question_media_url
--     TEXT`, reusable for image_tag image source. No new column.
--   - Spec said ground_truth + key_concepts in metadata JSONB → no `metadata`
--     column existed; adding it.
--   - Existing question_type values (from app code: multiple_choice, true_false,
--     short_answer) preserved in CHECK; new 3 added: free_text_socratic,
--     mcq_warmup, image_tag.
--
-- Idempotent. Safe to re-apply.
-- ============================================================================

ALTER TABLE pde_assessment_questions
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS expected_regions JSONB;

-- CHECK on question_type: admit existing standard types + 3 new clinical types
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'pde_assessment_questions_question_type_check'
      AND conrelid = 'public.pde_assessment_questions'::regclass
  ) THEN
    ALTER TABLE pde_assessment_questions
      ADD CONSTRAINT pde_assessment_questions_question_type_check
      CHECK (question_type IN (
        -- Standard quiz types (used by /pde/admin/assessments/create + auto-generate route):
        'multiple_choice', 'true_false', 'short_answer',
        -- Clinical case types (decisions 22 + 25 + 26):
        'free_text_socratic', 'mcq_warmup', 'image_tag'
      ));
  END IF;
END $$;

COMMENT ON COLUMN pde_assessment_questions.metadata IS
  'Flexible JSONB store. For clinical_case Q rows: {ground_truth: TEXT, key_concepts: TEXT[], osce_domain: TEXT (data_gathering|hypothesis_generation|management_planning|patient_communication|professionalism), q_number: INT}.';

COMMENT ON COLUMN pde_assessment_questions.expected_regions IS
  'For question_type=image_tag: array of {label: TEXT, x: NUM, y: NUM, w: NUM, h: NUM, tolerance_px: INT} describing expected click regions on the image at question_media_url.';

-- Index for finding clinical Q's quickly when filtering by type
CREATE INDEX IF NOT EXISTS idx_pde_assessment_questions_clinical_type
  ON pde_assessment_questions (assessment_id, question_type)
  WHERE question_type IN ('free_text_socratic', 'mcq_warmup', 'image_tag');
