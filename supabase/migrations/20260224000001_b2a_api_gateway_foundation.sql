-- ============================================================
-- B2A API Gateway Foundation
-- Migration: 20260224000001
-- Created: 2026-02-24
-- ============================================================

-- 1. Add institution binding to api_keys
-- This scopes an API key to one institution. NULL = all institutions (super key).
ALTER TABLE public.api_keys
  ADD COLUMN IF NOT EXISTS institution_id UUID REFERENCES institutions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_api_keys_institution_id
  ON api_keys(institution_id);

-- 2. API Key Usage Logs (audit trail for B2A routes)
CREATE TABLE IF NOT EXISTS public.api_key_usage_logs (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id      UUID        NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
  endpoint        TEXT        NOT NULL,
  module          TEXT        NOT NULL,
  institution_id  UUID        REFERENCES institutions(id),
  status_code     INTEGER     NOT NULL,
  response_time_ms INTEGER NOT NULL DEFAULT 0,
  ip_address      INET,
  user_agent      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_api_key_usage_key_id  ON api_key_usage_logs(api_key_id);
CREATE INDEX idx_api_key_usage_created ON api_key_usage_logs(created_at DESC);
CREATE INDEX idx_api_key_usage_module  ON api_key_usage_logs(module);

-- Composite index: lookup logs by key within a time window (most common B2A audit query)
CREATE INDEX idx_api_key_usage_key_created
  ON api_key_usage_logs(api_key_id, created_at DESC);

-- 3. RLS on usage logs
ALTER TABLE api_key_usage_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages usage logs"
  ON api_key_usage_logs FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Admins view usage logs"
  ON api_key_usage_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role = 'super_admin'
    )
    OR
    EXISTS (
      SELECT 1 FROM profiles p
      JOIN user_institution_access uia ON uia.user_id = p.id
      WHERE p.id = auth.uid()
        AND p.role = 'admin'
        AND uia.institution_id = api_key_usage_logs.institution_id
    )
  );

-- 4. Document the new permissions and institution_id columns
COMMENT ON COLUMN api_keys.permissions IS
  'JSONB. New format: {"read":["admission","attendance"],"write":[]}. Legacy: {"read":true} = all modules.';

COMMENT ON COLUMN api_keys.institution_id IS
  'If set, key is scoped to this institution only. NULL = all institutions (requires institutionId query param).';
