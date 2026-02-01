-- Migration: Fix Race Conditions with Atomic Operations
-- Date: 2026-02-01
-- Description: Add version columns for optimistic locking and create atomic database functions

-- ============================================================================
-- STEP 1: Add version columns to all affected tables
-- ============================================================================

-- Grievance tickets
ALTER TABLE grievance_tickets
ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 0 NOT NULL;

-- Process instances
ALTER TABLE process_instances
ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 0 NOT NULL;

-- Billing COPQ incidents
ALTER TABLE billing_copq_incidents
ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 0 NOT NULL;

-- Maturity assessments
ALTER TABLE maturity_assessments
ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 0 NOT NULL;

-- Maturity progress items
ALTER TABLE maturity_progress
ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 0 NOT NULL;

-- ============================================================================
-- STEP 2: Create triggers to auto-increment version on updates
-- ============================================================================

-- Function to increment version
CREATE OR REPLACE FUNCTION increment_version()
RETURNS TRIGGER AS $$
BEGIN
  NEW.version = OLD.version + 1;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to grievance_tickets
DROP TRIGGER IF EXISTS increment_grievance_tickets_version ON grievance_tickets;
CREATE TRIGGER increment_grievance_tickets_version
  BEFORE UPDATE ON grievance_tickets
  FOR EACH ROW
  EXECUTE FUNCTION increment_version();

-- Apply to process_instances
DROP TRIGGER IF EXISTS increment_process_instances_version ON process_instances;
CREATE TRIGGER increment_process_instances_version
  BEFORE UPDATE ON process_instances
  FOR EACH ROW
  EXECUTE FUNCTION increment_version();

-- Apply to billing_copq_incidents
DROP TRIGGER IF EXISTS increment_copq_incidents_version ON billing_copq_incidents;
CREATE TRIGGER increment_copq_incidents_version
  BEFORE UPDATE ON billing_copq_incidents
  FOR EACH ROW
  EXECUTE FUNCTION increment_version();

-- Apply to maturity_assessments
DROP TRIGGER IF EXISTS increment_maturity_assessments_version ON maturity_assessments;
CREATE TRIGGER increment_maturity_assessments_version
  BEFORE UPDATE ON maturity_assessments
  FOR EACH ROW
  EXECUTE FUNCTION increment_version();

-- Apply to maturity_progress
DROP TRIGGER IF EXISTS increment_maturity_progress_version ON maturity_progress;
CREATE TRIGGER increment_maturity_progress_version
  BEFORE UPDATE ON maturity_progress
  FOR EACH ROW
  EXECUTE FUNCTION increment_version();

-- ============================================================================
-- STEP 3: Atomic Functions for Grievance SLA Updates
-- ============================================================================

CREATE OR REPLACE FUNCTION update_grievance_sla_atomic(
  p_ticket_id UUID,
  p_status TEXT,
  p_resolution TEXT DEFAULT NULL,
  p_resolved_by UUID DEFAULT NULL,
  p_expected_version INTEGER DEFAULT NULL
) RETURNS grievance_tickets AS $$
DECLARE
  v_ticket grievance_tickets;
  v_sla_met BOOLEAN;
  v_created_at TIMESTAMPTZ;
  v_sla_hours INTEGER;
BEGIN
  -- Lock the row for update
  SELECT * INTO v_ticket
  FROM grievance_tickets
  WHERE id = p_ticket_id
  FOR UPDATE;

  -- Check if ticket exists
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket not found: %', p_ticket_id;
  END IF;

  -- Optimistic locking check
  IF p_expected_version IS NOT NULL AND v_ticket.version != p_expected_version THEN
    RAISE EXCEPTION 'Concurrent update detected. Expected version %, got %. Please retry.',
      p_expected_version, v_ticket.version;
  END IF;

  -- Get necessary data for SLA calculation
  v_created_at := v_ticket.created_at;
  v_sla_hours := v_ticket.sla_hours;

  -- Calculate SLA compliance if resolving
  IF p_status = 'resolved' THEN
    -- Calculate hours between created_at and now
    v_sla_met := (EXTRACT(EPOCH FROM (NOW() - v_created_at)) / 3600) <= v_sla_hours;

    -- Update ticket with resolution
    UPDATE grievance_tickets
    SET
      status = p_status::grievance_status,
      resolution = p_resolution,
      resolved_at = NOW(),
      resolved_by = p_resolved_by,
      sla_status = CASE
        WHEN v_sla_met THEN 'met'::sla_status
        ELSE 'breached'::sla_status
      END
    WHERE id = p_ticket_id
    RETURNING * INTO v_ticket;
  ELSE
    -- Regular status update
    UPDATE grievance_tickets
    SET status = p_status::grievance_status
    WHERE id = p_ticket_id
    RETURNING * INTO v_ticket;
  END IF;

  RETURN v_ticket;
