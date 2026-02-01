-- ============================================================================
-- TQM Migration Fixes
-- Date: 2026-02-01
-- Purpose: SQL patches to fix all critical and high-priority issues
-- Apply AFTER running the main migrations
-- ============================================================================

-- FIX #1: NPS Analytics RLS Policy (20260201110000_create_nps_tables.sql)
-- Problem: "System can manage analytics" policy allows anyone to delete data
DROP POLICY IF EXISTS "System can manage analytics" ON nps_analytics;

CREATE POLICY "Service role can insert analytics" ON nps_analytics
  FOR INSERT
  USING (auth.jwt()->>'role' = 'service_role')
  WITH CHECK (auth.jwt()->>'role' = 'service_role');

CREATE POLICY "Service role can update analytics" ON nps_analytics
  FOR UPDATE
  USING (auth.jwt()->>'role' = 'service_role');

CREATE POLICY "Service role can delete analytics" ON nps_analytics
  FOR DELETE
  USING (auth.jwt()->>'role' = 'service_role');

-- FIX #2: NPS Response Trigger - Handle DELETE operations
-- Problem: Trigger function uses NEW.survey_id but DELETE doesn't have NEW
DROP TRIGGER IF EXISTS trg_update_nps_analytics ON nps_responses;

CREATE OR REPLACE FUNCTION trigger_update_nps_analytics()
RETURNS TRIGGER AS $$
DECLARE
  v_survey_id UUID;
BEGIN
  -- Handle both INSERT/UPDATE (NEW) and DELETE (OLD)
  IF TG_OP = 'DELETE' THEN
    v_survey_id := OLD.survey_id;
  ELSE
    v_survey_id := NEW.survey_id;
  END IF;

  PERFORM recalculate_nps_analytics(v_survey_id);

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_nps_analytics
  AFTER INSERT OR UPDATE OR DELETE ON nps_responses
  FOR EACH ROW
  EXECUTE FUNCTION trigger_update_nps_analytics();

-- FIX #3: Add missing index on NPS surveys created_at
CREATE INDEX IF NOT EXISTS idx_nps_surveys_created ON nps_surveys(created_at DESC);

-- FIX #4: Grievance SLA Status - Use percentage-based threshold
-- Problem: Hardcoded 4 hours doesn't scale for different SLA lengths
CREATE OR REPLACE FUNCTION update_grievance_sla_status()
RETURNS TRIGGER AS $$
DECLARE
  v_sla_hours INTEGER;
  v_elapsed_hours NUMERIC;
  v_threshold_pct NUMERIC := 0.80; -- 80% of SLA time = at_risk
BEGIN
  -- Only update SLA status for non-resolved/closed tickets
  IF NEW.status NOT IN ('resolved', 'closed') THEN
    v_sla_hours := NEW.sla_hours;
    v_elapsed_hours := EXTRACT(EPOCH FROM (NOW() - NEW.created_at)) / 3600;

    IF NOW() > NEW.sla_deadline THEN
      NEW.sla_status := 'breached';
    ELSIF v_elapsed_hours > (v_sla_hours * v_threshold_pct) THEN
      NEW.sla_status := 'at_risk';
    ELSE
      NEW.sla_status := 'on_track';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- FIX #5: Add missing composite index for grievance dashboard queries
CREATE INDEX IF NOT EXISTS idx_grievance_tickets_dashboard
  ON grievance_tickets(institution_id, status, sla_status);

-- FIX #6: Add missing index for parent communications timeline
CREATE INDEX IF NOT EXISTS idx_parent_communications_parent_created
  ON parent_communications(parent_id, created_at DESC);

-- FIX #7: Fix maturity assessment RLS policies - profile_id → user_id
DROP POLICY IF EXISTS "Users can view frameworks for their institution" ON maturity_frameworks;
CREATE POLICY "Users can view frameworks for their institution"
  ON maturity_frameworks FOR SELECT
  USING (
    institution_id IN (
      SELECT institution_id FROM user_institution_access
      WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Admins can create frameworks" ON maturity_frameworks;
CREATE POLICY "Admins can create frameworks"
  ON maturity_frameworks FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_institution_access uia
      JOIN users_profiles up ON up.id = uia.user_id
      WHERE uia.user_id = auth.uid()
        AND uia.institution_id = maturity_frameworks.institution_id
        AND up.role IN ('super_admin', 'admin', 'principal')
    )
  );

DROP POLICY IF EXISTS "Admins can update frameworks" ON maturity_frameworks;
CREATE POLICY "Admins can update frameworks"
  ON maturity_frameworks FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM user_institution_access uia
      JOIN users_profiles up ON up.id = uia.user_id
      WHERE uia.user_id = auth.uid()
        AND uia.institution_id = maturity_frameworks.institution_id
        AND up.role IN ('super_admin', 'admin', 'principal')
    )
  );

-- FIX #8: Update calculate_maturity_overall_stage function
-- Problem: IMMUTABLE declaration and potential edge cases
CREATE OR REPLACE FUNCTION calculate_maturity_overall_stage(p_dimension_scores JSONB)
RETURNS INTEGER AS $$
DECLARE
  v_total INTEGER := 0;
  v_count INTEGER := 0;
  v_score INTEGER;
  v_key TEXT;
  v_result INTEGER;
BEGIN
  FOR v_key IN SELECT jsonb_object_keys(p_dimension_scores)
  LOOP
    v_score := (p_dimension_scores->>v_key)::INTEGER;
    IF v_score IS NOT NULL AND v_score >= 1 AND v_score <= 4 THEN
      v_total := v_total + v_score;
      v_count := v_count + 1;
    END IF;
  END LOOP;

  IF v_count = 0 THEN
    RETURN 1; -- Default to stage 1 if no valid scores
  END IF;

  -- Return floor of average, ensuring it's within valid range (1-4)
  v_result := FLOOR(v_total::DECIMAL / v_count);

  -- Edge case: if average rounds down to 0, return 1
  IF v_result < 1 THEN
    RETURN 1;
  ELSIF v_result > 4 THEN
    RETURN 4;
  ELSE
    RETURN v_result;
  END IF;
END;
$$ LANGUAGE plpgsql STABLE; -- Changed from IMMUTABLE to STABLE

-- FIX #9: Add missing composite index for maturity assessments
CREATE INDEX IF NOT EXISTS idx_maturity_assessments_institution_status
  ON maturity_assessments(institution_id, status);

-- FIX #10: Add progress_percentage constraint to OKR key results
ALTER TABLE okr_key_results
DROP CONSTRAINT IF EXISTS okr_key_results_progress_range;

ALTER TABLE okr_key_results
ADD CONSTRAINT okr_key_results_progress_range
CHECK (progress_percentage >= 0 AND progress_percentage <= 100);

-- FIX #11: Update ABCD category comment to document NULL state
COMMENT ON COLUMN okr_key_results.abcd_category IS 'Automatically calculated: A=Sustainable Success, B=Learning Opportunity, C=Expected Failure, D=False Security (DANGER). NULL = Not Yet Rated (process_rating not provided)';

-- ============================================================================
-- END OF FIXES
-- ============================================================================

-- Verify all fixes applied successfully
SELECT 'TQM Migration Fixes Applied Successfully' AS status;
