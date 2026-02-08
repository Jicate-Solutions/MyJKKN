-- ============================================================================
-- Add FK constraints to alumni_outcomes and outcome_program_correlation
-- Without these, PostgREST cannot discover relationships for .select() joins
-- Fix: program_id -> programs(id), learner_id -> learners_profiles(id)
-- Created: 2026-02-08
-- ============================================================================

-- Add FK for program_id -> programs
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'alumni_outcomes_program_id_fkey'
      AND table_name = 'alumni_outcomes'
  ) THEN
    ALTER TABLE alumni_outcomes
      ADD CONSTRAINT alumni_outcomes_program_id_fkey
      FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Add FK for learner_id -> learners_profiles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'alumni_outcomes_learner_id_fkey'
      AND table_name = 'alumni_outcomes'
  ) THEN
    ALTER TABLE alumni_outcomes
      ADD CONSTRAINT alumni_outcomes_learner_id_fkey
      FOREIGN KEY (learner_id) REFERENCES learners_profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Add FK for outcome_program_correlation.program_id -> programs
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'outcome_program_correlation_program_id_fkey'
      AND table_name = 'outcome_program_correlation'
  ) THEN
    ALTER TABLE outcome_program_correlation
      ADD CONSTRAINT outcome_program_correlation_program_id_fkey
      FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE CASCADE;
  END IF;
END $$;