END;
$$ LANGUAGE plpgsql;

-- Function to assign ticket atomically
CREATE OR REPLACE FUNCTION assign_grievance_ticket_atomic(
  p_ticket_id UUID,
  p_assignee_id UUID,
  p_department_id UUID DEFAULT NULL,
  p_expected_version INTEGER DEFAULT NULL
) RETURNS grievance_tickets AS $$
DECLARE
  v_ticket grievance_tickets;
BEGIN
  -- Lock and verify version
  SELECT * INTO v_ticket
  FROM grievance_tickets
  WHERE id = p_ticket_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket not found: %', p_ticket_id;
  END IF;

  IF p_expected_version IS NOT NULL AND v_ticket.version != p_expected_version THEN
    RAISE EXCEPTION 'Concurrent update detected. Please retry.';
  END IF;

  -- Update assignment
  UPDATE grievance_tickets
  SET
    assigned_to = p_assignee_id,
    assigned_at = NOW(),
    department_id = p_department_id,
    status = 'in_progress'::grievance_status
  WHERE id = p_ticket_id
  RETURNING * INTO v_ticket;

  RETURN v_ticket;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- STEP 4: Atomic Functions for Process Advancement
-- ============================================================================

CREATE OR REPLACE FUNCTION advance_process_stage_atomic(
  p_instance_id UUID,
  p_new_stage TEXT,
  p_is_value_add BOOLEAN DEFAULT NULL,
  p_expected_version INTEGER DEFAULT NULL
) RETURNS process_instances AS $$
DECLARE
  v_instance process_instances;
  v_history JSONB;
  v_last_stage JSONB;
  v_now TIMESTAMPTZ := NOW();
  v_duration_hours NUMERIC;
BEGIN
  -- Lock the row
  SELECT * INTO v_instance
  FROM process_instances
  WHERE id = p_instance_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Process instance not found: %', p_instance_id;
  END IF;

  -- Optimistic locking
  IF p_expected_version IS NOT NULL AND v_instance.version != p_expected_version THEN
    RAISE EXCEPTION 'Concurrent update detected. Please retry.';
  END IF;

  -- Get current stage history
  v_history := COALESCE(v_instance.stage_history, '[]'::JSONB);

  -- Close the last stage if it exists and is not completed
  IF jsonb_array_length(v_history) > 0 THEN
    v_last_stage := v_history -> -1;

    IF v_last_stage ->> 'completed_at' IS NULL THEN
      -- Calculate duration
      v_duration_hours := EXTRACT(EPOCH FROM (v_now - (v_last_stage ->> 'started_at')::TIMESTAMPTZ)) / 3600;

      -- Update last stage with completion
      v_last_stage := jsonb_set(v_last_stage, '{completed_at}', to_jsonb(v_now::TEXT));
      v_last_stage := jsonb_set(v_last_stage, '{duration_hours}', to_jsonb(v_duration_hours));

      -- Replace last element in array
      v_history := v_history - (jsonb_array_length(v_history) - 1);
      v_history := v_history || v_last_stage;
    END IF;
  END IF;

  -- Add new stage
  v_history := v_history || jsonb_build_object(
    'stage', p_new_stage,
    'started_at', v_now,
    'completed_at', NULL,
    'duration_hours', NULL,
    'is_value_add', p_is_value_add
  );

  -- Update instance
  UPDATE process_instances
  SET
    current_stage = p_new_stage,
    stage_history = v_history
  WHERE id = p_instance_id
  RETURNING * INTO v_instance;

  RETURN v_instance;
