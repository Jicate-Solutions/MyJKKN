-- Migration: Fix COPQ Financial Precision
-- Created: 2026-02-01
-- Purpose: Convert DECIMAL to BIGINT (paisa storage) to prevent floating-point precision loss
-- Critical: Financial calculations must be exact for audit compliance

-- PROBLEM:
-- DECIMAL(12,2) → JavaScript number → floating-point errors
-- Example: ₹100.10 + ₹200.20 = ₹300.2999999999 (WRONG!)
--
-- SOLUTION:
-- Store money in paisa (₹1 = 100 paisa) as BIGINT for exact integer arithmetic
-- Example: 10010 + 20020 = 30030 paisa = ₹300.30 (CORRECT!)

-- Step 1: Add new columns with BIGINT type (paisa)
ALTER TABLE billing_copq_incidents
  ADD COLUMN visible_cost_paisa BIGINT DEFAULT 0,
  ADD COLUMN hidden_cost_estimate_paisa BIGINT DEFAULT 0;

-- Step 2: Migrate existing data (convert rupees to paisa)
-- ₹100.50 → 10050 paisa
UPDATE billing_copq_incidents
SET
  visible_cost_paisa = ROUND(visible_cost * 100)::BIGINT,
  hidden_cost_estimate_paisa = ROUND(hidden_cost_estimate * 100)::BIGINT;

-- Step 3: Drop old DECIMAL columns
ALTER TABLE billing_copq_incidents
  DROP COLUMN visible_cost,
  DROP COLUMN hidden_cost_estimate;

-- Step 4: Rename new columns to original names
ALTER TABLE billing_copq_incidents
  RENAME COLUMN visible_cost_paisa TO visible_cost;

ALTER TABLE billing_copq_incidents
  RENAME COLUMN hidden_cost_estimate_paisa TO hidden_cost_estimate;

-- Step 5: Add constraints
ALTER TABLE billing_copq_incidents
  ALTER COLUMN visible_cost SET NOT NULL,
  ALTER COLUMN hidden_cost_estimate SET NOT NULL,
  ADD CONSTRAINT visible_cost_positive CHECK (visible_cost >= 0),
  ADD CONSTRAINT hidden_cost_positive CHECK (hidden_cost_estimate >= 0);

-- Step 6: Update comments for clarity
COMMENT ON COLUMN billing_copq_incidents.visible_cost IS 'Visible cost in paisa (₹1 = 100 paisa). Use integer arithmetic to prevent precision loss.';
COMMENT ON COLUMN billing_copq_incidents.hidden_cost_estimate IS 'Hidden cost in paisa (₹1 = 100 paisa). Use integer arithmetic to prevent precision loss.';

-- Step 7: Drop and recreate summary view with paisa calculations
DROP VIEW IF EXISTS billing_copq_summary CASCADE;
CREATE OR REPLACE VIEW billing_copq_summary AS
SELECT
  institution_id,
  DATE_TRUNC('month', incident_date) as month,
  category,
  COUNT(*) as incident_count,
  COALESCE(SUM(visible_cost), 0) as total_visible_paisa,
  COALESCE(SUM(hidden_cost_estimate), 0) as total_hidden_paisa,
  COALESCE(SUM(visible_cost), 0) + COALESCE(SUM(hidden_cost_estimate), 0) as total_copq_paisa,
  COALESCE(AVG(time_spent_hours), 0) as avg_time_spent
FROM billing_copq_incidents
GROUP BY institution_id, DATE_TRUNC('month', incident_date), category;

COMMENT ON VIEW billing_copq_summary IS 'Monthly aggregated COPQ metrics by category. All cost columns are in paisa.';

-- Step 8: Drop and recreate yearly totals view with paisa
DROP VIEW IF EXISTS billing_copq_yearly_totals CASCADE;
CREATE OR REPLACE VIEW billing_copq_yearly_totals AS
SELECT
  institution_id,
  EXTRACT(YEAR FROM incident_date) as year,
  COUNT(*) as total_incidents,
  COUNT(*) FILTER (WHERE status = 'resolved') as resolved_incidents,
  COUNT(*) FILTER (WHERE status IN ('logged', 'investigating')) as open_incidents,
  COALESCE(SUM(visible_cost), 0) as total_visible_paisa,
  COALESCE(SUM(hidden_cost_estimate), 0) as total_hidden_paisa,
  COALESCE(SUM(visible_cost), 0) + COALESCE(SUM(hidden_cost_estimate), 0) as total_copq_paisa,
  COALESCE(AVG(time_spent_hours), 0) as avg_time_spent_hours,
  COALESCE(AVG(affected_stakeholders), 1) as avg_affected_stakeholders
