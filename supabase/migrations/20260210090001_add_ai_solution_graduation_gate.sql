-- Migration: Add AI Solution Graduation Gate
-- Purpose: Track whether each learner has completed an AI-collaboration solution
-- via Solutions Hub. Required for June 2026+ graduation.
-- Date: 2026-02-10

-- ============================================================================
-- 1. Add graduation gate fields to learners_profiles
-- ============================================================================

ALTER TABLE learners_profiles
  ADD COLUMN IF NOT EXISTS ai_solution_cleared BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_solution_cleared_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ai_solution_cleared_by UUID;

COMMENT ON COLUMN learners_profiles.ai_solution_cleared IS
  'Whether learner completed an AI-collaboration solution via Solutions Hub. Required for June 2026+ graduation.';
COMMENT ON COLUMN learners_profiles.ai_solution_cleared_at IS
  'Timestamp when AI solution clearance was granted.';
COMMENT ON COLUMN learners_profiles.ai_solution_cleared_by IS
  'UUID of user who granted clearance (auto or manual).';

-- ============================================================================
-- 2. Function to check and update clearance based on builder assignments
-- ============================================================================

CREATE OR REPLACE FUNCTION check_ai_solution_clearance(p_learner_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_cleared BOOLEAN;
BEGIN
  -- Check if learner has at least one completed builder assignment with a rating
  SELECT EXISTS(
    SELECT 1
    FROM sh_builders b
    JOIN sh_builder_assignments ba ON ba.builder_id = b.id
    WHERE b.learner_id = p_learner_id
      AND ba.status = 'completed'
      AND ba.rating IS NOT NULL
  ) INTO v_cleared;

  -- Update the learner profile
  UPDATE learners_profiles
  SET
    ai_solution_cleared = v_cleared,
    ai_solution_cleared_at = CASE
      WHEN v_cleared AND ai_solution_cleared_at IS NULL THEN NOW()
      WHEN NOT v_cleared THEN NULL
      ELSE ai_solution_cleared_at
    END
  WHERE id = p_learner_id;

  RETURN v_cleared;
END;
$$;

-- ============================================================================
-- 3. Trigger: Auto-check clearance when builder assignment status changes
-- ============================================================================

CREATE OR REPLACE FUNCTION trigger_check_ai_clearance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_learner_id UUID;
BEGIN
  -- Get the learner_id from the builder
  SELECT b.learner_id INTO v_learner_id
  FROM sh_builders b
  WHERE b.id = NEW.builder_id;

  -- Only check if this builder is linked to a learner (not staff-only builders)
  IF v_learner_id IS NOT NULL THEN
    PERFORM check_ai_solution_clearance(v_learner_id);
  END IF;

  RETURN NEW;
END;
$$;

-- Drop trigger if exists (idempotent)
DROP TRIGGER IF EXISTS trg_builder_assignment_clearance ON sh_builder_assignments;

CREATE TRIGGER trg_builder_assignment_clearance
  AFTER UPDATE OF status ON sh_builder_assignments
  FOR EACH ROW
  WHEN (NEW.status = 'completed')
  EXECUTE FUNCTION trigger_check_ai_clearance();

-- Also trigger on INSERT (in case assignment is created as completed)
DROP TRIGGER IF EXISTS trg_builder_assignment_clearance_insert ON sh_builder_assignments;

CREATE TRIGGER trg_builder_assignment_clearance_insert
  AFTER INSERT ON sh_builder_assignments
  FOR EACH ROW
  WHEN (NEW.status = 'completed')
  EXECUTE FUNCTION trigger_check_ai_clearance();

-- ============================================================================
-- 4. Index for faster compliance queries
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_learners_ai_solution_cleared
  ON learners_profiles (ai_solution_cleared)
  WHERE lifecycle_status = 'active';
