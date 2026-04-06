-- ============================================================================
-- 014: WhatsApp Auto-Responder for Missed Calls
-- ============================================================================
-- Adds WhatsApp auto-responder settings to institution_call_settings
-- and tracking columns to admission_call_logs.
-- Applied to production (kvizhngldtiuufknvehv) on 2026-04-06.

-- 1. WhatsApp settings on institution_call_settings
ALTER TABLE institution_call_settings
  ADD COLUMN IF NOT EXISTS auto_whatsapp_enabled BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS auto_whatsapp_template TEXT DEFAULT 'Thank you for calling JKKN Institutions. We missed your call and apologize. A counselor will call you back shortly. Reply here if you have any questions about our courses.';

-- 2. WhatsApp tracking columns on admission_call_logs
ALTER TABLE admission_call_logs
  ADD COLUMN IF NOT EXISTS auto_whatsapp_sent BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS auto_whatsapp_message_id TEXT,
  ADD COLUMN IF NOT EXISTS auto_whatsapp_skipped_reason TEXT;

-- 3. Reload PostgREST schema cache
SELECT pg_notify('pgrst', 'reload schema');
