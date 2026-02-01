-- ============================================================================
-- Migration: Extend OKR Key Results with A/B/C/D Matrix Support
-- Created: 2026-02-01
-- Purpose: Add process rating and automatic A/B/C/D categorization to KRs
-- ============================================================================

-- Add process rating columns to okr_key_results
ALTER TABLE okr_key_results
ADD COLUMN IF NOT EXISTS process_rating INTEGER CHECK (process_rating >= 1 AND process_rating <= 5),
ADD COLUMN IF NOT EXISTS process_notes TEXT;

-- Add generated column for ABCD category
-- Logic:
-- A: Good Process (4-5) + Good Result (>=70%) - "Sustainable Success"
-- B: Good Process (4-5) + Poor Result (<70%) - "Learning Opportunity"
-- C: Poor Process (1-3) + Poor Result (<70%) - "Expected Failure"
-- D: Poor Process (1-3) + Good Result (>=70%) - "False Security" (DANGER!)
ALTER TABLE okr_key_results
ADD COLUMN IF NOT EXISTS abcd_category VARCHAR(1) GENERATED ALWAYS AS (
  CASE
    WHEN process_rating IS NULL THEN NULL
    WHEN progress_percentage >= 70 AND process_rating >= 4 THEN 'A'
    WHEN progress_percentage < 70 AND process_rating >= 4 THEN 'B'
    WHEN progress_percentage < 70 AND process_rating < 4 THEN 'C'
    WHEN progress_percentage >= 70 AND process_rating < 4 THEN 'D'
    ELSE NULL
  END
) STORED;

-- Create index for efficient ABCD filtering
CREATE INDEX IF NOT EXISTS idx_okr_key_results_abcd_category
ON okr_key_results(abcd_category)
WHERE abcd_category IS NOT NULL;

-- Create index for process rating queries
CREATE INDEX IF NOT EXISTS idx_okr_key_results_process_rating
ON okr_key_results(process_rating)
WHERE process_rating IS NOT NULL;

-- ============================================================================
-- ABCD Analysis View
-- Provides a comprehensive view for ABCD matrix visualization
-- ============================================================================
CREATE OR REPLACE VIEW okr_abcd_analysis AS
SELECT
  o.id as objective_id,
  o.title as objective_title,
  o.level as owner_type,
  o.owner_id,
  o.institution_id,
  o.department_id,
  o.status as objective_status,
  kr.id as key_result_id,
  kr.title as key_result_title,
  kr.progress_percentage as progress,
  kr.process_rating,
  kr.process_notes,
  kr.abcd_category,
  CASE
    WHEN kr.abcd_category = 'A' THEN 'Good Process + Good Result - Sustainable Success (Replicate)'
    WHEN kr.abcd_category = 'B' THEN 'Good Process + Poor Result - Learning Opportunity (Investigate)'
    WHEN kr.abcd_category = 'C' THEN 'Poor Process + Poor Result - Expected Failure (Improve Both)'
    WHEN kr.abcd_category = 'D' THEN 'Poor Process + Good Result - FALSE SECURITY (DANGER! Fix Process)'
    ELSE 'Not Yet Evaluated'
  END as analysis,
  CASE
    WHEN kr.abcd_category = 'D' THEN 1
    WHEN kr.abcd_category = 'C' THEN 2
    WHEN kr.abcd_category = 'B' THEN 3
    WHEN kr.abcd_category = 'A' THEN 4
    ELSE 5
  END as priority_order,
  kr.deadline,
  kr.created_at,
  kr.updated_at
FROM okr_objectives o
JOIN okr_key_results kr ON kr.objective_id = o.id
WHERE o.status = 'active';

-- Grant access to the view
GRANT SELECT ON okr_abcd_analysis TO authenticated;

