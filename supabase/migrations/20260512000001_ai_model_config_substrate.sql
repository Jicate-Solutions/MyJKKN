-- ============================================================================
-- 20260512000001_ai_model_config_substrate.sql
-- AI Model Config: centralized model selection + spend caps + usage tracking
--
-- WHY: Multiple MyJKKN features call AI providers (OpenAI, Anthropic, Google,
-- Whisper) with hardcoded model_id strings scattered across files. Director
-- wants ONE place to swap models per feature, set monthly spend caps, and see
-- live usage / cost / success rate.
--
-- PATTERN: config-table-pattern (Spec #537 counselor rules-engine canonical):
--   - typed config table = source of truth
--   - super_admin UI writes (/admin/ai-models)
--   - reader fn called at runtime by every AI consumer
--   - audit log tracks every change (per feedback_audit_log_required.md)
--
-- TIER classification:
--   - Tables (this file, additive): TIER-0 safe-additive
--   - RLS policies (auth-touching): TIER-3 — apply via ephemeral branch first
--
-- IDEMPOTENT: CREATE TABLE IF NOT EXISTS + INSERT ... ON CONFLICT DO NOTHING
-- ============================================================================

-- ============================================================================
-- TABLE 1: ai_model_config — current model selection per feature
-- ============================================================================
CREATE TABLE IF NOT EXISTS ai_model_config (
  feature_key            text PRIMARY KEY,
  display_name           text NOT NULL,
  description            text,
  category               text,
  provider               text NOT NULL,
  model_id               text NOT NULL,
  fallback_provider      text,
  fallback_model_id      text,
  monthly_spend_cap_inr  numeric,
  is_active              boolean NOT NULL DEFAULT true,
  config_json            jsonb,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  updated_by             uuid REFERENCES auth.users(id),
  change_reason          text
);

COMMENT ON TABLE ai_model_config IS
  'Centralized AI model selection per feature. Director-tweakable via /admin/ai-models. Each row = one MyJKKN feature that calls an AI provider; runtime services consult this table to pick provider+model+config. Source of truth.';

COMMENT ON COLUMN ai_model_config.feature_key IS
  'Stable dotted slug (e.g. voice_memo.transcribe). Hardcoded into the consumer service. Never renamed once shipped.';
COMMENT ON COLUMN ai_model_config.provider IS
  'Provider slug — openai | anthropic | google | sarvam | whisper. See lib/services/platform/ai-providers.ts for the registry.';
COMMENT ON COLUMN ai_model_config.model_id IS
  'Provider-specific model id (e.g. gpt-4o-mini, claude-haiku-4-5, gemini-2.5-flash, whisper-1).';
COMMENT ON COLUMN ai_model_config.monthly_spend_cap_inr IS
  'Monthly spend cap in INR. Null = no cap. Cron consumer-side check (not enforced at DB level).';
COMMENT ON COLUMN ai_model_config.config_json IS
  'Per-model knobs (temperature, max_tokens, top_p, etc). Null falls back to provider defaults.';

-- ============================================================================
-- TABLE 2: ai_model_config_audit — change history
-- ============================================================================
CREATE TABLE IF NOT EXISTS ai_model_config_audit (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_key     text NOT NULL,
  old_provider    text,
  old_model_id    text,
  new_provider    text,
  new_model_id    text,
  old_config_json jsonb,
  new_config_json jsonb,
  change_reason   text,
  changed_by      uuid REFERENCES auth.users(id),
  changed_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_model_config_audit_feature_date
  ON ai_model_config_audit(feature_key, changed_at DESC);

COMMENT ON TABLE ai_model_config_audit IS
  'Append-only audit log: who changed which model for which feature, when, why. Driven by API route on PATCH (not by trigger — keeps reason capture explicit).';

-- ============================================================================
-- TABLE 3: ai_model_usage — per-invocation usage tracking
-- ============================================================================
CREATE TABLE IF NOT EXISTS ai_model_usage (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_key    text NOT NULL,
  provider       text NOT NULL,
  model_id       text NOT NULL,
  input_tokens   integer,
  output_tokens  integer,
  cost_inr       numeric,
  duration_ms    integer,
  success        boolean NOT NULL DEFAULT true,
  error_message  text,
  call_log_id    uuid,
  invoked_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_model_usage_feature_date
  ON ai_model_usage(feature_key, invoked_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_model_usage_invoked_at
  ON ai_model_usage(invoked_at DESC);

COMMENT ON TABLE ai_model_usage IS
  'Per-invocation usage row. Written by every AI consumer service after each call. Powers the "current usage / cost / success rate" panels in /admin/ai-models. Cost computed by consumer using provider pricing from lib/services/platform/ai-providers.ts.';

-- ============================================================================
-- updated_at trigger on ai_model_config
-- ============================================================================
CREATE OR REPLACE FUNCTION fn_ai_model_config_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ai_model_config_updated_at ON ai_model_config;
CREATE TRIGGER trg_ai_model_config_updated_at
  BEFORE UPDATE ON ai_model_config
  FOR EACH ROW
  EXECUTE FUNCTION fn_ai_model_config_set_updated_at();

-- ============================================================================
-- RLS — TIER-3 (auth-touching). Apply via ephemeral branch dry-run first.
-- ============================================================================
ALTER TABLE ai_model_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_model_config_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_model_usage ENABLE ROW LEVEL SECURITY;

-- ai_model_config: SELECT super_admin only
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='ai_model_config' AND policyname='ai_model_config_read_super_admin'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "ai_model_config_read_super_admin"
        ON ai_model_config FOR SELECT
        TO authenticated
        USING (
          EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
              AND profiles.role = 'super_admin'
          )
        )
    $policy$;
  END IF;
END $$;

-- ai_model_config: INSERT/UPDATE/DELETE super_admin only
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='ai_model_config' AND policyname='ai_model_config_write_super_admin'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "ai_model_config_write_super_admin"
        ON ai_model_config FOR ALL
        TO authenticated
        USING (
          EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
              AND profiles.role = 'super_admin'
          )
        )
        WITH CHECK (
          EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
              AND profiles.role = 'super_admin'
          )
        )
    $policy$;
  END IF;
END $$;

-- ai_model_config_audit: SELECT super_admin, INSERT super_admin (server writes via PATCH route)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='ai_model_config_audit' AND policyname='ai_model_config_audit_read_super_admin'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "ai_model_config_audit_read_super_admin"
        ON ai_model_config_audit FOR SELECT
        TO authenticated
        USING (
          EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
              AND profiles.role = 'super_admin'
          )
        )
    $policy$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='ai_model_config_audit' AND policyname='ai_model_config_audit_insert_super_admin'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "ai_model_config_audit_insert_super_admin"
        ON ai_model_config_audit FOR INSERT
        TO authenticated
        WITH CHECK (
          EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
              AND profiles.role = 'super_admin'
          )
        )
    $policy$;
  END IF;
