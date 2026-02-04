-- ============================================================================
-- WhatsApp Campaign Logs Table
-- Created: 2026-02-04
-- Description: Tracks WhatsApp messages sent through the admission CRM campaigns
-- ============================================================================

-- Create delivery status enum if not exists
DO $$ BEGIN
    CREATE TYPE whatsapp_delivery_status AS ENUM ('pending', 'sent', 'delivered', 'read', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- WhatsApp message logs table
CREATE TABLE IF NOT EXISTS admission_whatsapp_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
    lead_id UUID NOT NULL REFERENCES admission_leads(id) ON DELETE CASCADE,
    template_id UUID REFERENCES admission_communication_templates(id) ON DELETE SET NULL,

    -- Message details
    recipient_phone TEXT NOT NULL,
    message_content TEXT NOT NULL,

    -- Delivery tracking
    delivery_status whatsapp_delivery_status NOT NULL DEFAULT 'pending',
    whatsapp_message_id TEXT, -- ID from WhatsApp API
    error_message TEXT,

    -- Timestamps for delivery stages
    sent_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    read_at TIMESTAMPTZ,
    failed_at TIMESTAMPTZ,

    -- Campaign context
    campaign_id UUID, -- Link to campaign if sent as part of a campaign
    workflow_execution_id UUID, -- Link to workflow execution if triggered by workflow

    -- Metadata (additional context, utm params, etc.)
    metadata JSONB DEFAULT '{}',

    -- Audit fields
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_whatsapp_logs_institution
    ON admission_whatsapp_logs(institution_id);

CREATE INDEX IF NOT EXISTS idx_whatsapp_logs_lead
    ON admission_whatsapp_logs(lead_id);

CREATE INDEX IF NOT EXISTS idx_whatsapp_logs_status
    ON admission_whatsapp_logs(delivery_status);

CREATE INDEX IF NOT EXISTS idx_whatsapp_logs_campaign
    ON admission_whatsapp_logs(campaign_id)
    WHERE campaign_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_whatsapp_logs_workflow
    ON admission_whatsapp_logs(workflow_execution_id)
    WHERE workflow_execution_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_whatsapp_logs_created_at
    ON admission_whatsapp_logs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_whatsapp_logs_phone
    ON admission_whatsapp_logs(recipient_phone);

-- Composite index for filtering messages
CREATE INDEX IF NOT EXISTS idx_whatsapp_logs_institution_status_date
    ON admission_whatsapp_logs(institution_id, delivery_status, created_at DESC);

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

ALTER TABLE admission_whatsapp_logs ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view WhatsApp logs for their institution
CREATE POLICY "Users can view institution whatsapp logs"
    ON admission_whatsapp_logs
    FOR SELECT
    USING (
        institution_id IN (
            SELECT institution_id
            FROM user_institution_access
            WHERE user_id = auth.uid()
        )
    );

-- Policy: Users can create WhatsApp logs for their institution
CREATE POLICY "Users can create institution whatsapp logs"
    ON admission_whatsapp_logs
    FOR INSERT
    WITH CHECK (
        institution_id IN (
            SELECT institution_id
            FROM user_institution_access
            WHERE user_id = auth.uid()
        )
    );

-- Policy: Users can update WhatsApp logs for their institution
CREATE POLICY "Users can update institution whatsapp logs"
    ON admission_whatsapp_logs
    FOR UPDATE
    USING (
        institution_id IN (
            SELECT institution_id
            FROM user_institution_access
            WHERE user_id = auth.uid()
        )
    );

-- Service role can do everything (for webhooks)
CREATE POLICY "Service role has full access to whatsapp logs"
    ON admission_whatsapp_logs
    FOR ALL
    USING (auth.jwt() ->> 'role' = 'service_role');

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_whatsapp_logs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_whatsapp_logs_updated_at ON admission_whatsapp_logs;

CREATE TRIGGER trigger_update_whatsapp_logs_updated_at
    BEFORE UPDATE ON admission_whatsapp_logs
    FOR EACH ROW
    EXECUTE FUNCTION update_whatsapp_logs_updated_at();

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE admission_whatsapp_logs IS 'Tracks WhatsApp messages sent through admission CRM campaigns';
COMMENT ON COLUMN admission_whatsapp_logs.whatsapp_message_id IS 'Message ID returned from WhatsApp API';
COMMENT ON COLUMN admission_whatsapp_logs.metadata IS 'Additional context like UTM params, campaign details';
