-- =====================================================
-- Migration: Bloom's to Fink's Taxonomy
-- Date: 2026-02-02
-- Purpose: Replace Bloom's Taxonomy with Fink's Taxonomy
-- Author: db-architect (swarm agent)
-- =====================================================

-- CRITICAL CONTEXT:
-- Bloom's Taxonomy (1956): Cognitive-only - remember, understand, apply, analyze, evaluate, create
-- Problem: AI can now do ALL cognitive tasks at expert level
--
-- Fink's Taxonomy (2003): Holistic learning for AI era
-- 1. foundational_knowledge - Core facts and concepts
-- 2. application - Applying knowledge to real situations
-- 3. integration - Connecting ideas across domains
-- 4. human_dimension - Understanding self and others (CRITICAL in AI era)
-- 5. caring - Developing values and caring deeply (CRITICAL in AI era)
-- 6. learning_how_to_learn - Metacognition and self-directed learning (CRITICAL in AI era)

BEGIN;

-- =====================================================
-- STEP 1: Add finks_dimensions to competency_catalog
-- =====================================================

ALTER TABLE public.competency_catalog
  ADD COLUMN IF NOT EXISTS finks_dimensions JSONB DEFAULT
    '{"foundational_knowledge": 0, "application": 0, "integration": 0, "human_dimension": 0, "caring": 0, "learning_how_to_learn": 0}'::jsonb;

COMMENT ON COLUMN public.competency_catalog.finks_dimensions IS
'Fink''s Taxonomy scores (0-100 for each dimension). Replaces bloom_taxonomy_level.
Each dimension represents a critical aspect of transformational learning:
- foundational_knowledge: Facts, concepts, principles (AI can do this - lowest priority)
- application: Using knowledge in new contexts (AI-augmented - medium priority)
- integration: Connecting ideas across disciplines and lived experience (HIGH priority)
- human_dimension: Self-awareness, relationships, social context (CRITICAL - AI cannot do)
- caring: Values, interests, ethical judgment (CRITICAL - AI is amoral)
- learning_how_to_learn: Metacognition, self-directed learning (CRITICAL - adapting to AI evolution)';

-- =====================================================
-- STEP 2: Add finks_dimensions to learner_competencies
-- =====================================================

ALTER TABLE public.learner_competencies
  ADD COLUMN IF NOT EXISTS finks_dimensions JSONB DEFAULT
    '{"foundational_knowledge": 0, "application": 0, "integration": 0, "human_dimension": 0, "caring": 0, "learning_how_to_learn": 0}'::jsonb;

COMMENT ON COLUMN public.learner_competencies.finks_dimensions IS
'Learner''s achieved scores on Fink''s 6 dimensions (0-100 each).
Tracks holistic development beyond cognitive skills.
Updated as learner demonstrates competency through evidence and assessments.';

-- =====================================================
-- STEP 3: Add finks_contribution to course_competency_mapping
-- =====================================================

ALTER TABLE public.course_competency_mapping
  ADD COLUMN IF NOT EXISTS finks_contribution JSONB DEFAULT
    '{"foundational_knowledge": 0, "application": 0, "integration": 0, "human_dimension": 0, "caring": 0, "learning_how_to_learn": 0}'::jsonb;

COMMENT ON COLUMN public.course_competency_mapping.finks_contribution IS
'Course''s contribution to each Fink''s dimension (0-100).
Indicates how much this course develops each dimension for the mapped competency.
Example: A "Data Ethics" course might score high on caring (80) and human_dimension (70),
but lower on foundational_knowledge (40).';

-- =====================================================
-- STEP 4: Create GIN Indexes for JSONB Queries
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_competency_finks
  ON public.competency_catalog USING gin(finks_dimensions);

CREATE INDEX IF NOT EXISTS idx_learner_finks
  ON public.learner_competencies USING gin(finks_dimensions);

CREATE INDEX IF NOT EXISTS idx_course_finks
  ON public.course_competency_mapping USING gin(finks_contribution);

