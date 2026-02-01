-- Migration: Create Billing COPQ (Cost of Poor Quality) Tables
-- Created: 2026-02-01
-- Purpose: Track hidden costs and quality issues in the billing module

-- Table: billing_copq_incidents
-- Tracks individual COPQ incidents with visible and hidden costs
CREATE TABLE IF NOT EXISTS billing_copq_incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  bill_id UUID REFERENCES billing_bills(id) ON DELETE SET NULL,
  learner_id UUID REFERENCES learners_profiles(id) ON DELETE SET NULL,
  incident_date DATE NOT NULL DEFAULT CURRENT_DATE,
  category VARCHAR(50) NOT NULL CHECK (category IN (
    'refund_processing',
    'late_payment_followup',
    'invoice_error',
    'payment_reconciliation',
    'discount_dispute',
    'collection_cost',
    'bad_debt',
    'reputation_impact',
    'process_rework',
    'other'
  )),
  description TEXT NOT NULL,
  visible_cost DECIMAL(12,2) DEFAULT 0, -- Direct financial impact
  hidden_cost_estimate DECIMAL(12,2) DEFAULT 0, -- Estimated hidden cost
  time_spent_hours DECIMAL(5,2),
  affected_stakeholders INTEGER DEFAULT 1,
  root_cause TEXT,
  preventive_action TEXT,
  reported_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  status VARCHAR(20) DEFAULT 'logged' CHECK (status IN ('logged', 'investigating', 'resolved', 'written_off')),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_billing_copq_institution ON billing_copq_incidents(institution_id);
CREATE INDEX IF NOT EXISTS idx_billing_copq_category ON billing_copq_incidents(category);
CREATE INDEX IF NOT EXISTS idx_billing_copq_date ON billing_copq_incidents(incident_date);
CREATE INDEX IF NOT EXISTS idx_billing_copq_status ON billing_copq_incidents(status);
CREATE INDEX IF NOT EXISTS idx_billing_copq_bill ON billing_copq_incidents(bill_id) WHERE bill_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_billing_copq_learner ON billing_copq_incidents(learner_id) WHERE learner_id IS NOT NULL;

-- Composite index for common query patterns
CREATE INDEX IF NOT EXISTS idx_billing_copq_institution_date ON billing_copq_incidents(institution_id, incident_date DESC);
CREATE INDEX IF NOT EXISTS idx_billing_copq_institution_category ON billing_copq_incidents(institution_id, category);

-- View for COPQ analytics by month and category
CREATE OR REPLACE VIEW billing_copq_summary AS
SELECT
  institution_id,
  DATE_TRUNC('month', incident_date) as month,
  category,
  COUNT(*) as incident_count,
  COALESCE(SUM(visible_cost), 0) as total_visible_cost,
  COALESCE(SUM(hidden_cost_estimate), 0) as total_hidden_cost,
  COALESCE(SUM(visible_cost), 0) + COALESCE(SUM(hidden_cost_estimate), 0) as total_copq,
  COALESCE(AVG(time_spent_hours), 0) as avg_time_spent
FROM billing_copq_incidents
GROUP BY institution_id, DATE_TRUNC('month', incident_date), category;

-- View for yearly COPQ totals by institution
CREATE OR REPLACE VIEW billing_copq_yearly_totals AS
SELECT
  institution_id,
  EXTRACT(YEAR FROM incident_date) as year,
  COUNT(*) as total_incidents,
  COUNT(*) FILTER (WHERE status = 'resolved') as resolved_incidents,
  COUNT(*) FILTER (WHERE status IN ('logged', 'investigating')) as open_incidents,
  COALESCE(SUM(visible_cost), 0) as total_visible_cost,
  COALESCE(SUM(hidden_cost_estimate), 0) as total_hidden_cost,
  COALESCE(SUM(visible_cost), 0) + COALESCE(SUM(hidden_cost_estimate), 0) as total_copq,
  COALESCE(AVG(time_spent_hours), 0) as avg_time_spent_hours,
  COALESCE(AVG(affected_stakeholders), 1) as avg_affected_stakeholders
FROM billing_copq_incidents
GROUP BY institution_id, EXTRACT(YEAR FROM incident_date);

