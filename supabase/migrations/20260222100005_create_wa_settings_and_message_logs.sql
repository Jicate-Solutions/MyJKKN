-- ============================================================================
-- WhatsApp Settings & Message Logs Tables
-- Created: 2026-02-22
-- Description: Settings per institution and BYOW message logs (distinct from
--              admission_whatsapp_logs which tracks CRM campaign messages)
-- ============================================================================

-- ==========================================================================
-- 1. wa_settings — one row per institution
-- ==========================================================================

CREATE TABLE IF NOT EXISTS public.wa_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,

  -- Service connection defaults
  service_url TEXT,
  api_key TEXT,

  -- Rate limiting
  messages_per_minute INTEGER NOT NULL DEFAULT 20,
  bulk_delay_ms INTEGER NOT NULL DEFAULT 3000,
  max_bulk_recipients INTEGER NOT NULL DEFAULT 100,

  -- Feature flags
  enable_bulk_messaging BOOLEAN NOT NULL DEFAULT false,
  enable_templates BOOLEAN NOT NULL DEFAULT true,
  enable_scheduled_messages BOOLEAN NOT NULL DEFAULT false,
  enable_auto_replies BOOLEAN NOT NULL DEFAULT false,

  -- Notifications
  notify_on_disconnect BOOLEAN NOT NULL DEFAULT true,
  notify_email TEXT,

  -- Retention
  message_log_retention_days INTEGER NOT NULL DEFAULT 30,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(institution_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_wa_settings_institution
  ON public.wa_settings(institution_id);

-- RLS
ALTER TABLE public.wa_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own institution settings"
  ON public.wa_settings FOR SELECT
  USING (
    institution_id IN (
      SELECT institution_id FROM user_institution_access
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own institution settings"
  ON public.wa_settings FOR INSERT
  WITH CHECK (
    institution_id IN (
      SELECT institution_id FROM user_institution_access
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own institution settings"
  ON public.wa_settings FOR UPDATE
  USING (
    institution_id IN (
      SELECT institution_id FROM user_institution_access
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Service role has full access to wa_settings"
  ON public.wa_settings FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_wa_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_wa_settings_updated_at ON public.wa_settings;

CREATE TRIGGER trigger_update_wa_settings_updated_at
  BEFORE UPDATE ON public.wa_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_wa_settings_updated_at();

COMMENT ON TABLE public.wa_settings IS 'Per-institution WhatsApp BYOW settings (rate limits, feature flags, notifications)';

-- ==========================================================================
-- 2. wa_message_logs — BYOW message tracking (not CRM campaigns)
-- ==========================================================================

CREATE TABLE IF NOT EXISTS public.wa_message_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL,           -- references wa_connections (created when connection service is wired)
  institution_id UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,

  -- Recipient info
  recipient_type TEXT NOT NULL DEFAULT 'individual'
    CHECK (recipient_type IN ('individual', 'group', 'bulk')),
  recipient_jid TEXT NOT NULL,
  recipient_name TEXT,
  recipient_count INTEGER NOT NULL DEFAULT 1,

  -- Message info
  message_type TEXT NOT NULL DEFAULT 'text'
    CHECK (message_type IN ('text', 'image', 'document', 'audio', 'video', 'template')),
  message_preview TEXT,
  template_id UUID,

  -- Status tracking
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'queued', 'sent', 'delivered', 'read', 'failed')),
  error_message TEXT,
  whatsapp_message_id TEXT,

  -- Who sent it
  sent_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE SET NULL,

  -- Timestamps
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_wa_message_logs_institution
  ON public.wa_message_logs(institution_id);

CREATE INDEX IF NOT EXISTS idx_wa_message_logs_connection
  ON public.wa_message_logs(connection_id);

CREATE INDEX IF NOT EXISTS idx_wa_message_logs_status
  ON public.wa_message_logs(status);

CREATE INDEX IF NOT EXISTS idx_wa_message_logs_sent_by
  ON public.wa_message_logs(sent_by);

CREATE INDEX IF NOT EXISTS idx_wa_message_logs_created_at
  ON public.wa_message_logs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_wa_message_logs_recipient_jid
  ON public.wa_message_logs(recipient_jid);

-- Composite index for common filter pattern
CREATE INDEX IF NOT EXISTS idx_wa_message_logs_institution_status_date
  ON public.wa_message_logs(institution_id, status, created_at DESC);

-- RLS
ALTER TABLE public.wa_message_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own institution message logs"
  ON public.wa_message_logs FOR SELECT
  USING (
    institution_id IN (
      SELECT institution_id FROM user_institution_access
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own institution message logs"
  ON public.wa_message_logs FOR INSERT
  WITH CHECK (
    institution_id IN (
      SELECT institution_id FROM user_institution_access
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own institution message logs"
  ON public.wa_message_logs FOR UPDATE
  USING (
    institution_id IN (
      SELECT institution_id FROM user_institution_access
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own institution message logs"
  ON public.wa_message_logs FOR DELETE
  USING (
    institution_id IN (
      SELECT institution_id FROM user_institution_access
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Service role has full access to wa_message_logs"
  ON public.wa_message_logs FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

COMMENT ON TABLE public.wa_message_logs IS 'Tracks messages sent via BYOW WhatsApp connections (distinct from admission_whatsapp_logs for CRM campaigns)';
COMMENT ON COLUMN public.wa_message_logs.connection_id IS 'References the BYOW connection used to send (wa_connections table)';
COMMENT ON COLUMN public.wa_message_logs.recipient_jid IS 'WhatsApp JID of the recipient (phone@s.whatsapp.net or group id)';