END;
$$ LANGUAGE plpgsql;

-- Function to complete process atomically
CREATE OR REPLACE FUNCTION complete_process_instance_atomic(
  p_instance_id UUID,
  p_expected_version INTEGER DEFAULT NULL
) RETURNS process_instances AS $$
DECLARE
  v_instance process_instances;
  v_process process_definitions;
  v_history JSONB;
  v_last_stage JSONB;
  v_now TIMESTAMPTZ := NOW();
  v_duration_hours NUMERIC;
  v_total_hours NUMERIC := 0;
  v_value_add_hours NUMERIC := 0;
  v_value_add_ratio NUMERIC;
  v_sla_status TEXT;
  v_stage JSONB;
  v_value_add_stages TEXT[];
BEGIN
  -- Lock and get instance with process definition
  SELECT pi.*, pd.*
  INTO v_instance, v_process
  FROM process_instances pi
  JOIN process_definitions pd ON pd.id = pi.process_id
  WHERE pi.id = p_instance_id
  FOR UPDATE OF pi;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Process instance not found: %', p_instance_id;
  END IF;

  -- Optimistic locking
  IF p_expected_version IS NOT NULL AND v_instance.version != p_expected_version THEN
    RAISE EXCEPTION 'Concurrent update detected. Please retry.';
  END IF;

  -- Get stage history
  v_history := COALESCE(v_instance.stage_history, '[]'::JSONB);

  -- Close the last stage
  IF jsonb_array_length(v_history) > 0 THEN
    v_last_stage := v_history -> -1;

    IF v_last_stage ->> 'completed_at' IS NULL THEN
      v_duration_hours := EXTRACT(EPOCH FROM (v_now - (v_last_stage ->> 'started_at')::TIMESTAMPTZ)) / 3600;
      v_last_stage := jsonb_set(v_last_stage, '{completed_at}', to_jsonb(v_now::TEXT));
      v_last_stage := jsonb_set(v_last_stage, '{duration_hours}', to_jsonb(v_duration_hours));
      v_history := v_history - (jsonb_array_length(v_history) - 1);
      v_history := v_history || v_last_stage;
    END IF;
  END IF;

  -- Calculate total and value-add hours
  FOR v_stage IN SELECT * FROM jsonb_array_elements(v_history)
  LOOP
    v_total_hours := v_total_hours + COALESCE((v_stage ->> 'duration_hours')::NUMERIC, 0);

    IF (v_stage ->> 'is_value_add')::BOOLEAN = TRUE THEN
      v_value_add_hours := v_value_add_hours + COALESCE((v_stage ->> 'duration_hours')::NUMERIC, 0);
    END IF;
  END LOOP;

  -- Calculate value-add ratio
  v_value_add_ratio := CASE
    WHEN v_total_hours > 0 THEN (v_value_add_hours / v_total_hours) * 100
    ELSE 0
  END;

  -- Determine SLA status
  v_sla_status := CASE
    WHEN v_process.sla_hours IS NULL THEN 'on_track'
    WHEN v_total_hours > v_process.sla_hours THEN 'breached'
    WHEN v_total_hours > (v_process.sla_hours * 0.8) THEN 'at_risk'
    ELSE 'on_track'
  END;

  -- Update instance
  UPDATE process_instances
  SET
    completed_at = v_now,
    current_stage = 'completed',
    stage_history = v_history,
    total_cycle_hours = ROUND(v_total_hours::NUMERIC, 2),
    value_add_hours = ROUND(v_value_add_hours::NUMERIC, 2),
    value_add_ratio = ROUND(v_value_add_ratio::NUMERIC, 2),
    sla_status = v_sla_status::sla_status
  WHERE id = p_instance_id
  RETURNING * INTO v_instance;

  RETURN v_instance;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- STEP 5: Atomic Functions for COPQ Incident Resolution
-- ============================================================================

CREATE OR REPLACE FUNCTION resolve_copq_incident_atomic(
  p_incident_id UUID,
  p_preventive_action TEXT DEFAULT NULL,
  p_expected_version INTEGER DEFAULT NULL
) RETURNS billing_copq_incidents AS $$
DECLARE
  v_incident billing_copq_incidents;