-- =====================================================
-- STEP 5: Deprecate bloom_taxonomy_level (DON'T DELETE)
-- =====================================================

-- Rename column to mark as deprecated
ALTER TABLE public.competency_catalog
  RENAME COLUMN bloom_taxonomy_level TO bloom_taxonomy_level_deprecated;

COMMENT ON COLUMN public.competency_catalog.bloom_taxonomy_level_deprecated IS
'DEPRECATED 2026-02-02: Replaced by finks_dimensions.
Retained for historical data and backward compatibility.
DO NOT use for new competencies - use finks_dimensions instead.
This column will be dropped in a future migration after full data migration.';

-- =====================================================
-- STEP 6: Add Validation Constraints
-- =====================================================

-- Ensure all Fink's scores are 0-100
ALTER TABLE public.competency_catalog
  ADD CONSTRAINT check_competency_finks_range CHECK (
    (finks_dimensions->>'foundational_knowledge')::int BETWEEN 0 AND 100 AND
    (finks_dimensions->>'application')::int BETWEEN 0 AND 100 AND
    (finks_dimensions->>'integration')::int BETWEEN 0 AND 100 AND
    (finks_dimensions->>'human_dimension')::int BETWEEN 0 AND 100 AND
    (finks_dimensions->>'caring')::int BETWEEN 0 AND 100 AND
    (finks_dimensions->>'learning_how_to_learn')::int BETWEEN 0 AND 100
  );

ALTER TABLE public.learner_competencies
  ADD CONSTRAINT check_learner_finks_range CHECK (
    (finks_dimensions->>'foundational_knowledge')::int BETWEEN 0 AND 100 AND
    (finks_dimensions->>'application')::int BETWEEN 0 AND 100 AND
    (finks_dimensions->>'integration')::int BETWEEN 0 AND 100 AND
    (finks_dimensions->>'human_dimension')::int BETWEEN 0 AND 100 AND
    (finks_dimensions->>'caring')::int BETWEEN 0 AND 100 AND
    (finks_dimensions->>'learning_how_to_learn')::int BETWEEN 0 AND 100
  );

ALTER TABLE public.course_competency_mapping
  ADD CONSTRAINT check_course_finks_range CHECK (
    (finks_contribution->>'foundational_knowledge')::int BETWEEN 0 AND 100 AND
    (finks_contribution->>'application')::int BETWEEN 0 AND 100 AND
    (finks_contribution->>'integration')::int BETWEEN 0 AND 100 AND
    (finks_contribution->>'human_dimension')::int BETWEEN 0 AND 100 AND
    (finks_contribution->>'caring')::int BETWEEN 0 AND 100 AND
    (finks_contribution->>'learning_how_to_learn')::int BETWEEN 0 AND 100
  );

-- =====================================================
-- STEP 7: Create Helper Functions
-- =====================================================

-- Function to calculate overall Fink score (weighted average)
CREATE OR REPLACE FUNCTION public.calculate_finks_overall_score(
  p_finks_dimensions JSONB,
  p_weights JSONB DEFAULT '{"foundational_knowledge": 0.10, "application": 0.15, "integration": 0.15, "human_dimension": 0.25, "caring": 0.20, "learning_how_to_learn": 0.15}'::jsonb
)
RETURNS NUMERIC(5,2)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
IMMUTABLE
AS $$
DECLARE
  v_weighted_sum NUMERIC := 0;
BEGIN
  -- Calculate weighted average (human-centric dimensions weighted higher)
  v_weighted_sum :=
    (p_finks_dimensions->>'foundational_knowledge')::numeric * (p_weights->>'foundational_knowledge')::numeric +
    (p_finks_dimensions->>'application')::numeric * (p_weights->>'application')::numeric +
    (p_finks_dimensions->>'integration')::numeric * (p_weights->>'integration')::numeric +
    (p_finks_dimensions->>'human_dimension')::numeric * (p_weights->>'human_dimension')::numeric +
    (p_finks_dimensions->>'caring')::numeric * (p_weights->>'caring')::numeric +
    (p_finks_dimensions->>'learning_how_to_learn')::numeric * (p_weights->>'learning_how_to_learn')::numeric;

  RETURN ROUND(v_weighted_sum, 2);
END;
$$;

COMMENT ON FUNCTION public.calculate_finks_overall_score IS
'Calculates weighted average of Fink''s Taxonomy scores.
Default weights favor human-centric dimensions:
- foundational_knowledge: 10% (AI can do this)
- application: 15% (AI-augmented)
- integration: 15% (requires human context)
- human_dimension: 25% (CRITICAL - highest weight)
- caring: 20% (CRITICAL)
- learning_how_to_learn: 15% (CRITICAL)
Total human-centric: 60% of overall score.';

-- Function to get competencies strong in human-centric dimensions
CREATE OR REPLACE FUNCTION public.get_human_centric_competencies(
  p_institution_id UUID,
  p_min_score INTEGER DEFAULT 70
)
RETURNS TABLE (
  competency_id UUID,
  competency_code VARCHAR(50),
  competency_name VARCHAR(255),
  human_dimension_score INTEGER,
  caring_score INTEGER,
  learning_score INTEGER,
  overall_human_score NUMERIC(5,2)
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    cc.id,
    cc.competency_code,
    cc.competency_name,
    (cc.finks_dimensions->>'human_dimension')::integer,
    (cc.finks_dimensions->>'caring')::integer,
    (cc.finks_dimensions->>'learning_how_to_learn')::integer,
    ROUND((
      (cc.finks_dimensions->>'human_dimension')::numeric +
      (cc.finks_dimensions->>'caring')::numeric +
      (cc.finks_dimensions->>'learning_how_to_learn')::numeric
    ) / 3.0, 2) as overall_human_score
  FROM public.competency_catalog cc
  WHERE cc.institution_id = p_institution_id
    AND cc.is_active = true
    AND (
      (cc.finks_dimensions->>'human_dimension')::integer >= p_min_score OR
      (cc.finks_dimensions->>'caring')::integer >= p_min_score OR
      (cc.finks_dimensions->>'learning_how_to_learn')::integer >= p_min_score
    )
  ORDER BY overall_human_score DESC;
END;
$$;

COMMENT ON FUNCTION public.get_human_centric_competencies IS
'Returns competencies with strong human-centric dimensions (human_dimension, caring, learning_how_to_learn).
These are CRITICAL in AI era where machines handle cognitive tasks.
Default min_score: 70 (advanced level).
Use this to identify which competencies differentiate humans from AI.';

-- =====================================================
-- STEP 8: Update Table Comments
-- =====================================================

COMMENT ON TABLE public.competency_catalog IS
'Master competency/skill taxonomy.
MIGRATION (2026-02-02): Migrated from Bloom''s Taxonomy to Fink''s Taxonomy.
- bloom_taxonomy_level_deprecated: Historical data only (DO NOT USE)
- finks_dimensions: Current standard for competency definition
Fink''s Taxonomy aligns with AI-era education by measuring holistic development beyond cognitive skills.';

COMMENT ON TABLE public.learner_competencies IS
'Individual learner competency tracking.
Tracks learner progress across Fink''s 6 dimensions (finks_dimensions).
Measures holistic development: cognitive skills + human-centric capabilities (caring, values, self-awareness).';

COMMENT ON TABLE public.course_competency_mapping IS
'Links courses to competencies with contribution metrics.
finks_contribution shows how much each course develops each Fink''s dimension.
Enables curriculum mapping to holistic learning outcomes.';

-- =====================================================
-- VERIFICATION
-- =====================================================

DO $$
BEGIN
  -- Verify columns exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'competency_catalog'
    AND column_name = 'finks_dimensions'
  ) THEN
    RAISE EXCEPTION 'Migration failed: finks_dimensions column not created in competency_catalog';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'learner_competencies'
    AND column_name = 'finks_dimensions'
  ) THEN
    RAISE EXCEPTION 'Migration failed: finks_dimensions column not created in learner_competencies';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'course_competency_mapping'
    AND column_name = 'finks_contribution'
  ) THEN
    RAISE EXCEPTION 'Migration failed: finks_contribution column not created in course_competency_mapping';
  END IF;

  -- Verify bloom column renamed
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'competency_catalog'
    AND column_name = 'bloom_taxonomy_level_deprecated'
  ) THEN
    RAISE EXCEPTION 'Migration failed: bloom_taxonomy_level not renamed to bloom_taxonomy_level_deprecated';
  END IF;

  -- Verify indexes created
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'idx_competency_finks'
  ) THEN
    RAISE EXCEPTION 'Migration failed: idx_competency_finks index not created';
  END IF;

  RAISE NOTICE 'Migration successful: Fink''s Taxonomy integration complete';
  RAISE NOTICE '- 3 tables updated with finks_dimensions/finks_contribution columns';
  RAISE NOTICE '- 3 GIN indexes created for JSONB queries';
  RAISE NOTICE '- bloom_taxonomy_level renamed to bloom_taxonomy_level_deprecated';
  RAISE NOTICE '- 2 helper functions created';
  RAISE NOTICE 'Next steps: Update application code to use finks_dimensions';
END $$;

COMMIT;

-- =====================================================
-- ROLLBACK PLAN (if needed)
-- =====================================================
-- BEGIN;
-- ALTER TABLE competency_catalog RENAME COLUMN bloom_taxonomy_level_deprecated TO bloom_taxonomy_level;
-- ALTER TABLE competency_catalog DROP COLUMN finks_dimensions;
-- ALTER TABLE learner_competencies DROP COLUMN finks_dimensions;
-- ALTER TABLE course_competency_mapping DROP COLUMN finks_contribution;
-- DROP INDEX idx_competency_finks;
-- DROP INDEX idx_learner_finks;
-- DROP INDEX idx_course_finks;
-- DROP FUNCTION calculate_finks_overall_score;
-- DROP FUNCTION get_human_centric_competencies;
-- COMMIT;