-- ============================================================================
-- ABCD Distribution Function
-- Returns count of each category for dashboard charts
-- ============================================================================
CREATE OR REPLACE FUNCTION get_okr_abcd_distribution(
  p_institution_id UUID DEFAULT NULL,
  p_department_id UUID DEFAULT NULL,
  p_owner_id UUID DEFAULT NULL
)
RETURNS TABLE (
  category VARCHAR(1),
  count BIGINT,
  percentage NUMERIC(5,2)
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  total_count BIGINT;
BEGIN
  -- Get total count first
  SELECT COUNT(*)
  INTO total_count
  FROM okr_key_results kr
  JOIN okr_objectives o ON kr.objective_id = o.id
  WHERE o.status = 'active'
    AND kr.abcd_category IS NOT NULL
    AND (p_institution_id IS NULL OR o.institution_id = p_institution_id)
    AND (p_department_id IS NULL OR o.department_id = p_department_id)
    AND (p_owner_id IS NULL OR o.owner_id = p_owner_id);

  -- Return distribution
  RETURN QUERY
  SELECT
    kr.abcd_category,
    COUNT(*) as count,
    CASE
      WHEN total_count > 0 THEN
        ROUND((COUNT(*)::NUMERIC / total_count::NUMERIC) * 100, 2)
      ELSE 0
    END as percentage
  FROM okr_key_results kr
  JOIN okr_objectives o ON kr.objective_id = o.id
  WHERE o.status = 'active'
    AND kr.abcd_category IS NOT NULL
    AND (p_institution_id IS NULL OR o.institution_id = p_institution_id)
    AND (p_department_id IS NULL OR o.department_id = p_department_id)
    AND (p_owner_id IS NULL OR o.owner_id = p_owner_id)
  GROUP BY kr.abcd_category
  ORDER BY
    CASE kr.abcd_category
      WHEN 'D' THEN 1  -- D is highest priority (danger)
      WHEN 'C' THEN 2
      WHEN 'B' THEN 3
      WHEN 'A' THEN 4
    END;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_okr_abcd_distribution TO authenticated;

-- ============================================================================
-- D-Category Alert Function
-- Returns all "False Security" items that need immediate attention
-- ============================================================================
CREATE OR REPLACE FUNCTION get_okr_d_category_alerts(
  p_institution_id UUID DEFAULT NULL
)
RETURNS TABLE (
  key_result_id UUID,
  key_result_title TEXT,
  objective_id UUID,
  objective_title TEXT,
  owner_id UUID,
  progress NUMERIC,
  process_rating INTEGER,
  process_notes TEXT,
  deadline TIMESTAMPTZ,
  days_until_deadline INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    kr.id as key_result_id,
    kr.title as key_result_title,
    o.id as objective_id,
    o.title as objective_title,
    o.owner_id,
    kr.progress_percentage as progress,
    kr.process_rating,
    kr.process_notes,
    kr.deadline,
    EXTRACT(DAY FROM (kr.deadline - CURRENT_TIMESTAMP))::INTEGER as days_until_deadline
  FROM okr_key_results kr
  JOIN okr_objectives o ON kr.objective_id = o.id
  WHERE o.status = 'active'
    AND kr.abcd_category = 'D'
    AND (p_institution_id IS NULL OR o.institution_id = p_institution_id)
  ORDER BY kr.deadline ASC NULLS LAST;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_okr_d_category_alerts TO authenticated;

-- ============================================================================
-- Comments for documentation
-- ============================================================================
COMMENT ON COLUMN okr_key_results.process_rating IS 'Process quality rating from 1-5: 1=Poor, 2=Below Average, 3=Average, 4=Good, 5=Excellent';
COMMENT ON COLUMN okr_key_results.process_notes IS 'Optional notes explaining the process rating';
COMMENT ON COLUMN okr_key_results.abcd_category IS 'Automatically calculated: A=Sustainable Success, B=Learning Opportunity, C=Expected Failure, D=False Security (DANGER)';

COMMENT ON VIEW okr_abcd_analysis IS 'Comprehensive view for OKR A/B/C/D matrix analysis and visualization';
COMMENT ON FUNCTION get_okr_abcd_distribution IS 'Returns the distribution of ABCD categories for dashboard pie charts';
COMMENT ON FUNCTION get_okr_d_category_alerts IS 'Returns all D-category (False Security) items that need immediate attention';