-- Function to calculate COPQ dashboard metrics
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
  v_total_visible DECIMAL;
  v_total_hidden DECIMAL;
  v_total_incidents INTEGER;
  v_open_incidents INTEGER;
  v_resolved_incidents INTEGER;
  v_avg_resolution_days DECIMAL;
BEGIN
  v_year := COALESCE(p_year, EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER);

  -- Get totals
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
  INTO v_total_visible, v_total_hidden, v_total_incidents, v_open_incidents, v_resolved_incidents, v_avg_resolution_days
  FROM billing_copq_incidents
  WHERE institution_id = p_institution_id
    AND EXTRACT(YEAR FROM incident_date) = v_year;

  -- Build result JSON
  SELECT json_build_object(
    'total_copq_ytd', v_total_visible + v_total_hidden,
    'visible_vs_hidden', json_build_object(
      'visible', v_total_visible,
      'hidden', v_total_hidden
    ),
    'stats', json_build_object(
      'total_incidents', v_total_incidents,
      'open_incidents', v_open_incidents,
      'resolved_incidents', v_resolved_incidents,
      'avg_resolution_time_days', ROUND(v_avg_resolution_days, 1)
    ),
    'by_category', (
      SELECT json_object_agg(category, total_copq)
      FROM (
        SELECT
          category,
          COALESCE(SUM(visible_cost), 0) + COALESCE(SUM(hidden_cost_estimate), 0) as total_copq
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
          COALESCE(SUM(visible_cost), 0) + COALESCE(SUM(hidden_cost_estimate), 0) as copq,
          COALESCE(SUM(visible_cost), 0) as visible,
          COALESCE(SUM(hidden_cost_estimate), 0) as hidden
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

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_billing_copq_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_billing_copq_updated_at
  BEFORE UPDATE ON billing_copq_incidents
  FOR EACH ROW
  EXECUTE FUNCTION update_billing_copq_updated_at();

-- Enable RLS
ALTER TABLE billing_copq_incidents ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- View policy: Users can view COPQ incidents for their institution
CREATE POLICY "billing_copq_view_policy" ON billing_copq_incidents
  FOR SELECT
  USING (
    institution_id IN (
      SELECT institution_id FROM user_institution_access
      WHERE user_id = auth.uid()
    )
  );

-- Insert policy: Users with billing permissions can create incidents
CREATE POLICY "billing_copq_insert_policy" ON billing_copq_incidents
  FOR INSERT
  WITH CHECK (
    institution_id IN (
      SELECT institution_id FROM user_institution_access
      WHERE user_id = auth.uid()
    )
  );

-- Update policy: Users with billing permissions can update incidents
CREATE POLICY "billing_copq_update_policy" ON billing_copq_incidents
  FOR UPDATE
  USING (
    institution_id IN (
      SELECT institution_id FROM user_institution_access
      WHERE user_id = auth.uid()
    )
  );

-- Delete policy: Only for their institution
CREATE POLICY "billing_copq_delete_policy" ON billing_copq_incidents
  FOR DELETE
  USING (
    institution_id IN (
      SELECT institution_id FROM user_institution_access
      WHERE user_id = auth.uid()
    )
  );

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON billing_copq_incidents TO authenticated;
GRANT SELECT ON billing_copq_summary TO authenticated;
GRANT SELECT ON billing_copq_yearly_totals TO authenticated;
GRANT EXECUTE ON FUNCTION get_billing_copq_dashboard TO authenticated;

-- Add comments for documentation
COMMENT ON TABLE billing_copq_incidents IS 'Tracks Cost of Poor Quality incidents in the billing module';
COMMENT ON COLUMN billing_copq_incidents.visible_cost IS 'Direct financial impact that appears on financial statements';
COMMENT ON COLUMN billing_copq_incidents.hidden_cost_estimate IS 'Estimated hidden costs like staff time, reputation damage, opportunity cost';
COMMENT ON COLUMN billing_copq_incidents.time_spent_hours IS 'Staff hours spent addressing this incident';
COMMENT ON COLUMN billing_copq_incidents.affected_stakeholders IS 'Number of people affected (students, parents, staff)';
COMMENT ON VIEW billing_copq_summary IS 'Monthly aggregated COPQ metrics by category';
COMMENT ON VIEW billing_copq_yearly_totals IS 'Yearly COPQ totals by institution';