FROM billing_copq_incidents
GROUP BY institution_id, EXTRACT(YEAR FROM incident_date);

COMMENT ON VIEW billing_copq_yearly_totals IS 'Yearly COPQ totals by institution. All cost columns are in paisa.';

-- Step 9: Drop and recreate dashboard function with paisa calculations
DROP FUNCTION IF EXISTS get_billing_copq_dashboard(UUID, INTEGER);
CREATE OR REPLACE FUNCTION get_billing_copq_dashboard(
  p_institution_id UUID,
  p_year INTEGER DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_year INTEGER;
  v_result JSON;
  v_total_visible_paisa BIGINT;
  v_total_hidden_paisa BIGINT;
  v_total_incidents INTEGER;
  v_open_incidents INTEGER;
  v_resolved_incidents INTEGER;
  v_avg_resolution_days DECIMAL;
BEGIN
  v_year := COALESCE(p_year, EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER);

  -- Get totals (in paisa)
  SELECT
    COALESCE(SUM(visible_cost), 0),
    COALESCE(SUM(hidden_cost_estimate), 0),
    COUNT(*),
    COUNT(*) FILTER (WHERE status IN ('logged', 'investigating')),
    COUNT(*) FILTER (WHERE status = 'resolved'),
    COALESCE(AVG(
      CASE
        WHEN resolved_at IS NOT NULL
        THEN EXTRACT(EPOCH FROM (resolved_at - created_at)) / 86400
      END
    ), 0)
  INTO v_total_visible_paisa, v_total_hidden_paisa, v_total_incidents, v_open_incidents, v_resolved_incidents, v_avg_resolution_days
  FROM billing_copq_incidents
  WHERE institution_id = p_institution_id
    AND EXTRACT(YEAR FROM incident_date) = v_year;

  -- Build result JSON (all values in paisa)
  SELECT json_build_object(
    'total_copq_ytd_paisa', v_total_visible_paisa + v_total_hidden_paisa,
    'visible_vs_hidden', json_build_object(
      'visible_paisa', v_total_visible_paisa,
      'hidden_paisa', v_total_hidden_paisa
    ),
    'stats', json_build_object(
      'total_incidents', v_total_incidents,
      'open_incidents', v_open_incidents,
      'resolved_incidents', v_resolved_incidents,
      'avg_resolution_time_days', ROUND(v_avg_resolution_days, 1)
    ),
    'by_category', (
      SELECT json_object_agg(category, total_copq_paisa)
      FROM (
        SELECT
          category,
          COALESCE(SUM(visible_cost), 0) + COALESCE(SUM(hidden_cost_estimate), 0) as total_copq_paisa
        FROM billing_copq_incidents
        WHERE institution_id = p_institution_id
          AND EXTRACT(YEAR FROM incident_date) = v_year
        GROUP BY category
      ) cat_totals
    ),
    'trend', (
      SELECT COALESCE(json_agg(month_data ORDER BY month), '[]'::json)
      FROM (
        SELECT
          TO_CHAR(DATE_TRUNC('month', incident_date), 'YYYY-MM') as month,
          COALESCE(SUM(visible_cost), 0) + COALESCE(SUM(hidden_cost_estimate), 0) as copq_paisa,
          COALESCE(SUM(visible_cost), 0) as visible_paisa,
          COALESCE(SUM(hidden_cost_estimate), 0) as hidden_paisa
        FROM billing_copq_incidents
        WHERE institution_id = p_institution_id
          AND EXTRACT(YEAR FROM incident_date) = v_year
        GROUP BY DATE_TRUNC('month', incident_date)
      ) month_data
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION get_billing_copq_dashboard IS 'Returns COPQ dashboard metrics. All cost values are in paisa (₹1 = 100 paisa).';

-- Step 10: Re-grant permissions
GRANT SELECT ON billing_copq_summary TO authenticated;
GRANT SELECT ON billing_copq_yearly_totals TO authenticated;
GRANT EXECUTE ON FUNCTION get_billing_copq_dashboard TO authenticated;

-- Verification query (run manually to verify migration)
-- SELECT
--   id,
--   visible_cost as visible_cost_paisa,
--   hidden_cost_estimate as hidden_cost_paisa,
--   visible_cost / 100.0 as visible_cost_rupees,
--   hidden_cost_estimate / 100.0 as hidden_cost_rupees
-- FROM billing_copq_incidents
-- LIMIT 5;
