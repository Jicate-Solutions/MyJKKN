-- Migration: Create Process Excellence Tables
-- Module: process-excellence
-- Purpose: TIMWOOD waste tracking, value-add analysis, SLA monitoring, and A/B/C/D audit ratings
-- Created: 2026-02-01

-- =============================================
-- Table: process_definitions
-- Purpose: Define auditable processes with stages, SLAs, and value-add targets
-- =============================================
CREATE TABLE IF NOT EXISTS process_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(50) NOT NULL CHECK (category IN ('admission', 'billing', 'academic', 'staff', 'grievance')),
  stages JSONB NOT NULL DEFAULT '[]', -- [{name, expected_duration_hours, is_value_add, description, order}]
  target_cycle_time_hours INTEGER,
  target_value_add_ratio DECIMAL(5,2) CHECK (target_value_add_ratio >= 0 AND target_value_add_ratio <= 100),
  sla_hours INTEGER,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES users_profiles(id),
  updated_by UUID REFERENCES users_profiles(id),
  CONSTRAINT unique_process_name_per_institution UNIQUE (institution_id, name)
);

COMMENT ON TABLE process_definitions IS 'Defines auditable processes with stages, SLAs, and value-add targets for process excellence tracking';
COMMENT ON COLUMN process_definitions.stages IS 'JSON array of stage definitions: [{name, expected_duration_hours, is_value_add, description, order}]';
COMMENT ON COLUMN process_definitions.target_value_add_ratio IS 'Target percentage (0-100) of value-adding time vs total cycle time';
COMMENT ON COLUMN process_definitions.sla_hours IS 'Maximum allowed hours to complete the process';

-- =============================================
-- Table: process_instances
-- Purpose: Track individual process executions with stage history and metrics
-- =============================================
CREATE TABLE IF NOT EXISTS process_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  process_id UUID NOT NULL REFERENCES process_definitions(id) ON DELETE CASCADE,
  reference_type VARCHAR(50) NOT NULL, -- admission, billing_invoice, grievance_ticket, etc.
  reference_id UUID NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  current_stage VARCHAR(100),
  stage_history JSONB DEFAULT '[]', -- [{stage, started_at, completed_at, duration_hours, is_value_add}]
  total_cycle_hours DECIMAL(10,2),
  value_add_hours DECIMAL(10,2),
  value_add_ratio DECIMAL(5,2),
  sla_status VARCHAR(20) DEFAULT 'on_track' CHECK (sla_status IN ('on_track', 'at_risk', 'breached')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_reference UNIQUE (reference_type, reference_id)
);

COMMENT ON TABLE process_instances IS 'Tracks individual process executions with stage progression and calculated metrics';
COMMENT ON COLUMN process_instances.reference_type IS 'Type of entity being processed (admission, billing_invoice, grievance_ticket, etc.)';
COMMENT ON COLUMN process_instances.reference_id IS 'UUID of the entity being processed';
COMMENT ON COLUMN process_instances.stage_history IS 'JSON array tracking stage transitions: [{stage, started_at, completed_at, duration_hours, is_value_add}]';

-- =============================================
-- Table: waste_incidents
-- Purpose: Log TIMWOOD waste incidents linked to processes
-- =============================================
CREATE TABLE IF NOT EXISTS waste_incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  process_instance_id UUID REFERENCES process_instances(id) ON DELETE SET NULL,
  process_id UUID REFERENCES process_definitions(id) ON DELETE SET NULL,
  waste_category VARCHAR(5) NOT NULL CHECK (waste_category IN ('T', 'I', 'M', 'W', 'O1', 'O2', 'D', 'TU')),
  description TEXT NOT NULL,
  estimated_time_lost_hours DECIMAL(10,2),
  estimated_cost_impact DECIMAL(12,2),
  root_cause TEXT,
  corrective_action TEXT,
  reported_by UUID REFERENCES users_profiles(id),
  reported_at TIMESTAMPTZ DEFAULT NOW(),
  status VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open', 'investigating', 'resolved', 'dismissed')),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES users_profiles(id)
);

