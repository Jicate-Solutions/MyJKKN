-- ============================================
-- Migration: Update judge scoring criteria to match ops plan
-- Old criteria (1-10 each, unweighted sum):
--   problem_impact, solution_innovation, working_prototype,
--   user_validation, presentation_quality, bioconvergence_alignment
-- New criteria (1-5 each, weighted total out of 5.0):
--   real_problem (25%), working_app (25%), user_tested (20%),
--   completeness (15%), presentation (15%)
-- ============================================

-- Step 1: Add new columns
ALTER TABLE public.ss_judge_scores
  ADD COLUMN IF NOT EXISTS real_problem INTEGER CHECK (real_problem >= 1 AND real_problem <= 5),
  ADD COLUMN IF NOT EXISTS working_app INTEGER CHECK (working_app >= 1 AND working_app <= 5),
  ADD COLUMN IF NOT EXISTS user_tested INTEGER CHECK (user_tested >= 1 AND user_tested <= 5),
  ADD COLUMN IF NOT EXISTS completeness INTEGER CHECK (completeness >= 1 AND completeness <= 5),
  ADD COLUMN IF NOT EXISTS presentation INTEGER CHECK (presentation >= 1 AND presentation <= 5);

-- Step 2: Migrate existing data (approximate mapping from 1-10 to 1-5)
UPDATE public.ss_judge_scores
SET
  real_problem = GREATEST(1, LEAST(5, ROUND(problem_impact / 2.0)::INTEGER)),
  working_app = GREATEST(1, LEAST(5, ROUND(working_prototype / 2.0)::INTEGER)),
  user_tested = GREATEST(1, LEAST(5, ROUND(user_validation / 2.0)::INTEGER)),
  completeness = GREATEST(1, LEAST(5, ROUND(solution_innovation / 2.0)::INTEGER)),
  presentation = GREATEST(1, LEAST(5, ROUND(presentation_quality / 2.0)::INTEGER))
WHERE problem_impact IS NOT NULL
   OR working_prototype IS NOT NULL
   OR user_validation IS NOT NULL
   OR solution_innovation IS NOT NULL
   OR presentation_quality IS NOT NULL;

-- Step 3: Recalculate weighted scores for migrated rows
-- Weighted formula: real_problem*0.25 + working_app*0.25 + user_tested*0.20 + completeness*0.15 + presentation*0.15
UPDATE public.ss_judge_scores
SET
  weighted_score = ROUND(
    (COALESCE(real_problem, 0) * 0.25 +
     COALESCE(working_app, 0) * 0.25 +
     COALESCE(user_tested, 0) * 0.20 +
     COALESCE(completeness, 0) * 0.15 +
     COALESCE(presentation, 0) * 0.15) * 20, 2
  ),
  total_score = ROUND(
    (COALESCE(real_problem, 0) * 0.25 +
     COALESCE(working_app, 0) * 0.25 +
     COALESCE(user_tested, 0) * 0.20 +
     COALESCE(completeness, 0) * 0.15 +
     COALESCE(presentation, 0) * 0.15) * 20, 2
  )
WHERE real_problem IS NOT NULL;

-- Step 4: Drop old columns (keeping data migration above as safety net)
ALTER TABLE public.ss_judge_scores
  DROP COLUMN IF EXISTS problem_impact,
  DROP COLUMN IF EXISTS solution_innovation,
  DROP COLUMN IF EXISTS working_prototype,
  DROP COLUMN IF EXISTS user_validation,
  DROP COLUMN IF EXISTS presentation_quality,
  DROP COLUMN IF EXISTS bioconvergence_alignment,
  DROP COLUMN IF EXISTS bonus_cross_disciplinary,
  DROP COLUMN IF EXISTS bonus_cross_institutional,
  DROP COLUMN IF EXISTS bonus_first_year,
  DROP COLUMN IF EXISTS bonus_user_testimonials;
