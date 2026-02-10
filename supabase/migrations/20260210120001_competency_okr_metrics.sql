-- ============================================================================
-- Migration: Competency OKR Metrics - Wire Competency Module to OKR Metric Engine
-- Created: 2026-02-10
-- Purpose: Create database functions that calculate competency metrics and
--          register them in the OKR metric registry so Key Results can
--          auto-track competency data.
--
-- Functions created (all use standardized 4-param signature):
--   1. get_competency_coverage_pct     - Program competency coverage %
--   2. get_avg_learner_competency_score - Average learner proficiency (1-5 scale)
--   3. get_total_competencies_count     - Total active competencies
--   4. get_learners_assessed_pct        - % of learners with assessments
--   5. get_finks_aggregate_score        - Fink's Taxonomy aggregate score
-- ============================================================================

-- ============================================================================
-- STEP 1: Create Competency Metric Functions
-- All functions use standardized signature:
--   (p_profile_id UUID, p_institution_id UUID, p_start_date TIMESTAMPTZ, p_end_date TIMESTAMPTZ)
-- This matches the OKR Metric Engine's executeDbFunction() calling convention.
-- ============================================================================

-- 1. Competency Coverage % for an institution's programs
-- Measures: What % of program-mapped competencies have corresponding course mappings
CREATE OR REPLACE FUNCTION get_competency_coverage_pct(
  p_profile_id UUID,
  p_institution_id UUID,
  p_start_date TIMESTAMPTZ,
  p_end_date TIMESTAMPTZ
) RETURNS NUMERIC AS $$
  SELECT COALESCE(
    (SELECT ROUND(
      (COUNT(DISTINCT ccm.competency_id)::NUMERIC /
       NULLIF(COUNT(DISTINCT cpm.competency_id), 0)) * 100, 1
    )
    FROM competency_program_mapping cpm
    LEFT JOIN course_competency_mapping ccm ON ccm.competency_id = cpm.competency_id
    WHERE cpm.program_id IN (
      SELECT DISTINCT p.id FROM programs p
      WHERE p.institution_id = p_institution_id
    )), 0);
$$ LANGUAGE sql STABLE;

-- 2. Average learner competency score for institution
-- Converts proficiency_level enum to numeric: novice=1, beginner=2, intermediate=3, advanced=4, expert=5
CREATE OR REPLACE FUNCTION get_avg_learner_competency_score(
  p_profile_id UUID,
  p_institution_id UUID,
  p_start_date TIMESTAMPTZ,
  p_end_date TIMESTAMPTZ
) RETURNS NUMERIC AS $$
  SELECT COALESCE(
    (SELECT ROUND(AVG(
      CASE lc.current_level::text
        WHEN 'novice' THEN 1.0
        WHEN 'beginner' THEN 2.0
        WHEN 'intermediate' THEN 3.0
        WHEN 'advanced' THEN 4.0
        WHEN 'expert' THEN 5.0
        ELSE 0.0
      END
    ), 1)
    FROM learner_competencies lc
    JOIN learners_profiles lp ON lp.id = lc.learner_id
    WHERE lp.institution_id = p_institution_id
    AND lc.current_level IS NOT NULL), 0);
$$ LANGUAGE sql STABLE;

-- 3. Total competencies defined for institution
CREATE OR REPLACE FUNCTION get_total_competencies_count(
  p_profile_id UUID,
  p_institution_id UUID,
  p_start_date TIMESTAMPTZ,
  p_end_date TIMESTAMPTZ
) RETURNS NUMERIC AS $$
  SELECT COUNT(*)::NUMERIC
  FROM competency_catalog
  WHERE institution_id = p_institution_id AND is_active = true;
$$ LANGUAGE sql STABLE;

-- 4. Learners with competency assessments %
-- Measures: What % of active learners have at least one competency assessment
CREATE OR REPLACE FUNCTION get_learners_assessed_pct(
  p_profile_id UUID,
  p_institution_id UUID,
  p_start_date TIMESTAMPTZ,
  p_end_date TIMESTAMPTZ
) RETURNS NUMERIC AS $$
  SELECT COALESCE(
    (SELECT ROUND(
      (COUNT(DISTINCT lc.learner_id)::NUMERIC /
       NULLIF((SELECT COUNT(*) FROM learners_profiles
               WHERE institution_id = p_institution_id
               AND lifecycle_status::text = 'active'), 0)
      ) * 100, 1)
    FROM learner_competencies lc
    JOIN learners_profiles lp ON lp.id = lc.learner_id
    WHERE lp.institution_id = p_institution_id), 0);
$$ LANGUAGE sql STABLE;