BEGIN
  -- Lock the row
  SELECT * INTO v_incident
  FROM billing_copq_incidents
  WHERE id = p_incident_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'COPQ incident not found: %', p_incident_id;
  END IF;

  -- Optimistic locking
  IF p_expected_version IS NOT NULL AND v_incident.version != p_expected_version THEN
    RAISE EXCEPTION 'Concurrent update detected. Please retry.';
  END IF;

  -- Prevent double resolution
  IF v_incident.status IN ('resolved', 'written_off') THEN
    RAISE EXCEPTION 'Incident already resolved or written off';
  END IF;

  -- Update to resolved
  UPDATE billing_copq_incidents
  SET
    status = 'resolved',
    resolved_at = NOW(),
    preventive_action = p_preventive_action
  WHERE id = p_incident_id
  RETURNING * INTO v_incident;

  RETURN v_incident;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION writeoff_copq_incident_atomic(
  p_incident_id UUID,
  p_expected_version INTEGER DEFAULT NULL
) RETURNS billing_copq_incidents AS $$
DECLARE
  v_incident billing_copq_incidents;
BEGIN
  -- Lock the row
  SELECT * INTO v_incident
  FROM billing_copq_incidents
  WHERE id = p_incident_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'COPQ incident not found: %', p_incident_id;
  END IF;

  -- Optimistic locking
  IF p_expected_version IS NOT NULL AND v_incident.version != p_expected_version THEN
    RAISE EXCEPTION 'Concurrent update detected. Please retry.';
  END IF;

  -- Prevent double write-off
  IF v_incident.status IN ('resolved', 'written_off') THEN
    RAISE EXCEPTION 'Incident already resolved or written off';
  END IF;

  -- Update to written off
  UPDATE billing_copq_incidents
  SET
    status = 'written_off',
    resolved_at = NOW()
  WHERE id = p_incident_id
  RETURNING * INTO v_incident;

  RETURN v_incident;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- STEP 6: Atomic Functions for Maturity Assessment Progress
-- ============================================================================

CREATE OR REPLACE FUNCTION update_maturity_progress_atomic(
  p_progress_id UUID,
  p_status TEXT,
  p_notes TEXT DEFAULT NULL,
  p_expected_version INTEGER DEFAULT NULL
) RETURNS maturity_progress AS $$
DECLARE
  v_progress maturity_progress;
BEGIN
  -- Lock the row
  SELECT * INTO v_progress
  FROM maturity_progress
  WHERE id = p_progress_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Progress item not found: %', p_progress_id;
  END IF;

  -- Optimistic locking
  IF p_expected_version IS NOT NULL AND v_progress.version != p_expected_version THEN
    RAISE EXCEPTION 'Concurrent update detected. Please retry.';
  END IF;

  -- Update with completion timestamp if completing
  UPDATE maturity_progress
  SET
    status = p_status::progress_status,
    notes = COALESCE(p_notes, notes),
    completed_at = CASE
      WHEN p_status = 'completed' THEN NOW()
      ELSE completed_at
    END
  WHERE id = p_progress_id
  RETURNING * INTO v_progress;

  RETURN v_progress;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- STEP 7: Grant execute permissions
-- ============================================================================

GRANT EXECUTE ON FUNCTION update_grievance_sla_atomic TO authenticated;
GRANT EXECUTE ON FUNCTION assign_grievance_ticket_atomic TO authenticated;
GRANT EXECUTE ON FUNCTION advance_process_stage_atomic TO authenticated;
GRANT EXECUTE ON FUNCTION complete_process_instance_atomic TO authenticated;
GRANT EXECUTE ON FUNCTION resolve_copq_incident_atomic TO authenticated;
GRANT EXECUTE ON FUNCTION writeoff_copq_incident_atomic TO authenticated;
GRANT EXECUTE ON FUNCTION update_maturity_progress_atomic TO authenticated;

-- ============================================================================
-- Migration Complete
-- ============================================================================
-- This migration adds:
-- 1. Version columns to all affected tables for optimistic locking
-- 2. Auto-increment triggers for version tracking
-- 3. Atomic database functions using SELECT FOR UPDATE
-- 4. Version checking to prevent concurrent updates
-- 5. Proper transaction isolation for critical operations
