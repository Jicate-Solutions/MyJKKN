-- Migration: Create admission_sms_logs table
-- Purpose: Track SMS campaign delivery status for Admission CRM
-- Created: 2026-02-04

-- ============================================================================
-- CREATE ENUM FOR SMS DELIVERY STATUS
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE sms_delivery_status AS ENUM (
    'pending',
    'queued',
    'sent',
    'delivered',
    'failed',
    'undelivered',
    'rejected'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE sms_provider AS ENUM (
    'msg91',
    'twilio'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- CREATE TABLE: admission_sms_logs
-- ============================================================================

CREATE TABLE IF NOT EXISTS admission_sms_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Institution & Lead references
  institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL,  -- Reference to admission lead (admissions table)

  -- Template reference (optional - can send custom messages)
  template_id UUID REFERENCES admission_communication_templates(id) ON DELETE SET NULL,

  -- Message details
  phone_number VARCHAR(20) NOT NULL,
  message_content TEXT NOT NULL,

  -- Provider tracking
  provider sms_provider NOT NULL DEFAULT 'msg91',
  provider_message_id VARCHAR(255),  -- MSG91 request_id or Twilio SID

  -- Delivery status
  status sms_delivery_status NOT NULL DEFAULT 'pending',
  error_message TEXT,

  -- DLT compliance (Indian SMS regulations)
  dlt_template_id VARCHAR(50),
  dlt_entity_id VARCHAR(50),

  -- Cost tracking
  cost DECIMAL(10, 4),
  segments INTEGER NOT NULL DEFAULT 1,

  -- Timestamps
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- CREATE INDEXES
-- ============================================================================

-- Index for filtering by institution
CREATE INDEX IF NOT EXISTS idx_admission_sms_logs_institution
  ON admission_sms_logs(institution_id);

-- Index for filtering by lead
CREATE INDEX IF NOT EXISTS idx_admission_sms_logs_lead
  ON admission_sms_logs(lead_id);

-- Index for filtering by status
CREATE INDEX IF NOT EXISTS idx_admission_sms_logs_status
  ON admission_sms_logs(status);

-- Index for webhook lookup by provider message ID
CREATE INDEX IF NOT EXISTS idx_admission_sms_logs_provider_msg_id
  ON admission_sms_logs(provider_message_id)
  WHERE provider_message_id IS NOT NULL;

-- Index for date range queries
CREATE INDEX IF NOT EXISTS idx_admission_sms_logs_created_at
  ON admission_sms_logs(created_at DESC);

-- Composite index for common query pattern
CREATE INDEX IF NOT EXISTS idx_admission_sms_logs_institution_status
  ON admission_sms_logs(institution_id, status, created_at DESC);

-- ============================================================================
-- CREATE TRIGGER FOR UPDATED_AT
-- ============================================================================

CREATE OR REPLACE FUNCTION update_admission_sms_logs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_admission_sms_logs_updated_at ON admission_sms_logs;

CREATE TRIGGER trigger_update_admission_sms_logs_updated_at
  BEFORE UPDATE ON admission_sms_logs
  FOR EACH ROW
  EXECUTE FUNCTION update_admission_sms_logs_updated_at();

-- ============================================================================
-- ENABLE ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE admission_sms_logs ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see SMS logs for their institution
CREATE POLICY "admission_sms_logs_institution_access" ON admission_sms_logs
  FOR ALL
  USING (
    institution_id IN (
      SELECT institution_id
      FROM user_institution_access
      WHERE user_id = auth.uid()
    )
  );

-- Policy: Service role can access all
CREATE POLICY "admission_sms_logs_service_role" ON admission_sms_logs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- ADD COMMENTS
-- ============================================================================

COMMENT ON TABLE admission_sms_logs IS 'Tracks SMS campaign delivery status for Admission CRM leads';
COMMENT ON COLUMN admission_sms_logs.provider_message_id IS 'External ID from SMS provider (MSG91 request_id or Twilio SID)';
COMMENT ON COLUMN admission_sms_logs.dlt_template_id IS 'DLT Template ID for Indian SMS compliance';
COMMENT ON COLUMN admission_sms_logs.dlt_entity_id IS 'DLT Entity/Principal Entity ID for Indian SMS compliance';
COMMENT ON COLUMN admission_sms_logs.segments IS 'Number of SMS segments (1 segment = 160 chars for GSM-7)';
