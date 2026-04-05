-- ================================================================
-- Caller Journey Intelligence — Schema Additions
-- Migration: 013_caller_journey_fixes.sql
-- ================================================================

-- 1. Callback SLA columns
ALTER TABLE admission_callback_queue
  ADD COLUMN IF NOT EXISTS callback_due_by TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sla_breached BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS sla_breached_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS escalation_level INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_sms_sent_at TIMESTAMPTZ;

-- Index for SLA sweep
CREATE INDEX IF NOT EXISTS idx_callback_queue_sla
  ON admission_callback_queue(callback_due_by)
  WHERE status = 'pending' AND sla_breached = FALSE;

-- 2. Caller journey tracking columns on call_logs
ALTER TABLE admission_call_logs
  ADD COLUMN IF NOT EXISTS caller_location TEXT,
  ADD COLUMN IF NOT EXISTS caller_attempt_number INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS caller_journey_context TEXT;

-- 3. SMS dedup tracking
ALTER TABLE admission_call_logs
  ADD COLUMN IF NOT EXISTS auto_sms_skipped_reason TEXT;
