-- ============================================================================
-- Drip Sequence Executor Tables
-- Created: 2026-02-04
-- Description: Tables for managing drip sequences (automated multi-step campaigns)
-- ============================================================================

-- ============================================================================
-- ENUMS
-- ============================================================================

-- Drip sequence status
DO $$ BEGIN
    CREATE TYPE drip_sequence_status AS ENUM (
        'active',       -- Sequence is running
        'paused',       -- Temporarily paused
        'completed',    -- All steps executed
        'cancelled',    -- Manually cancelled
        'failed'        -- Failed due to error
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Drip step status
DO $$ BEGIN
    CREATE TYPE drip_step_status AS ENUM (
        'pending',      -- Waiting to be scheduled
        'scheduled',    -- Scheduled for execution
        'executing',    -- Currently executing
        'completed',    -- Successfully executed
        'skipped',      -- Skipped by user or condition
        'failed'        -- Execution failed
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- TABLES
-- ============================================================================

-- Drip Sequences: Tracks active drip sequences for leads
CREATE TABLE IF NOT EXISTS admission_drip_sequences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
    workflow_id UUID NOT NULL REFERENCES admission_workflows(id) ON DELETE CASCADE,
    lead_id UUID NOT NULL REFERENCES admission_leads(id) ON DELETE CASCADE,

    -- Status tracking
    status drip_sequence_status NOT NULL DEFAULT 'active',
    current_step_index INTEGER NOT NULL DEFAULT 0,
    total_steps INTEGER NOT NULL,

    -- Timing
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    paused_at TIMESTAMPTZ,
    resumed_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,

    -- Context data (lead snapshot, workflow snapshot)
    context_data JSONB DEFAULT '{}',

    -- Error tracking
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,

    -- Metadata
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Partial unique index to ensure only one active/paused sequence per lead per workflow
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_sequence_per_lead_workflow
    ON admission_drip_sequences(workflow_id, lead_id)
    WHERE status IN ('active', 'paused');

-- Drip Schedule: Individual steps scheduled for execution
CREATE TABLE IF NOT EXISTS admission_drip_schedule (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sequence_id UUID NOT NULL REFERENCES admission_drip_sequences(id) ON DELETE CASCADE,

    -- Step information
    step_index INTEGER NOT NULL,
    action_id TEXT NOT NULL,
    action_type TEXT NOT NULL,  -- send_whatsapp, send_email, send_sms, update_stage, etc.
    action_config JSONB NOT NULL DEFAULT '{}',

    -- Scheduling
    scheduled_at TIMESTAMPTZ NOT NULL,
    delay_hours INTEGER DEFAULT 0,
    delay_days INTEGER DEFAULT 0,

    -- Conditions to check before executing
    conditions JSONB DEFAULT '[]',

    -- Execution
    status drip_step_status NOT NULL DEFAULT 'pending',
    executed_at TIMESTAMPTZ,
    execution_result JSONB,
    error_message TEXT,

    -- Skip tracking
    skipped_at TIMESTAMPTZ,
    skipped_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    skip_reason TEXT,

    -- Retry tracking
    retry_count INTEGER DEFAULT 0,
    last_retry_at TIMESTAMPTZ,

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),

    -- Constraints
    UNIQUE(sequence_id, step_index)
);

-- Drip execution logs for audit trail
CREATE TABLE IF NOT EXISTS admission_drip_execution_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sequence_id UUID NOT NULL REFERENCES admission_drip_sequences(id) ON DELETE CASCADE,
    schedule_id UUID REFERENCES admission_drip_schedule(id) ON DELETE SET NULL,

    -- Log details
    event_type TEXT NOT NULL,  -- started, step_executed, paused, resumed, completed, failed, skipped
    event_data JSONB DEFAULT '{}',

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Drip sequences indexes
CREATE INDEX IF NOT EXISTS idx_drip_sequences_institution
    ON admission_drip_sequences(institution_id);
CREATE INDEX IF NOT EXISTS idx_drip_sequences_workflow
    ON admission_drip_sequences(workflow_id);
CREATE INDEX IF NOT EXISTS idx_drip_sequences_lead
    ON admission_drip_sequences(lead_id);
CREATE INDEX IF NOT EXISTS idx_drip_sequences_status
    ON admission_drip_sequences(status);
CREATE INDEX IF NOT EXISTS idx_drip_sequences_active
    ON admission_drip_sequences(status) WHERE status IN ('active', 'paused');

-- Drip schedule indexes
CREATE INDEX IF NOT EXISTS idx_drip_schedule_sequence
    ON admission_drip_schedule(sequence_id);
CREATE INDEX IF NOT EXISTS idx_drip_schedule_scheduled_at
    ON admission_drip_schedule(scheduled_at) WHERE status IN ('pending', 'scheduled');
CREATE INDEX IF NOT EXISTS idx_drip_schedule_status
    ON admission_drip_schedule(status);
CREATE INDEX IF NOT EXISTS idx_drip_schedule_pending
    ON admission_drip_schedule(scheduled_at, status)
    WHERE status = 'pending' OR status = 'scheduled';

-- Execution logs index
CREATE INDEX IF NOT EXISTS idx_drip_execution_logs_sequence
    ON admission_drip_execution_logs(sequence_id);
CREATE INDEX IF NOT EXISTS idx_drip_execution_logs_created
    ON admission_drip_execution_logs(created_at DESC);

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Update timestamp trigger for drip_sequences
DROP TRIGGER IF EXISTS trg_drip_sequences_updated_at ON admission_drip_sequences;
CREATE TRIGGER trg_drip_sequences_updated_at
    BEFORE UPDATE ON admission_drip_sequences
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Update timestamp trigger for drip_schedule
DROP TRIGGER IF EXISTS trg_drip_schedule_updated_at ON admission_drip_schedule;
CREATE TRIGGER trg_drip_schedule_updated_at
    BEFORE UPDATE ON admission_drip_schedule
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

ALTER TABLE admission_drip_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE admission_drip_schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE admission_drip_execution_logs ENABLE ROW LEVEL SECURITY;

-- Drip sequences policies
CREATE POLICY "Users can view drip sequences in their institution"
    ON admission_drip_sequences FOR SELECT
    USING (
        institution_id IN (
            SELECT institution_id FROM user_institution_access
            WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert drip sequences in their institution"
    ON admission_drip_sequences FOR INSERT
    WITH CHECK (
        institution_id IN (
            SELECT institution_id FROM user_institution_access
            WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update drip sequences in their institution"
    ON admission_drip_sequences FOR UPDATE
    USING (
        institution_id IN (
            SELECT institution_id FROM user_institution_access
            WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete drip sequences in their institution"
    ON admission_drip_sequences FOR DELETE
    USING (
        institution_id IN (
            SELECT institution_id FROM user_institution_access
            WHERE user_id = auth.uid()
        )
    );

-- Drip schedule policies (inherit from sequence)
CREATE POLICY "Users can view drip schedule via sequence"
    ON admission_drip_schedule FOR SELECT
    USING (
        sequence_id IN (
            SELECT id FROM admission_drip_sequences
            WHERE institution_id IN (
                SELECT institution_id FROM user_institution_access
                WHERE user_id = auth.uid()
            )
        )
    );

CREATE POLICY "Users can insert drip schedule via sequence"
    ON admission_drip_schedule FOR INSERT
    WITH CHECK (
        sequence_id IN (
            SELECT id FROM admission_drip_sequences
            WHERE institution_id IN (
                SELECT institution_id FROM user_institution_access
                WHERE user_id = auth.uid()
            )
        )
    );

CREATE POLICY "Users can update drip schedule via sequence"
    ON admission_drip_schedule FOR UPDATE
    USING (
        sequence_id IN (
            SELECT id FROM admission_drip_sequences
            WHERE institution_id IN (
                SELECT institution_id FROM user_institution_access
                WHERE user_id = auth.uid()
            )
        )
    );

CREATE POLICY "Users can delete drip schedule via sequence"
    ON admission_drip_schedule FOR DELETE
    USING (
        sequence_id IN (
            SELECT id FROM admission_drip_sequences
            WHERE institution_id IN (
                SELECT institution_id FROM user_institution_access
                WHERE user_id = auth.uid()
            )
        )
    );

-- Execution logs policies
CREATE POLICY "Users can view execution logs via sequence"
    ON admission_drip_execution_logs FOR SELECT
    USING (
        sequence_id IN (
            SELECT id FROM admission_drip_sequences
            WHERE institution_id IN (
                SELECT institution_id FROM user_institution_access
                WHERE user_id = auth.uid()
            )
        )
    );

CREATE POLICY "Users can insert execution logs via sequence"
    ON admission_drip_execution_logs FOR INSERT
    WITH CHECK (
        sequence_id IN (
            SELECT id FROM admission_drip_sequences
            WHERE institution_id IN (
                SELECT institution_id FROM user_institution_access
                WHERE user_id = auth.uid()
            )
        )
    );

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Function to get pending drip steps that are ready to execute
CREATE OR REPLACE FUNCTION get_pending_drip_steps(p_limit INTEGER DEFAULT 100)
RETURNS TABLE (
    schedule_id UUID,
    sequence_id UUID,
    lead_id UUID,
    workflow_id UUID,
    institution_id UUID,
    step_index INTEGER,
    action_id TEXT,
    action_type TEXT,
    action_config JSONB,
    conditions JSONB,
    context_data JSONB
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        ds.id as schedule_id,
        ds.sequence_id,
        seq.lead_id,
        seq.workflow_id,
        seq.institution_id,
        ds.step_index,
        ds.action_id,
        ds.action_type,
        ds.action_config,
        ds.conditions,
        seq.context_data
    FROM admission_drip_schedule ds
    JOIN admission_drip_sequences seq ON ds.sequence_id = seq.id
    WHERE ds.status IN ('pending', 'scheduled')
      AND ds.scheduled_at <= now()
      AND seq.status = 'active'
    ORDER BY ds.scheduled_at ASC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to mark a drip step as executed
CREATE OR REPLACE FUNCTION mark_drip_step_executed(
    p_schedule_id UUID,
    p_result JSONB DEFAULT '{}'::JSONB,
    p_error TEXT DEFAULT NULL
)
RETURNS void AS $$
DECLARE
    v_sequence_id UUID;
    v_step_index INTEGER;
    v_total_steps INTEGER;
    v_new_status drip_step_status;
BEGIN
    -- Get schedule info
    SELECT sequence_id, step_index INTO v_sequence_id, v_step_index
    FROM admission_drip_schedule
    WHERE id = p_schedule_id;

    -- Determine status
    IF p_error IS NOT NULL THEN
        v_new_status := 'failed'::drip_step_status;
    ELSE
        v_new_status := 'completed'::drip_step_status;
    END IF;

    -- Update the schedule
    UPDATE admission_drip_schedule
    SET
        status = v_new_status,
        executed_at = now(),
        execution_result = p_result,
        error_message = p_error,
        updated_at = now()
    WHERE id = p_schedule_id;

    -- Log the execution
    INSERT INTO admission_drip_execution_logs (sequence_id, schedule_id, event_type, event_data)
    VALUES (
        v_sequence_id,
        p_schedule_id,
        CASE WHEN p_error IS NOT NULL THEN 'step_failed' ELSE 'step_executed' END,
        jsonb_build_object(
            'step_index', v_step_index,
            'result', p_result,
            'error', p_error
        )
    );

    -- Check if sequence is complete
    SELECT total_steps INTO v_total_steps
    FROM admission_drip_sequences
    WHERE id = v_sequence_id;

    -- Update sequence progress
    IF v_step_index + 1 >= v_total_steps THEN
        -- All steps done
        UPDATE admission_drip_sequences
        SET
            status = 'completed'::drip_sequence_status,
            current_step_index = v_step_index + 1,
            completed_at = now(),
            updated_at = now()
        WHERE id = v_sequence_id;

        -- Log completion
        INSERT INTO admission_drip_execution_logs (sequence_id, event_type, event_data)
        VALUES (v_sequence_id, 'completed', jsonb_build_object('total_steps', v_total_steps));
    ELSE
        -- Update current step
        UPDATE admission_drip_sequences
        SET
            current_step_index = v_step_index + 1,
            updated_at = now()
        WHERE id = v_sequence_id;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
