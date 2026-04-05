-- ================================================================
-- Call Intelligence Pipeline — Schema
-- Migration: 012_call_intelligence_pipeline.sql
-- ================================================================

-- 1. Call Intelligence (transcription, sentiment, summary per call)
CREATE TABLE IF NOT EXISTS admission_call_intelligence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES institutions(id),
  call_log_id UUID NOT NULL REFERENCES admission_call_logs(id) ON DELETE CASCADE,
  call_sid TEXT NOT NULL,

  -- ExoVoiceAnalyze job tracking
  analyze_job_id TEXT,
  analyze_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (analyze_status IN ('pending', 'submitted', 'processing', 'completed', 'failed')),
  analyze_submitted_at TIMESTAMPTZ,
  analyze_completed_at TIMESTAMPTZ,

  -- Results
  transcription TEXT,
  transcription_language TEXT,
  sentiment TEXT CHECK (sentiment IN ('positive', 'negative', 'neutral', NULL)),
  sentiment_score NUMERIC(3,2),  -- -1.00 to 1.00
  summary TEXT,
  categories TEXT[],  -- array of category tags

  -- Enrichment extraction
  extracted_name TEXT,
  extracted_location TEXT,
  extracted_course TEXT,
  enrichment_applied BOOLEAN DEFAULT FALSE,
  enrichment_applied_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_call_intel_call_log ON admission_call_intelligence(call_log_id);
CREATE INDEX idx_call_intel_institution ON admission_call_intelligence(institution_id);
CREATE INDEX idx_call_intel_status ON admission_call_intelligence(analyze_status)
  WHERE analyze_status NOT IN ('completed', 'failed');
CREATE UNIQUE INDEX idx_call_intel_call_sid ON admission_call_intelligence(call_sid);

-- 2. Callback Queue (missed call follow-up tracking)
CREATE TABLE IF NOT EXISTS admission_callback_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES institutions(id),
  call_log_id UUID NOT NULL REFERENCES admission_call_logs(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES admission_leads(id),
  assigned_counselor_id UUID REFERENCES profiles(id),

  caller_number TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_progress', 'completed', 'expired', 'cancelled')),

  -- Context
  missed_count_7d INTEGER DEFAULT 1,
  ever_connected BOOLEAN DEFAULT FALSE,
  escalated BOOLEAN DEFAULT FALSE,
  escalated_at TIMESTAMPTZ,

  -- Resolution
  callback_call_id UUID REFERENCES admission_call_logs(id),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES profiles(id),
  resolution_notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_callback_queue_institution ON admission_callback_queue(institution_id);
CREATE INDEX idx_callback_queue_status ON admission_callback_queue(status)
  WHERE status IN ('pending', 'in_progress');
CREATE INDEX idx_callback_queue_priority ON admission_callback_queue(priority, created_at)
  WHERE status = 'pending';
CREATE INDEX idx_callback_queue_caller ON admission_callback_queue(caller_number);

-- 3. Telephony Health Events (ExoPhone monitoring)
CREATE TABLE IF NOT EXISTS telephony_health_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status_type TEXT NOT NULL CHECK (status_type IN ('OK', 'WARNING', 'CRITICAL', 'PAYLOAD_TOO_LARGE')),
  connectivity_status TEXT,  -- active, major_outage, partial_network_outage
  incoming_affected TEXT[],  -- ExoPhone SIDs
  outgoing_affected TEXT[],
  alternate_exophones JSONB,
  raw_payload JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_health_events_created ON telephony_health_events(created_at DESC);
CREATE INDEX idx_health_events_status ON telephony_health_events(status_type)
  WHERE status_type IN ('WARNING', 'CRITICAL');

-- 4. Institution Call Settings (per-institution pipeline config)
CREATE TABLE IF NOT EXISTS institution_call_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES institutions(id) UNIQUE,

  -- Auto-SMS settings
  auto_sms_enabled BOOLEAN DEFAULT TRUE,
  auto_sms_template TEXT DEFAULT 'Thank you for calling JKKN. A counselor will call you back shortly.',
  auto_sms_sender_id TEXT,  -- ExoPhone or Sender ID for SMS
  dlt_entity_id TEXT,
  dlt_template_id TEXT,

  -- Pipeline settings
  auto_transcribe_enabled BOOLEAN DEFAULT TRUE,
  auto_enrich_leads BOOLEAN DEFAULT TRUE,
  repeat_detection_window_days INTEGER DEFAULT 7,
  escalation_threshold INTEGER DEFAULT 3,  -- missed calls before escalation

  -- Callback settings
  callback_auto_assign BOOLEAN DEFAULT FALSE,
  callback_expiry_hours INTEGER DEFAULT 48,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Add pipeline columns to admission_call_logs
ALTER TABLE admission_call_logs
  ADD COLUMN IF NOT EXISTS pipeline_stage TEXT DEFAULT 'captured'
    CHECK (pipeline_stage IN ('captured', 'classified', 'matched', 'intelligence', 'enriched', 'responded', 'complete')),
  ADD COLUMN IF NOT EXISTS intelligence_id UUID REFERENCES admission_call_intelligence(id),
  ADD COLUMN IF NOT EXISTS auto_sms_sent BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS auto_sms_sid TEXT,
  ADD COLUMN IF NOT EXISTS callback_queued BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS callback_queue_id UUID REFERENCES admission_callback_queue(id);

CREATE INDEX idx_call_logs_pipeline ON admission_call_logs(pipeline_stage)
  WHERE pipeline_stage NOT IN ('complete');

-- 6. Update triggers
CREATE OR REPLACE FUNCTION update_call_intelligence_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_call_intelligence_updated
  BEFORE UPDATE ON admission_call_intelligence
  FOR EACH ROW EXECUTE FUNCTION update_call_intelligence_timestamp();

CREATE TRIGGER trg_callback_queue_updated
  BEFORE UPDATE ON admission_callback_queue
  FOR EACH ROW EXECUTE FUNCTION update_call_intelligence_timestamp();

CREATE TRIGGER trg_institution_call_settings_updated
  BEFORE UPDATE ON institution_call_settings
  FOR EACH ROW EXECUTE FUNCTION update_call_intelligence_timestamp();

-- 7. RLS policies
ALTER TABLE admission_call_intelligence ENABLE ROW LEVEL SECURITY;
ALTER TABLE admission_callback_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE telephony_health_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE institution_call_settings ENABLE ROW LEVEL SECURITY;

-- Service role full access (API routes use service role)
CREATE POLICY "service_role_all_call_intel" ON admission_call_intelligence
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_callback_queue" ON admission_callback_queue
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_health_events" ON telephony_health_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_call_settings" ON institution_call_settings
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Authenticated users: read own institution's data
CREATE POLICY "auth_read_call_intel" ON admission_call_intelligence
  FOR SELECT TO authenticated
  USING (institution_id IN (
    SELECT institution_id FROM user_institutions WHERE user_id = auth.uid()
  ));
CREATE POLICY "auth_read_callback_queue" ON admission_callback_queue
  FOR SELECT TO authenticated
  USING (institution_id IN (
    SELECT institution_id FROM user_institutions WHERE user_id = auth.uid()
  ));
CREATE POLICY "auth_read_health_events" ON telephony_health_events
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_read_call_settings" ON institution_call_settings
  FOR SELECT TO authenticated
  USING (institution_id IN (
    SELECT institution_id FROM user_institutions WHERE user_id = auth.uid()
  ));