COMMENT ON TABLE waste_incidents IS 'TIMWOOD waste incidents: T=Transport, I=Inventory, M=Motion, W=Waiting, O1=Over-production, O2=Over-processing, D=Defects, TU=Talent Under-utilization';
COMMENT ON COLUMN waste_incidents.waste_category IS 'TIMWOOD category code: T, I, M, W, O1, O2, D, TU';
COMMENT ON COLUMN waste_incidents.estimated_time_lost_hours IS 'Estimated hours lost due to this waste incident';
COMMENT ON COLUMN waste_incidents.estimated_cost_impact IS 'Estimated financial impact in INR';

-- =============================================
-- Table: process_audits
-- Purpose: Periodic audit reports with A/B/C/D ratings
-- =============================================
CREATE TABLE IF NOT EXISTS process_audits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  process_id UUID NOT NULL REFERENCES process_definitions(id) ON DELETE CASCADE,
  audit_period_start DATE NOT NULL,
  audit_period_end DATE NOT NULL,
  auditor_id UUID REFERENCES users_profiles(id),
  total_instances INTEGER DEFAULT 0,
  avg_cycle_hours DECIMAL(10,2),
  avg_value_add_ratio DECIMAL(5,2),
  sla_compliance_rate DECIMAL(5,2),
  waste_breakdown JSONB DEFAULT '{}', -- {T: 5, I: 2, M: 10, ...}
  findings TEXT,
  recommendations TEXT,
  abcd_rating VARCHAR(1) CHECK (abcd_rating IN ('A', 'B', 'C', 'D')),
  status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'in_review', 'finalized')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  finalized_at TIMESTAMPTZ,
  CONSTRAINT valid_audit_period CHECK (audit_period_end >= audit_period_start)
);

COMMENT ON TABLE process_audits IS 'Periodic audit reports with metrics summary and A/B/C/D performance ratings';
COMMENT ON COLUMN process_audits.abcd_rating IS 'Performance rating: A=Excellent, B=Good, C=Needs Improvement, D=Critical';
COMMENT ON COLUMN process_audits.waste_breakdown IS 'JSON object with waste counts by category: {T: 5, I: 2, M: 10, ...}';

-- =============================================
-- Indexes for Performance
-- =============================================
CREATE INDEX IF NOT EXISTS idx_process_definitions_institution ON process_definitions(institution_id);
CREATE INDEX IF NOT EXISTS idx_process_definitions_category ON process_definitions(category);
CREATE INDEX IF NOT EXISTS idx_process_definitions_active ON process_definitions(is_active) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_process_instances_process ON process_instances(process_id);
CREATE INDEX IF NOT EXISTS idx_process_instances_ref ON process_instances(reference_type, reference_id);
CREATE INDEX IF NOT EXISTS idx_process_instances_sla_status ON process_instances(sla_status);
CREATE INDEX IF NOT EXISTS idx_process_instances_started ON process_instances(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_process_instances_completed ON process_instances(completed_at) WHERE completed_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_waste_incidents_institution ON waste_incidents(institution_id);
CREATE INDEX IF NOT EXISTS idx_waste_incidents_process ON waste_incidents(process_id);
CREATE INDEX IF NOT EXISTS idx_waste_incidents_instance ON waste_incidents(process_instance_id);
CREATE INDEX IF NOT EXISTS idx_waste_incidents_category ON waste_incidents(waste_category);
CREATE INDEX IF NOT EXISTS idx_waste_incidents_status ON waste_incidents(status);
CREATE INDEX IF NOT EXISTS idx_waste_incidents_reported ON waste_incidents(reported_at DESC);

CREATE INDEX IF NOT EXISTS idx_process_audits_institution ON process_audits(institution_id);
CREATE INDEX IF NOT EXISTS idx_process_audits_process ON process_audits(process_id);
CREATE INDEX IF NOT EXISTS idx_process_audits_period ON process_audits(audit_period_start, audit_period_end);
CREATE INDEX IF NOT EXISTS idx_process_audits_rating ON process_audits(abcd_rating);
CREATE INDEX IF NOT EXISTS idx_process_audits_status ON process_audits(status);

-- =============================================
-- Row Level Security (RLS)
-- =============================================
ALTER TABLE process_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE process_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE waste_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE process_audits ENABLE ROW LEVEL SECURITY;

-- Process Definitions Policies
CREATE POLICY "Users can view process definitions for their institutions"
  ON process_definitions FOR SELECT
  USING (
    institution_id IN (
      SELECT institution_id FROM user_institution_access
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

CREATE POLICY "Admins can manage process definitions"
  ON process_definitions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_institution_access uia
      JOIN users_profiles up ON up.id = uia.user_id
      WHERE uia.user_id = auth.uid()
        AND uia.institution_id = process_definitions.institution_id
        AND uia.is_active = true
        AND up.role IN ('super_admin', 'admin', 'institution_admin')
    )
  );

-- Process Instances Policies
CREATE POLICY "Users can view process instances for their institutions"
  ON process_instances FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM process_definitions pd
      JOIN user_institution_access uia ON uia.institution_id = pd.institution_id
      WHERE pd.id = process_instances.process_id
        AND uia.user_id = auth.uid()
        AND uia.is_active = true
    )
  );