-- 5. Fink's Taxonomy average dimension score
-- Averages all 6 Fink dimensions across active competencies
-- Handles inconsistent key naming: 'learning_to_learn' vs 'learning_how_to_learn'
CREATE OR REPLACE FUNCTION get_finks_aggregate_score(
  p_profile_id UUID,
  p_institution_id UUID,
  p_start_date TIMESTAMPTZ,
  p_end_date TIMESTAMPTZ
) RETURNS NUMERIC AS $$
  SELECT COALESCE(
    (SELECT ROUND(AVG(
      (COALESCE((cc.finks_dimensions->>'foundational_knowledge')::numeric, 0) +
       COALESCE((cc.finks_dimensions->>'application')::numeric, 0) +
       COALESCE((cc.finks_dimensions->>'integration')::numeric, 0) +
       COALESCE((cc.finks_dimensions->>'human_dimension')::numeric, 0) +
       COALESCE((cc.finks_dimensions->>'caring')::numeric, 0) +
       COALESCE(
         COALESCE((cc.finks_dimensions->>'learning_to_learn')::numeric,
                  (cc.finks_dimensions->>'learning_how_to_learn')::numeric),
         0)
      ) / 6.0
    ), 1)
    FROM competency_catalog cc
    WHERE cc.institution_id = p_institution_id
    AND cc.is_active = true
    AND cc.finks_dimensions IS NOT NULL), 0);
$$ LANGUAGE sql STABLE;

-- ============================================================================
-- STEP 2: Register Competency Metrics in OKR Metric Registry
-- ============================================================================

INSERT INTO public.okr_metric_registry (
    metric_key, display_name, description, module, category,
    applicable_roles, applicable_scopes, requires_context,
    source_type, source_config,
    value_type, unit, precision, min_value, max_value,
    default_baseline, default_target,
    refresh_frequency, cache_duration_seconds,
    icon, color, display_format, chart_type,
    is_active, is_system, tags
) VALUES
(
    'competency.coverage_pct',
    'Program Competency Coverage',
    'Percentage of program-mapped competencies that have course mappings. Shows how well course offerings align with defined competency goals.',
    'competency', 'academic',
    ARRAY['super_admin', 'admin', 'manager'],
    ARRAY['institution', 'department']::metric_scope[],
    '{"institution_id": true}'::jsonb,
    'db_function', '{"function_name": "get_competency_coverage_pct"}'::jsonb,
    'percentage', '%', 1, 0, 100, 0, 100,
    'daily', 3600,
    'target', '#4f46e5', '{value}%', 'gauge',
    true, true,
    ARRAY['competency', 'coverage', 'academic', 'program']
),
(
    'competency.avg_learner_score',
    'Average Learner Competency Score',
    'Average proficiency level across all assessed learners (1=Novice, 2=Beginner, 3=Intermediate, 4=Advanced, 5=Expert).',
    'competency', 'academic',
    ARRAY['super_admin', 'admin', 'manager'],
    ARRAY['institution', 'department']::metric_scope[],
    '{"institution_id": true}'::jsonb,
    'db_function', '{"function_name": "get_avg_learner_competency_score"}'::jsonb,
    'score', '/5', 1, 0, 5, 0, 4,
    'daily', 3600,
    'bar-chart-2', '#059669', '{value}/5', 'bar',
    true, true,
    ARRAY['competency', 'learner', 'score', 'academic']
),
(
    'competency.total_count',
    'Total Active Competencies',
    'Total number of active competencies defined in the competency catalog for the institution.',
    'competency', 'academic',
    ARRAY['super_admin', 'admin', 'manager'],
    ARRAY['institution', 'department']::metric_scope[],
    '{"institution_id": true}'::jsonb,
    'db_function', '{"function_name": "get_total_competencies_count"}'::jsonb,
    'count', '', 0, 0, NULL, 0, NULL,
    'daily', 3600,
    'layers', '#7c3aed', '{value}', 'sparkline',
    true, true,
    ARRAY['competency', 'count', 'catalog']
),
(
    'competency.learners_assessed_pct',
    'Learners with Competency Assessments',
    'Percentage of active learners who have at least one competency assessment recorded.',
    'competency', 'academic',
    ARRAY['super_admin', 'admin', 'manager'],
    ARRAY['institution', 'department']::metric_scope[],
    '{"institution_id": true}'::jsonb,
    'db_function', '{"function_name": "get_learners_assessed_pct"}'::jsonb,
    'percentage', '%', 1, 0, 100, 0, 100,
    'daily', 3600,
    'user-check', '#0891b2', '{value}%', 'gauge',
    true, true,
    ARRAY['competency', 'assessment', 'learner', 'coverage']
),
(
    'competency.finks_aggregate',
    'Fink Taxonomy Aggregate Score',
    'Average score across all six Fink Taxonomy dimensions (Foundational Knowledge, Application, Integration, Human Dimension, Caring, Learning to Learn) for active competencies.',
    'competency', 'academic',
    ARRAY['super_admin', 'admin', 'manager'],
    ARRAY['institution', 'department']::metric_scope[],
    '{"institution_id": true}'::jsonb,
    'db_function', '{"function_name": "get_finks_aggregate_score"}'::jsonb,
    'score', 'pts', 1, 0, 100, 0, NULL,
    'daily', 3600,
    'hexagon', '#dc2626', '{value}', 'bar',
    true, true,
    ARRAY['competency', 'finks', 'taxonomy', 'aggregate']
)
ON CONFLICT (metric_key) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    description = EXCLUDED.description,
    source_config = EXCLUDED.source_config,
    updated_at = NOW();
