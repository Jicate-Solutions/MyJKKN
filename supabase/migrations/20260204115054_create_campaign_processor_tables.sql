-- ============================================================================
-- Campaign Background Job Processor Tables
-- Created: 2026-02-04
-- Description: Tables for queuing and logging campaign workflow executions
-- ============================================================================

-- ============================================================================
-- ENUMS
-- ============================================================================

-- Campaign step status enum
DO $$ BEGIN
    CREATE TYPE campaign_step_status AS ENUM ('pending', 'running', 'completed', 'failed', 'skipped', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Campaign step type enum
DO $$ BEGIN
    CREATE TYPE campaign_step_type AS ENUM (
        'send_sms', 'send_email', 'send_whatsapp',
        'update_stage', 'assign_counselor', 'add_tag',
        'wait', 'wait_hours', 'wait_days'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- CAMPAIGN QUEUE TABLE
-- ============================================================================

-- Queue for pending campaign actions
CREATE TABLE IF NOT EXISTS admission_campaign_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
    workflow_id UUID REFERENCES admission_workflows(id) ON DELETE SET NULL,
    lead_id UUID REFERENCES admission_leads(id) ON DELETE CASCADE,
    application_id UUID REFERENCES admission_applications(id) ON DELETE SET NULL,

    -- Step details
    step_type campaign_step_type NOT NULL,
    step_config JSONB NOT NULL DEFAULT '{}',
    step_order INTEGER DEFAULT 0,

    -- Scheduling
    scheduled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    execute_after TIMESTAMPTZ, -- For delayed execution (wait steps)

    -- Status tracking
    status campaign_step_status NOT NULL DEFAULT 'pending',
    attempts INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 3,
    last_attempt_at TIMESTAMPTZ,

    -- Execution context
    execution_id UUID, -- Links to parent workflow execution
    parent_queue_id UUID REFERENCES admission_campaign_queue(id) ON DELETE SET NULL, -- For chained steps

    -- Error tracking
    error_message TEXT,
    error_details JSONB,

    -- Metadata
    priority INTEGER DEFAULT 0, -- Higher = more urgent
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    completed_at TIMESTAMPTZ
);

-- ============================================================================
-- CAMPAIGN LOGS TABLE
-- ============================================================================

-- Detailed execution logs for debugging and analytics
CREATE TABLE IF NOT EXISTS admission_campaign_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
    queue_id UUID REFERENCES admission_campaign_queue(id) ON DELETE SET NULL,
    workflow_id UUID REFERENCES admission_workflows(id) ON DELETE SET NULL,
    lead_id UUID REFERENCES admission_leads(id) ON DELETE SET NULL,

    -- Log details
    log_type TEXT NOT NULL, -- 'info', 'warning', 'error', 'success'
    step_type campaign_step_type,
    action TEXT NOT NULL, -- Description of what happened

    -- Request/Response tracking
    request_data JSONB, -- What was sent
    response_data JSONB, -- What was received

    -- Duration tracking
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    duration_ms INTEGER, -- Execution time in milliseconds

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT now(),
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Queue indexes for efficient processing
CREATE INDEX IF NOT EXISTS idx_campaign_queue_institution ON admission_campaign_queue(institution_id);
CREATE INDEX IF NOT EXISTS idx_campaign_queue_status ON admission_campaign_queue(status);
CREATE INDEX IF NOT EXISTS idx_campaign_queue_scheduled ON admission_campaign_queue(scheduled_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_campaign_queue_execute_after ON admission_campaign_queue(execute_after) WHERE status = 'pending' AND execute_after IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_campaign_queue_workflow ON admission_campaign_queue(workflow_id);
CREATE INDEX IF NOT EXISTS idx_campaign_queue_lead ON admission_campaign_queue(lead_id);
CREATE INDEX IF NOT EXISTS idx_campaign_queue_priority ON admission_campaign_queue(priority DESC, scheduled_at ASC) WHERE status = 'pending';

-- Log indexes
CREATE INDEX IF NOT EXISTS idx_campaign_logs_institution ON admission_campaign_logs(institution_id);
CREATE INDEX IF NOT EXISTS idx_campaign_logs_queue ON admission_campaign_logs(queue_id);
CREATE INDEX IF NOT EXISTS idx_campaign_logs_workflow ON admission_campaign_logs(workflow_id);
CREATE INDEX IF NOT EXISTS idx_campaign_logs_lead ON admission_campaign_logs(lead_id);
CREATE INDEX IF NOT EXISTS idx_campaign_logs_type ON admission_campaign_logs(log_type);
CREATE INDEX IF NOT EXISTS idx_campaign_logs_created ON admission_campaign_logs(created_at DESC);

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Update timestamp trigger
DROP TRIGGER IF EXISTS trigger_update_campaign_queue_updated_at ON admission_campaign_queue;
CREATE TRIGGER trigger_update_campaign_queue_updated_at
BEFORE UPDATE ON admission_campaign_queue
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

-- Enable RLS
ALTER TABLE admission_campaign_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE admission_campaign_logs ENABLE ROW LEVEL SECURITY;

-- Queue policies
CREATE POLICY "Users can view campaign queue in their institution"
    ON admission_campaign_queue FOR SELECT
    USING (
        institution_id IN (
            SELECT institution_id FROM profiles WHERE id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'
        )
    );

CREATE POLICY "Users can manage campaign queue in their institution"
    ON admission_campaign_queue FOR ALL
    USING (
        institution_id IN (
            SELECT institution_id FROM profiles WHERE id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'
        )
    );

-- Logs policies
CREATE POLICY "Users can view campaign logs in their institution"
    ON admission_campaign_logs FOR SELECT
    USING (
        institution_id IN (
            SELECT institution_id FROM profiles WHERE id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'
        )
    );

CREATE POLICY "System can insert campaign logs"
    ON admission_campaign_logs FOR INSERT
    WITH CHECK (true);

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Function to get pending queue items ready for execution
CREATE OR REPLACE FUNCTION get_pending_campaign_steps(
    p_institution_id UUID DEFAULT NULL,
    p_limit INTEGER DEFAULT 50
)
RETURNS TABLE (
    id UUID,
    institution_id UUID,
    workflow_id UUID,
    lead_id UUID,
    application_id UUID,
    step_type campaign_step_type,
    step_config JSONB,
    step_order INTEGER,
    scheduled_at TIMESTAMPTZ,
    execute_after TIMESTAMPTZ,
    priority INTEGER,
    attempts INTEGER,
    max_attempts INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        q.id,
        q.institution_id,
        q.workflow_id,
        q.lead_id,
        q.application_id,
        q.step_type,
        q.step_config,
        q.step_order,
        q.scheduled_at,
        q.execute_after,
        q.priority,
        q.attempts,
        q.max_attempts
    FROM admission_campaign_queue q
    WHERE q.status = 'pending'
        AND (q.execute_after IS NULL OR q.execute_after <= now())
        AND q.attempts < q.max_attempts
        AND (p_institution_id IS NULL OR q.institution_id = p_institution_id)
    ORDER BY q.priority DESC, q.scheduled_at ASC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to claim a queue item for processing
CREATE OR REPLACE FUNCTION claim_campaign_step(p_queue_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    v_row_count INTEGER;
BEGIN
    UPDATE admission_campaign_queue
    SET
        status = 'running',
        attempts = attempts + 1,
        last_attempt_at = now(),
        updated_at = now()
    WHERE id = p_queue_id
        AND status = 'pending'
        AND (execute_after IS NULL OR execute_after <= now())
        AND attempts < max_attempts;

    GET DIAGNOSTICS v_row_count = ROW_COUNT;
    RETURN v_row_count > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to mark step as completed
CREATE OR REPLACE FUNCTION complete_campaign_step(
    p_queue_id UUID,
    p_success BOOLEAN DEFAULT true,
    p_error_message TEXT DEFAULT NULL,
    p_error_details JSONB DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
    UPDATE admission_campaign_queue
    SET
        status = CASE WHEN p_success THEN 'completed'::campaign_step_status ELSE 'failed'::campaign_step_status END,
        completed_at = now(),
        error_message = p_error_message,
        error_details = p_error_details,
        updated_at = now()
    WHERE id = p_queue_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get queue statistics
CREATE OR REPLACE FUNCTION get_campaign_queue_stats(p_institution_id UUID)
RETURNS TABLE (
    total_pending BIGINT,
    total_running BIGINT,
    total_completed BIGINT,
    total_failed BIGINT,
    completed_today BIGINT,
    failed_today BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(*) FILTER (WHERE status = 'pending') as total_pending,
        COUNT(*) FILTER (WHERE status = 'running') as total_running,
        COUNT(*) FILTER (WHERE status = 'completed') as total_completed,
        COUNT(*) FILTER (WHERE status = 'failed') as total_failed,
        COUNT(*) FILTER (WHERE status = 'completed' AND completed_at >= CURRENT_DATE) as completed_today,
        COUNT(*) FILTER (WHERE status = 'failed' AND completed_at >= CURRENT_DATE) as failed_today
    FROM admission_campaign_queue
    WHERE institution_id = p_institution_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE admission_campaign_queue IS 'Queue for pending campaign workflow actions';
COMMENT ON TABLE admission_campaign_logs IS 'Detailed execution logs for campaign actions';
COMMENT ON COLUMN admission_campaign_queue.step_type IS 'Type of campaign action to execute';
COMMENT ON COLUMN admission_campaign_queue.execute_after IS 'Delay execution until this timestamp (for wait steps)';
COMMENT ON COLUMN admission_campaign_queue.priority IS 'Higher priority items are processed first';
COMMENT ON FUNCTION get_pending_campaign_steps IS 'Get queue items ready to be processed';
COMMENT ON FUNCTION claim_campaign_step IS 'Atomically claim a queue item for processing';
COMMENT ON FUNCTION complete_campaign_step IS 'Mark a queue item as completed or failed';