CREATE POLICY "Users can create process instances for their institutions"
  ON process_instances FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM process_definitions pd
      JOIN user_institution_access uia ON uia.institution_id = pd.institution_id
      WHERE pd.id = process_instances.process_id
        AND uia.user_id = auth.uid()
        AND uia.is_active = true
    )
  );

CREATE POLICY "Users can update process instances for their institutions"
  ON process_instances FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM process_definitions pd
      JOIN user_institution_access uia ON uia.institution_id = pd.institution_id
      WHERE pd.id = process_instances.process_id
        AND uia.user_id = auth.uid()
        AND uia.is_active = true
    )
  );

-- Waste Incidents Policies
CREATE POLICY "Users can view waste incidents for their institutions"
  ON waste_incidents FOR SELECT
  USING (
    institution_id IN (
      SELECT institution_id FROM user_institution_access
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

CREATE POLICY "Users can report waste incidents for their institutions"
  ON waste_incidents FOR INSERT
  WITH CHECK (
    institution_id IN (
      SELECT institution_id FROM user_institution_access
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

CREATE POLICY "Users can update waste incidents for their institutions"
  ON waste_incidents FOR UPDATE
  USING (
    institution_id IN (
      SELECT institution_id FROM user_institution_access
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

-- Process Audits Policies
CREATE POLICY "Users can view audits for their institutions"
  ON process_audits FOR SELECT
  USING (
    institution_id IN (
      SELECT institution_id FROM user_institution_access
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

CREATE POLICY "Admins can manage audits"
  ON process_audits FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_institution_access uia
      JOIN users_profiles up ON up.id = uia.user_id
      WHERE uia.user_id = auth.uid()
        AND uia.institution_id = process_audits.institution_id
        AND uia.is_active = true
        AND up.role IN ('super_admin', 'admin', 'institution_admin')
    )
  );

-- =============================================
-- Functions
-- =============================================

-- Function to update SLA status for in-progress instances
CREATE OR REPLACE FUNCTION update_process_instance_sla_status()
RETURNS TRIGGER AS $$
DECLARE
  v_process_sla_hours INTEGER;
  v_elapsed_hours DECIMAL(10,2);
BEGIN
  -- Get SLA hours from process definition
  SELECT sla_hours INTO v_process_sla_hours
  FROM process_definitions
  WHERE id = NEW.process_id;

  -- Only update if process has SLA defined and instance is not completed
  IF v_process_sla_hours IS NOT NULL AND NEW.completed_at IS NULL THEN
    v_elapsed_hours := EXTRACT(EPOCH FROM (NOW() - NEW.started_at)) / 3600;

    IF v_elapsed_hours > v_process_sla_hours THEN
      NEW.sla_status := 'breached';
    ELSIF v_elapsed_hours > (v_process_sla_hours * 0.8) THEN
      NEW.sla_status := 'at_risk';
    ELSE
      NEW.sla_status := 'on_track';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for SLA status updates
DROP TRIGGER IF EXISTS trigger_update_sla_status ON process_instances;
CREATE TRIGGER trigger_update_sla_status
  BEFORE INSERT OR UPDATE ON process_instances
  FOR EACH ROW
  EXECUTE FUNCTION update_process_instance_sla_status();

-- Function to calculate and update process instance metrics on completion
CREATE OR REPLACE FUNCTION calculate_process_instance_metrics()
RETURNS TRIGGER AS $$
DECLARE
  v_stage JSONB;
  v_total_hours DECIMAL(10,2) := 0;
  v_value_add_hours DECIMAL(10,2) := 0;
  v_process_stages JSONB;
  v_value_add_stage_names TEXT[];
BEGIN
  -- Only calculate on completion
  IF NEW.completed_at IS NOT NULL AND OLD.completed_at IS NULL THEN
    -- Get value-add stages from process definition
    SELECT stages INTO v_process_stages
    FROM process_definitions
    WHERE id = NEW.process_id;

    -- Build array of value-add stage names
    SELECT ARRAY_AGG(s->>'name')
    INTO v_value_add_stage_names
    FROM jsonb_array_elements(v_process_stages) s
    WHERE (s->>'is_value_add')::boolean = true;

    -- Calculate metrics from stage history
    FOR v_stage IN SELECT * FROM jsonb_array_elements(NEW.stage_history)
    LOOP
      IF (v_stage->>'duration_hours') IS NOT NULL THEN
        v_total_hours := v_total_hours + (v_stage->>'duration_hours')::DECIMAL;

        -- Check if stage is value-add
        IF (v_stage->>'stage') = ANY(v_value_add_stage_names) OR (v_stage->>'is_value_add')::boolean = true THEN
          v_value_add_hours := v_value_add_hours + (v_stage->>'duration_hours')::DECIMAL;
        END IF;
      END IF;
    END LOOP;

    NEW.total_cycle_hours := v_total_hours;
    NEW.value_add_hours := v_value_add_hours;

    IF v_total_hours > 0 THEN
      NEW.value_add_ratio := (v_value_add_hours / v_total_hours) * 100;
    ELSE
      NEW.value_add_ratio := 0;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for metrics calculation
DROP TRIGGER IF EXISTS trigger_calculate_metrics ON process_instances;
CREATE TRIGGER trigger_calculate_metrics
  BEFORE UPDATE ON process_instances
  FOR EACH ROW
  EXECUTE FUNCTION calculate_process_instance_metrics();

-- Function to generate audit report metrics
CREATE OR REPLACE FUNCTION generate_process_audit_metrics(
  p_institution_id UUID,
  p_process_id UUID,
  p_period_start DATE,
  p_period_end DATE
)
RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
  v_total_instances INTEGER;
  v_avg_cycle_hours DECIMAL(10,2);
  v_avg_value_add_ratio DECIMAL(5,2);
  v_sla_compliance DECIMAL(5,2);
  v_waste_breakdown JSONB;
BEGIN
  -- Calculate instance metrics
  SELECT
    COUNT(*),
    COALESCE(AVG(total_cycle_hours), 0),
    COALESCE(AVG(value_add_ratio), 0),
    COALESCE(
      (COUNT(*) FILTER (WHERE sla_status != 'breached')::DECIMAL / NULLIF(COUNT(*), 0) * 100),
      100
    )
  INTO v_total_instances, v_avg_cycle_hours, v_avg_value_add_ratio, v_sla_compliance
  FROM process_instances pi
  JOIN process_definitions pd ON pd.id = pi.process_id
  WHERE pd.institution_id = p_institution_id
    AND pi.process_id = p_process_id
    AND pi.completed_at IS NOT NULL
    AND pi.started_at >= p_period_start
    AND pi.started_at < (p_period_end + INTERVAL '1 day');

  -- Calculate waste breakdown
  SELECT jsonb_object_agg(
    waste_category,
    count
  ) INTO v_waste_breakdown
  FROM (
    SELECT waste_category, COUNT(*) as count
    FROM waste_incidents wi
    WHERE wi.institution_id = p_institution_id
      AND wi.process_id = p_process_id
      AND wi.reported_at >= p_period_start
      AND wi.reported_at < (p_period_end + INTERVAL '1 day')
    GROUP BY waste_category
  ) sub;

  v_result := jsonb_build_object(
    'total_instances', v_total_instances,
    'avg_cycle_hours', ROUND(v_avg_cycle_hours, 2),
    'avg_value_add_ratio', ROUND(v_avg_value_add_ratio, 2),
    'sla_compliance_rate', ROUND(v_sla_compliance, 2),
    'waste_breakdown', COALESCE(v_waste_breakdown, '{}'::jsonb)
  );

  RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- Updated_at Trigger
-- =============================================
CREATE OR REPLACE FUNCTION update_process_definitions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_process_definitions_updated_at ON process_definitions;
CREATE TRIGGER trigger_update_process_definitions_updated_at
  BEFORE UPDATE ON process_definitions
  FOR EACH ROW
  EXECUTE FUNCTION update_process_definitions_updated_at();
