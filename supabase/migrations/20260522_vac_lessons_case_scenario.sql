-- ============================================================================
-- Migration: 20260522_vac_lessons_case_scenario
-- AICBL → PDE Clinical Reasoning sprint, Agent A — Step A5
-- ============================================================================
-- Adds case_scenario JSONB column to vac_lessons for clinical_case lessons.
--
-- Per decision 13: clinical case = vac_lessons row (carries case_scenario,
-- optional pre-reading via existing gemini_prompts + student_content fields)
-- + pde_assessments row (assessment_type='clinical_case', lesson_id FK).
--
-- Schema:
--   case_scenario JSONB = {
--     patient_name: TEXT,
--     age: INT,
--     gender: TEXT,
--     occupation?: TEXT,
--     chief_complaint: TEXT,
--     hopi: TEXT,                     -- history of presenting illness
--     medical_history: TEXT,
--     habit_history: {
--       type: TEXT,                   -- e.g., 'areca_nut', 'smoking'
--       duration_years: INT,
--       frequency: TEXT,
--       quantity: TEXT,
--       current_status: TEXT
--     },
--     additional_clinical_details: TEXT
--   }
--
-- NULL for non-clinical-case lessons (default behaviour preserved).
--
-- Idempotent. Safe to re-apply.
-- ============================================================================

ALTER TABLE vac_lessons
  ADD COLUMN IF NOT EXISTS case_scenario JSONB;

COMMENT ON COLUMN vac_lessons.case_scenario IS
  'Clinical case patient scenario JSON. NULL for non-clinical lessons. Populated for vac_lessons that are linked from a pde_assessments row with assessment_type=clinical_case. Schema: {patient_name, age, gender, occupation?, chief_complaint, hopi, medical_history, habit_history: {type, duration_years, frequency, quantity, current_status}, additional_clinical_details}.';

-- Index for finding case-lessons quickly (partial index, NULL excluded)
CREATE INDEX IF NOT EXISTS idx_vac_lessons_case_scenario_present
  ON vac_lessons (course_id)
  WHERE case_scenario IS NOT NULL;
