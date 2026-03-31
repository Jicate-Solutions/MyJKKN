-- Migration: Create expo_wa_message_queue table
-- Date: 2026-03-31
-- Purpose: Track WhatsApp welcome messages sent to expo leads with retry support

-- Create table
CREATE TABLE IF NOT EXISTS public.expo_wa_message_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    expo_event_id UUID NOT NULL REFERENCES expo_events(id) ON DELETE CASCADE,
    lead_id UUID NOT NULL REFERENCES admission_leads(id) ON DELETE CASCADE,
    phone TEXT NOT NULL,
    template_name TEXT NOT NULL DEFAULT 'exhibition_thankyou',
    template_params JSONB DEFAULT '[]'::jsonb,
    status TEXT NOT NULL DEFAULT 'queued'
        CHECK (status IN ('queued', 'sent', 'delivered', 'read', 'failed', 'permanently_failed', 'skipped')),
    wa_message_id TEXT,
    retry_count INT NOT NULL DEFAULT 0,
    next_retry_at TIMESTAMPTZ,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_expo_wa_queue_event ON expo_wa_message_queue(expo_event_id);
CREATE INDEX IF NOT EXISTS idx_expo_wa_queue_lead ON expo_wa_message_queue(lead_id);
CREATE INDEX IF NOT EXISTS idx_expo_wa_queue_status ON expo_wa_message_queue(status);
CREATE INDEX IF NOT EXISTS idx_expo_wa_queue_retry ON expo_wa_message_queue(status, next_retry_at) WHERE status IN ('queued', 'failed');
CREATE INDEX IF NOT EXISTS idx_expo_wa_queue_created ON expo_wa_message_queue(created_at DESC);

-- RLS
ALTER TABLE expo_wa_message_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "expo_wa_queue_select" ON expo_wa_message_queue FOR SELECT USING (
  expo_event_id = ANY(get_my_expo_event_ids())
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  OR EXISTS (SELECT 1 FROM user_roles ur JOIN custom_roles cr ON ur.role_id = cr.id WHERE ur.user_id = auth.uid() AND cr.role_key = 'admission')
);

-- Timestamp trigger
CREATE TRIGGER set_expo_wa_queue_updated_at
  BEFORE UPDATE ON expo_wa_message_queue
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