END $$;

-- ai_model_usage: SELECT super_admin only
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='ai_model_usage' AND policyname='ai_model_usage_read_super_admin'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "ai_model_usage_read_super_admin"
        ON ai_model_usage FOR SELECT
        TO authenticated
        USING (
          EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
              AND profiles.role = 'super_admin'
          )
        )
    $policy$;
  END IF;
END $$;

-- ai_model_usage: INSERT — service_role bypasses RLS by default. Authenticated-user
-- inserts also allowed for paths where the AI call happens in a server route on
-- behalf of the user (matches the consumer-side recordUsage() pattern).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='ai_model_usage' AND policyname='ai_model_usage_insert_authenticated'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "ai_model_usage_insert_authenticated"
        ON ai_model_usage FOR INSERT
        TO authenticated
        WITH CHECK (true)
    $policy$;
  END IF;
END $$;

-- ============================================================================
-- SEED — initial 5 features (current empirical AI use in MyJKKN)
-- ============================================================================
INSERT INTO ai_model_config (feature_key, display_name, description, category, provider, model_id) VALUES
  ('voice_memo.transcribe',
   'Voice Memo Transcription',
   'Counselor 30-second voice memos → text (English-only). Powers Lead Mood Digest.',
   'admission',
   'openai',
   'whisper-1'),
  ('voice_memo.sentiment',
   'Voice Memo Sentiment Analysis',
   'Extract sentiment, summary, categories from transcribed memos.',
   'admission',
   'openai',
   'gpt-4o-mini'),
  ('admission.briefing',
   'Counselor Daily Briefing',
   'Daily AI-generated briefing per counselor — what to focus on today.',
   'admission',
   'openai',
   'gpt-4o-mini'),
  ('admission.ai_insights',
   'Admission AI Insights',
   'Lead funnel insights and counselor recommendations.',
   'admission',
   'openai',
   'gpt-4o-mini'),
  ('ai_pulse.anomaly_detection',
   'AI Pulse Anomaly Detection',
   'Detect outliers in pulse data (drops, spikes, unusual patterns).',
   'ai_pulse',
   'openai',
   'gpt-4o-mini')
ON CONFLICT (feature_key) DO NOTHING;
