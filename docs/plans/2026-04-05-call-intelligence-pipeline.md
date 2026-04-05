# Call Intelligence Pipeline — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Transform the calls page from a data viewer into an intelligence engine — every call (answered or missed) automatically enriches leads, triggers responses, and surfaces insights via an 8-stage pipeline.

**Architecture:** Webhook = fast path (real-time), existing 5-min cron = sweep/retry. ExoVoiceAnalyze (async) for transcription/sentiment/summary on answered calls. Auto-SMS + callback queue for missed calls. All pipeline state tracked per-call via `pipeline_stage` column. Services follow existing static-method pattern with injected supabase client.

**Tech Stack:** Next.js 16 App Router, Supabase (PostgreSQL + RLS), React Query, Exotel REST APIs (v1 form-encoded), ExoVoiceAnalyze GenAI API (async webhook).

**Spec:** `docs/SPEC-CALL-INTELLIGENCE-PIPELINE.md`
**API Reference:** `docs/exotel-api-reference.md` (93 endpoints inventoried)

---

## Phase 1: Database Foundation (sequential — everything depends on this)

---

### Task 1.1: Migration — Call Intelligence Tables + Columns

**Files:**
- Create: `supabase/migrations/admission/012_call_intelligence_pipeline.sql`

**Step 1: Write migration SQL**

```sql
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
```

**Step 2: Push migration to Supabase**

Run: `cd /Users/omm/PROJECTS/MyJKKN && ~/bin/supabase db push --project-ref <project-ref>`
Expected: Migration applied, 4 new tables + columns added.

**Step 3: Generate updated types**

Run: `~/bin/supabase gen types typescript --project-id <project-id> > lib/types/database.ts`
Expected: New table types visible in `database.ts`.

**Step 4: Commit**

```bash
git add supabase/migrations/admission/012_call_intelligence_pipeline.sql lib/types/database.ts
git commit -m "feat(telephony): add call intelligence pipeline schema — 4 tables + pipeline columns"
```

---

## Phase 2: ExotelClient + Pipeline Service (sequential — services before routes)

---

### Task 2.1: Add `analyzeCall()` to ExotelClient

**Files:**
- Modify: `lib/services/telephony/exotel-client.ts`

**Step 1: Add types after existing `ExotelSmsResponse` interface (~line 83)**

```typescript
export interface AnalyzeCallParams {
  callSid: string;
  tasks: ('transcript' | 'summarization' | 'sentiment' | 'categorise')[];
  callbackUrl: string;
  categories?: string[];  // for 'categorise' task
}

export interface AnalyzeCallResponse {
  request_id: string;
  status: string;
}

export interface ExoVoiceAnalyzeWebhookPayload {
  call_sid: string;
  request_id: string;
  status: 'completed' | 'failed';
  insights: {
    transcript?: {
      text: string;
      language: string;
    };
    summarization?: {
      summary: string;
    };
    sentiment?: {
      label: 'positive' | 'negative' | 'neutral';
      score: number;
    };
    categorise?: {
      categories: string[];
    };
  };
  error?: string;
}
```

**Step 2: Add `analyzeCall()` method after `sendSms()` (~line 301)**

```typescript
  /**
   * Submit call recording for AI analysis via ExoVoiceAnalyze.
   * Async: POST returns job_id, results arrive at callbackUrl webhook.
   * Endpoint: POST /v1/Accounts/{sid}/Calls/{callSid}/ExoVoiceAnalyze.json
   */
  static async analyzeCall(params: AnalyzeCallParams): Promise<AnalyzeCallResponse> {
    const body: Record<string, string> = {
      InsightTasks: params.tasks.join(','),
      CallbackUrl: params.callbackUrl,
    };

    if (params.categories?.length) {
      body.Categories = params.categories.join(',');
    }

    return this.request<AnalyzeCallResponse>(
      'POST',
      `/Calls/${params.callSid}/ExoVoiceAnalyze.json`,
      body
    );
  }
```

**Step 3: Verify types compile**

Run: `cd /Users/omm/PROJECTS/MyJKKN && npx tsc --noEmit 2>&1 | grep exotel-client`
Expected: No errors.

**Step 4: Commit**

```bash
git add lib/services/telephony/exotel-client.ts
git commit -m "feat(telephony): add ExoVoiceAnalyze analyzeCall() method to ExotelClient"
```

---

### Task 2.2: Create CallPipelineService

**Files:**
- Create: `lib/services/telephony/call-pipeline-service.ts`

**Step 1: Write the pipeline service**

```typescript
import { SupabaseClient } from '@supabase/supabase-js';
import { ExotelClient, AnalyzeCallParams } from './exotel-client';

const PIPELINE_STAGES = ['captured', 'classified', 'matched', 'intelligence', 'enriched', 'responded', 'complete'] as const;
type PipelineStage = typeof PIPELINE_STAGES[number];

interface PipelineContext {
  callLogId: string;
  callSid: string;
  institutionId: string;
  direction: 'inbound' | 'outbound';
  status: string;
  fromNumber: string;
  toNumber: string;
  durationSeconds: number;
  costAmount: number;
  recordingUrl?: string;
  leadId?: string;
  counselorId?: string;
}

interface PipelineResult {
  stage: PipelineStage;
  intelligenceId?: string;
  callbackQueueId?: string;
  autoSmsSent?: boolean;
  error?: string;
}

export class CallPipelineService {
  /**
   * Run the full pipeline for a single call.
   * Called from: handleCallStatusCallback() on terminal status,
   *              createInboundCallLog() after processCallIntelligence().
   *
   * Stages 1-4 (capture/classify/match/intelligence) are already handled by
   * TelephonyService. This service handles Stages 5-6 (enrich/respond).
   */
  static async runPipeline(
    ctx: PipelineContext,
    supabase: SupabaseClient
  ): Promise<PipelineResult> {
    try {
      // Load institution settings
      const settings = await this.getSettings(ctx.institutionId, supabase);

      const isAnswered = ctx.costAmount > 0 && ctx.durationSeconds > 0;
      const isMissed = !isAnswered && ctx.direction === 'inbound';

      // Stage 5: ENRICH (answered calls with recordings)
      let intelligenceId: string | undefined;
      if (isAnswered && ctx.recordingUrl && settings.auto_transcribe_enabled) {
        intelligenceId = await this.submitForAnalysis(ctx, supabase);
      }

      // Stage 6: RESPOND (missed inbound calls)
      let callbackQueueId: string | undefined;
      let autoSmsSent = false;
      if (isMissed) {
        // Auto-SMS
        if (settings.auto_sms_enabled && ctx.fromNumber) {
          autoSmsSent = await this.sendMissedCallSms(ctx, settings, supabase);
        }
        // Callback queue
        callbackQueueId = await this.queueCallback(ctx, settings, supabase);
      }

      // Update call log with pipeline results
      const finalStage: PipelineStage = isMissed ? 'responded' : (intelligenceId ? 'enriched' : 'complete');
      await supabase
        .from('admission_call_logs')
        .update({
          pipeline_stage: finalStage,
          intelligence_id: intelligenceId ?? null,
          auto_sms_sent: autoSmsSent,
          callback_queued: !!callbackQueueId,
          callback_queue_id: callbackQueueId ?? null,
        })
        .eq('id', ctx.callLogId);

      return { stage: finalStage, intelligenceId, callbackQueueId, autoSmsSent };
    } catch (error) {
      console.error('[CallPipeline] Error:', error);
      return { stage: 'intelligence', error: String(error) };
    }
  }

  /**
   * Submit answered call for ExoVoiceAnalyze transcription/sentiment/summary.
   * Returns intelligence record ID. Results arrive async via webhook.
   */
  private static async submitForAnalysis(
    ctx: PipelineContext,
    supabase: SupabaseClient
  ): Promise<string | undefined> {
    try {
      // Create intelligence record
      const { data: intel, error: insertError } = await supabase
        .from('admission_call_intelligence')
        .insert({
          institution_id: ctx.institutionId,
          call_log_id: ctx.callLogId,
          call_sid: ctx.callSid,
          analyze_status: 'submitted',
          analyze_submitted_at: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (insertError || !intel) {
        console.error('[CallPipeline] Failed to create intelligence record:', insertError);
        return undefined;
      }

      // Build callback URL
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL;
      const webhookToken = process.env.EXOTEL_API_TOKEN;
      const callbackUrl = `${baseUrl}/api/webhooks/telephony/intelligence?token=${webhookToken}`;

      // Submit to ExoVoiceAnalyze
      const response = await ExotelClient.analyzeCall({
        callSid: ctx.callSid,
        tasks: ['transcript', 'summarization', 'sentiment', 'categorise'],
        callbackUrl,
        categories: [
          'admission_inquiry', 'fee_inquiry', 'course_inquiry',
          'placement_inquiry', 'complaint', 'follow_up', 'other'
        ],
      });

      // Update with job ID
      await supabase
        .from('admission_call_intelligence')
        .update({
          analyze_job_id: response.request_id,
          analyze_status: 'processing',
        })
        .eq('id', intel.id);

      return intel.id;
    } catch (error) {
      console.error('[CallPipeline] ExoVoiceAnalyze submit failed:', error);
      return undefined;
    }
  }

  /**
   * Send auto-SMS to missed caller.
   */
  private static async sendMissedCallSms(
    ctx: PipelineContext,
    settings: InstitutionCallSettings,
    supabase: SupabaseClient
  ): Promise<boolean> {
    try {
      if (!settings.auto_sms_sender_id) {
        console.warn('[CallPipeline] No SMS sender ID configured for institution', ctx.institutionId);
        return false;
      }

      const response = await ExotelClient.sendSms({
        from: settings.auto_sms_sender_id,
        to: ctx.fromNumber,
        body: settings.auto_sms_template,
        dltEntityId: settings.dlt_entity_id ?? undefined,
        dltTemplateId: settings.dlt_template_id ?? undefined,
        smsType: 'transactional',
        priority: 'high',
        customField: ctx.callLogId,
      });

      // Track SMS SID on call log
      await supabase
        .from('admission_call_logs')
        .update({ auto_sms_sid: response.SMSMessage?.Sid })
        .eq('id', ctx.callLogId);

      return true;
    } catch (error) {
      console.error('[CallPipeline] Auto-SMS failed:', error);
      return false;
    }
  }

  /**
   * Create callback queue entry for missed call.
   * Checks 7-day history for repeat detection and escalation.
   */
  private static async queueCallback(
    ctx: PipelineContext,
    settings: InstitutionCallSettings,
    supabase: SupabaseClient
  ): Promise<string | undefined> {
    try {
      const windowDays = settings.repeat_detection_window_days;
      const windowStart = new Date();
      windowStart.setDate(windowStart.getDate() - windowDays);

      // Count missed calls in window
      const { data: recentCalls } = await supabase
        .from('admission_call_logs')
        .select('id, cost_amount, duration_seconds')
        .eq('from_number', ctx.fromNumber)
        .eq('direction', 'inbound')
        .gte('created_at', windowStart.toISOString())
        .order('created_at', { ascending: false });

      const missedCount = (recentCalls || []).filter(c =>
        (c.cost_amount ?? 0) <= 0 && (c.duration_seconds ?? 0) === 0
      ).length;

      const everConnected = (recentCalls || []).some(c =>
        (c.cost_amount ?? 0) > 0 || (c.duration_seconds ?? 0) > 0
      );

      // Determine priority
      let priority: 'low' | 'normal' | 'high' | 'urgent' = 'normal';
      if (missedCount >= settings.escalation_threshold) priority = 'urgent';
      else if (missedCount >= 2 && !everConnected) priority = 'high';
      else if (missedCount >= 1) priority = 'normal';

      const shouldEscalate = missedCount >= settings.escalation_threshold;

      // Check for existing pending callback for this caller
      const { data: existing } = await supabase
        .from('admission_callback_queue')
        .select('id, missed_count_7d, priority')
        .eq('caller_number', ctx.fromNumber)
        .eq('status', 'pending')
        .single();

      let callbackId: string;

      if (existing) {
        // Update existing entry with higher priority
        const newPriority = this.higherPriority(existing.priority, priority);
        await supabase
          .from('admission_callback_queue')
          .update({
            missed_count_7d: missedCount,
            priority: newPriority,
            escalated: shouldEscalate,
            escalated_at: shouldEscalate ? new Date().toISOString() : null,
            call_log_id: ctx.callLogId,  // point to latest missed call
          })
          .eq('id', existing.id);
        callbackId = existing.id;
      } else {
        // Create new entry
        const { data: entry, error } = await supabase
          .from('admission_callback_queue')
          .insert({
            institution_id: ctx.institutionId,
            call_log_id: ctx.callLogId,
            lead_id: ctx.leadId ?? null,
            caller_number: ctx.fromNumber,
            priority,
            missed_count_7d: missedCount,
            ever_connected: everConnected,
            escalated: shouldEscalate,
            escalated_at: shouldEscalate ? new Date().toISOString() : null,
          })
          .select('id')
          .single();

        if (error || !entry) {
          console.error('[CallPipeline] Failed to create callback entry:', error);
          return undefined;
        }
        callbackId = entry.id;
      }

      return callbackId;
    } catch (error) {
      console.error('[CallPipeline] Callback queue failed:', error);
      return undefined;
    }
  }

  /**
   * Sweep: retry failed pipeline stages and backfill.
   * Called from 5-min cron after CDR sync.
   */
  static async sweepPipeline(supabase: SupabaseClient): Promise<{ retried: number; errors: string[] }> {
    const errors: string[] = [];
    let retried = 0;

    // Find calls stuck in early pipeline stages (not complete, not enriched/responded)
    const { data: stuckCalls } = await supabase
      .from('admission_call_logs')
      .select('id, call_sid, institution_id, direction, status, from_number, to_number, duration_seconds, cost_amount, recording_url, lead_id, counselor_id, pipeline_stage')
      .in('pipeline_stage', ['captured', 'classified', 'matched', 'intelligence'])
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())  // last 24h
      .order('created_at', { ascending: true })
      .limit(50);

    if (!stuckCalls?.length) return { retried: 0, errors: [] };

    for (const call of stuckCalls) {
      try {
        await this.runPipeline({
          callLogId: call.id,
          callSid: call.call_sid,
          institutionId: call.institution_id,
          direction: call.direction as 'inbound' | 'outbound',
          status: call.status,
          fromNumber: call.from_number,
          toNumber: call.to_number,
          durationSeconds: call.duration_seconds ?? 0,
          costAmount: call.cost_amount ?? 0,
          recordingUrl: call.recording_url ?? undefined,
          leadId: call.lead_id ?? undefined,
          counselorId: call.counselor_id ?? undefined,
        }, supabase);
        retried++;
      } catch (error) {
        errors.push(`${call.id}: ${String(error)}`);
      }
    }

    return { retried, errors };
  }

  /**
   * Load institution call settings with defaults.
   */
  private static async getSettings(
    institutionId: string,
    supabase: SupabaseClient
  ): Promise<InstitutionCallSettings> {
    const { data } = await supabase
      .from('institution_call_settings')
      .select('*')
      .eq('institution_id', institutionId)
      .single();

    return data ?? {
      auto_sms_enabled: true,
      auto_sms_template: 'Thank you for calling JKKN. A counselor will call you back shortly.',
      auto_sms_sender_id: null,
      dlt_entity_id: null,
      dlt_template_id: null,
      auto_transcribe_enabled: true,
      auto_enrich_leads: true,
      repeat_detection_window_days: 7,
      escalation_threshold: 3,
      callback_auto_assign: false,
      callback_expiry_hours: 48,
    };
  }

  private static higherPriority(a: string, b: string): string {
    const order = { low: 0, normal: 1, high: 2, urgent: 3 };
    return (order[b as keyof typeof order] ?? 0) > (order[a as keyof typeof order] ?? 0) ? b : a;
  }
}

interface InstitutionCallSettings {
  auto_sms_enabled: boolean;
  auto_sms_template: string;
  auto_sms_sender_id: string | null;
  dlt_entity_id: string | null;
  dlt_template_id: string | null;
  auto_transcribe_enabled: boolean;
  auto_enrich_leads: boolean;
  repeat_detection_window_days: number;
  escalation_threshold: number;
  callback_auto_assign: boolean;
  callback_expiry_hours: number;
}
```

**Step 2: Verify types compile**

Run: `cd /Users/omm/PROJECTS/MyJKKN && npx tsc --noEmit 2>&1 | grep call-pipeline`
Expected: No errors.

**Step 3: Commit**

```bash
git add lib/services/telephony/call-pipeline-service.ts
git commit -m "feat(telephony): add CallPipelineService — pipeline orchestrator with sweep"
```

---

### Task 2.3: Create CallEnrichmentService

**Files:**
- Create: `lib/services/telephony/call-enrichment-service.ts`

**Step 1: Write the enrichment service**

```typescript
import { SupabaseClient } from '@supabase/supabase-js';

interface EnrichmentResult {
  name?: string;
  location?: string;
  course?: string;
  applied: boolean;
}

/**
 * Extract name, course, and location from call transcription text
 * using deterministic keyword patterns (not AI).
 * Fast and predictable — regex for "my name is X", "B.Pharm", "from Chennai".
 */
export class CallEnrichmentService {
  // Course patterns: pharmacy, nursing, engineering, arts, etc.
  private static readonly COURSE_PATTERNS: { pattern: RegExp; course: string }[] = [
    { pattern: /\bb\.?\s*pharm(?:acy)?\b/i, course: 'B.Pharm' },
    { pattern: /\bd\.?\s*pharm(?:acy)?\b/i, course: 'D.Pharm' },
    { pattern: /\bm\.?\s*pharm(?:acy)?\b/i, course: 'M.Pharm' },
    { pattern: /\bpharm\.?\s*d\b/i, course: 'Pharm.D' },
    { pattern: /\bb\.?\s*sc\b.*\bnurs/i, course: 'B.Sc Nursing' },
    { pattern: /\bm\.?\s*sc\b.*\bnurs/i, course: 'M.Sc Nursing' },
    { pattern: /\bgnm\b/i, course: 'GNM' },
    { pattern: /\bb\.?\s*tech\b/i, course: 'B.Tech' },
    { pattern: /\bm\.?\s*tech\b/i, course: 'M.Tech' },
    { pattern: /\bb\.?\s*e\.?\b/i, course: 'B.E' },
    { pattern: /\bmba\b/i, course: 'MBA' },
    { pattern: /\bmca\b/i, course: 'MCA' },
    { pattern: /\bb\.?\s*com\b/i, course: 'B.Com' },
    { pattern: /\bb\.?\s*sc\b/i, course: 'B.Sc' },
    { pattern: /\bb\.?\s*a\.?\b/i, course: 'B.A' },
    { pattern: /\bbpt\b/i, course: 'BPT' },
    { pattern: /\bmlsc\b|medical lab/i, course: 'BMLS' },
    { pattern: /\bradio(?:graphy|logy)\b/i, course: 'B.Sc Radiography' },
    { pattern: /\boptometr/i, course: 'B.Sc Optometry' },
    { pattern: /\banesthe/i, course: 'B.Sc Anesthesia' },
    { pattern: /\bdialysis\b/i, course: 'B.Sc Dialysis' },
    { pattern: /\bphysio/i, course: 'BPT' },
  ];

  // Tamil Nadu cities and districts
  private static readonly LOCATION_PATTERNS: string[] = [
    'Chennai', 'Coimbatore', 'Madurai', 'Trichy', 'Tiruchirappalli',
    'Salem', 'Tirunelveli', 'Erode', 'Namakkal', 'Karur',
    'Thanjavur', 'Dindigul', 'Vellore', 'Thoothukudi', 'Tirupur',
    'Cuddalore', 'Kanchipuram', 'Tiruvallur', 'Villupuram',
    'Ramanathapuram', 'Sivaganga', 'Virudhunagar', 'Theni',
    'Perambalur', 'Ariyalur', 'Krishnagiri', 'Dharmapuri',
    'Nilgiris', 'Pudukkottai', 'Nagapattinam', 'Thiruvarur',
    'Kovilpatti', 'Kumarapalayam', 'Rasipuram', 'Tiruchengode',
    'Paramathi', 'Velur', 'Bangalore', 'Bengaluru', 'Hyderabad',
    'Kerala', 'Kochi', 'Calicut', 'Pondicherry', 'Puducherry',
  ];

  /**
   * Extract structured data from transcription text.
   */
  static extractFromTranscription(text: string): EnrichmentResult {
    if (!text || text.trim().length < 10) {
      return { applied: false };
    }

    const name = this.extractName(text);
    const course = this.extractCourse(text);
    const location = this.extractLocation(text);

    return {
      name: name ?? undefined,
      course: course ?? undefined,
      location: location ?? undefined,
      applied: !!(name || course || location),
    };
  }

  /**
   * Apply extracted data to a lead record.
   * Only updates fields that are currently empty/generic.
   */
  static async applyToLead(
    leadId: string,
    enrichment: EnrichmentResult,
    intelligenceId: string,
    supabase: SupabaseClient
  ): Promise<boolean> {
    if (!enrichment.applied) return false;

    // Fetch current lead
    const { data: lead } = await supabase
      .from('admission_leads')
      .select('first_name, city, interested_course')
      .eq('id', leadId)
      .single();

    if (!lead) return false;

    const updates: Record<string, string> = {};

    // Only overwrite if current value is generic (Caller XXXX) or empty
    if (enrichment.name && (!lead.first_name || /^Caller\s+\d+$/i.test(lead.first_name))) {
      updates.first_name = enrichment.name;
    }
    if (enrichment.location && !lead.city) {
      updates.city = enrichment.location;
    }
    if (enrichment.course && !lead.interested_course) {
      updates.interested_course = enrichment.course;
    }

    if (Object.keys(updates).length === 0) return false;

    const { error } = await supabase
      .from('admission_leads')
      .update(updates)
      .eq('id', leadId);

    if (!error) {
      // Mark enrichment as applied
      await supabase
        .from('admission_call_intelligence')
        .update({
          enrichment_applied: true,
          enrichment_applied_at: new Date().toISOString(),
        })
        .eq('id', intelligenceId);
    }

    return !error;
  }

  private static extractName(text: string): string | null {
    // "my name is X", "I am X", "this is X calling"
    const patterns = [
      /my name is\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
      /(?:I am|I'm)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
      /this is\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:calling|speaking|here)/i,
      /(?:call me|name)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
    ];

    for (const p of patterns) {
      const match = text.match(p);
      if (match?.[1]) {
        const name = match[1].trim();
        // Skip generic words
        if (!['Sir', 'Madam', 'Hello', 'Please', 'Thank', 'Good'].includes(name)) {
          return name;
        }
      }
    }
    return null;
  }

  private static extractCourse(text: string): string | null {
    for (const { pattern, course } of this.COURSE_PATTERNS) {
      if (pattern.test(text)) return course;
    }
    return null;
  }

  private static extractLocation(text: string): string | null {
    const lowerText = text.toLowerCase();
    // "from X", "in X", "at X", or just the city name
    for (const city of this.LOCATION_PATTERNS) {
      const fromPattern = new RegExp(`(?:from|in|at|near)\\s+${city}`, 'i');
      if (fromPattern.test(text)) return city;
    }
    // Fallback: just check if city name appears
    for (const city of this.LOCATION_PATTERNS) {
      if (lowerText.includes(city.toLowerCase())) return city;
    }
    return null;
  }
}
```

**Step 2: Verify types compile**

Run: `cd /Users/omm/PROJECTS/MyJKKN && npx tsc --noEmit 2>&1 | grep call-enrichment`
Expected: No errors.

**Step 3: Commit**

```bash
git add lib/services/telephony/call-enrichment-service.ts
git commit -m "feat(telephony): add CallEnrichmentService — keyword extraction for name/course/location"
```

---

## Phase 3: Webhook Handlers + API Routes (can be parallel — independent routes)

---

### Task 3.1: ExoVoiceAnalyze Webhook Handler

**Files:**
- Create: `app/api/webhooks/telephony/intelligence/route.ts`

**Step 1: Write the webhook handler**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { ExoVoiceAnalyzeWebhookPayload } from '@/lib/services/telephony/exotel-client';
import { CallEnrichmentService } from '@/lib/services/telephony/call-enrichment-service';
import crypto from 'crypto';

export async function POST(request: NextRequest) {
  // Auth: token param or header (same pattern as main webhook)
  const token = request.nextUrl.searchParams.get('token')
    || request.headers.get('x-exotel-token')
    || request.headers.get('x-api-token');

  const expectedToken = process.env.EXOTEL_API_TOKEN;
  if (!expectedToken || !token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const tokenBuffer = Buffer.from(token);
    const expectedBuffer = Buffer.from(expectedToken);
    if (tokenBuffer.length !== expectedBuffer.length ||
        !crypto.timingSafeEqual(tokenBuffer, expectedBuffer)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  try {
    const payload: ExoVoiceAnalyzeWebhookPayload = await request.json();

    // Find intelligence record by call_sid
    const { data: intel, error: findError } = await supabase
      .from('admission_call_intelligence')
      .select('id, call_log_id, institution_id')
      .eq('call_sid', payload.call_sid)
      .single();

    if (findError || !intel) {
      console.error('[Intelligence Webhook] No record for call_sid:', payload.call_sid);
      return NextResponse.json({ received: true, processed: false, error: 'No matching record' });
    }

    if (payload.status === 'failed') {
      await supabase
        .from('admission_call_intelligence')
        .update({
          analyze_status: 'failed',
          analyze_completed_at: new Date().toISOString(),
        })
        .eq('id', intel.id);

      return NextResponse.json({ received: true, processed: true, status: 'failed' });
    }

    // Extract insights
    const insights = payload.insights;
    const transcription = insights.transcript?.text ?? null;
    const transcriptionLanguage = insights.transcript?.language ?? null;
    const sentiment = insights.sentiment?.label ?? null;
    const sentimentScore = insights.sentiment?.score ?? null;
    const summary = insights.summarization?.summary ?? null;
    const categories = insights.categorise?.categories ?? null;

    // Run enrichment extraction on transcription
    let extractedName: string | null = null;
    let extractedLocation: string | null = null;
    let extractedCourse: string | null = null;

    if (transcription) {
      const enrichment = CallEnrichmentService.extractFromTranscription(transcription);
      extractedName = enrichment.name ?? null;
      extractedLocation = enrichment.location ?? null;
      extractedCourse = enrichment.course ?? null;
    }

    // Update intelligence record
    await supabase
      .from('admission_call_intelligence')
      .update({
        analyze_status: 'completed',
        analyze_completed_at: new Date().toISOString(),
        transcription,
        transcription_language: transcriptionLanguage,
        sentiment,
        sentiment_score: sentimentScore,
        summary,
        categories,
        extracted_name: extractedName,
        extracted_location: extractedLocation,
        extracted_course: extractedCourse,
      })
      .eq('id', intel.id);

    // Auto-apply enrichment to lead if enabled
    const { data: callLog } = await supabase
      .from('admission_call_logs')
      .select('lead_id')
      .eq('id', intel.call_log_id)
      .single();

    if (callLog?.lead_id && transcription) {
      const { data: settings } = await supabase
        .from('institution_call_settings')
        .select('auto_enrich_leads')
        .eq('institution_id', intel.institution_id)
        .single();

      if (settings?.auto_enrich_leads !== false) {
        const enrichment = CallEnrichmentService.extractFromTranscription(transcription);
        await CallEnrichmentService.applyToLead(
          callLog.lead_id,
          enrichment,
          intel.id,
          supabase
        );
      }
    }

    // Update call log to complete stage
    await supabase
      .from('admission_call_logs')
      .update({ pipeline_stage: 'complete' })
      .eq('id', intel.call_log_id);

    return NextResponse.json({
      received: true,
      processed: true,
      status: 'completed',
      intelligenceId: intel.id,
    });
  } catch (error) {
    console.error('[Intelligence Webhook] Error:', error);
    return NextResponse.json({ received: true, processed: false, error: String(error) });
  }
}
```

**Step 2: Verify types compile**

Run: `cd /Users/omm/PROJECTS/MyJKKN && npx tsc --noEmit 2>&1 | grep intelligence`
Expected: No errors.

**Step 3: Commit**

```bash
git add app/api/webhooks/telephony/intelligence/route.ts
git commit -m "feat(telephony): add ExoVoiceAnalyze webhook handler — transcription + enrichment"
```

---

### Task 3.2: Heartbeat Webhook Handler

**Files:**
- Create: `app/api/webhooks/telephony/heartbeat/route.ts`

**Step 1: Write the handler**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

export async function POST(request: NextRequest) {
  // Auth
  const token = request.nextUrl.searchParams.get('token')
    || request.headers.get('x-exotel-token')
    || request.headers.get('x-api-token');

  const expectedToken = process.env.EXOTEL_API_TOKEN;
  if (!expectedToken || !token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const tokenBuffer = Buffer.from(token);
    const expectedBuffer = Buffer.from(expectedToken);
    if (tokenBuffer.length !== expectedBuffer.length ||
        !crypto.timingSafeEqual(tokenBuffer, expectedBuffer)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  try {
    const payload = await request.json();

    // Store health event
    await supabase.from('telephony_health_events').insert({
      status_type: payload.status_type || 'CRITICAL',
      connectivity_status: payload.connectivity_status,
      incoming_affected: payload.incoming_affected || [],
      outgoing_affected: payload.outgoing_affected || [],
      alternate_exophones: payload.alternate_exophone || null,
      raw_payload: payload,
    });

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('[Heartbeat Webhook] Error:', error);
    return NextResponse.json({ received: true, error: String(error) });
  }
}
```

**Step 2: Commit**

```bash
git add app/api/webhooks/telephony/heartbeat/route.ts
git commit -m "feat(telephony): add ExoPhone heartbeat webhook handler"
```

---

### Task 3.3: Call Intelligence API Route (GET)

**Files:**
- Create: `app/api/admission/calls/[id]/intelligence/route.ts`

**Step 1: Write the route**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@/lib/supabase/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createRouteHandlerClient();

  const { data, error } = await supabase
    .from('admission_call_intelligence')
    .select('*')
    .eq('call_log_id', id)
    .single();

  if (error || !data) {
    return NextResponse.json({ intelligence: null });
  }

  return NextResponse.json({ intelligence: data });
}
```

**Step 2: Commit**

```bash
git add app/api/admission/calls/[id]/intelligence/route.ts
git commit -m "feat(telephony): add GET call intelligence API route"
```

---

### Task 3.4: Manual Analyze Trigger Route (POST)

**Files:**
- Create: `app/api/admission/calls/[id]/analyze/route.ts`

**Step 1: Write the route**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@/lib/supabase/server';
import { CallPipelineService } from '@/lib/services/telephony/call-pipeline-service';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createRouteHandlerClient();

  // Fetch call log
  const { data: call, error } = await supabase
    .from('admission_call_logs')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !call) {
    return NextResponse.json({ error: 'Call not found' }, { status: 404 });
  }

  if (!call.recording_url) {
    return NextResponse.json({ error: 'No recording available for analysis' }, { status: 400 });
  }

  // Run pipeline
  const result = await CallPipelineService.runPipeline({
    callLogId: call.id,
    callSid: call.call_sid,
    institutionId: call.institution_id,
    direction: call.direction,
    status: call.status,
    fromNumber: call.from_number,
    toNumber: call.to_number,
    durationSeconds: call.duration_seconds ?? 0,
    costAmount: call.cost_amount ?? 0,
    recordingUrl: call.recording_url,
    leadId: call.lead_id ?? undefined,
    counselorId: call.counselor_id ?? undefined,
  }, supabase);

  return NextResponse.json({ result });
}
```

**Step 2: Commit**

```bash
git add app/api/admission/calls/[id]/analyze/route.ts
git commit -m "feat(telephony): add manual call analysis trigger route"
```

---

### Task 3.5: Bulk Callback Route (POST)

**Files:**
- Create: `app/api/admission/calls/bulk-callback/route.ts`

**Step 1: Write the route**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@/lib/supabase/server';
import { TelephonyService } from '@/lib/services/telephony/telephony-service';

export async function POST(request: NextRequest) {
  const supabase = await createRouteHandlerClient();
  const { callbackIds } = await request.json();

  if (!Array.isArray(callbackIds) || callbackIds.length === 0) {
    return NextResponse.json({ error: 'callbackIds required' }, { status: 400 });
  }

  if (callbackIds.length > 20) {
    return NextResponse.json({ error: 'Max 20 callbacks at once' }, { status: 400 });
  }

  // Fetch callback entries
  const { data: entries } = await supabase
    .from('admission_callback_queue')
    .select('id, caller_number, institution_id, lead_id')
    .in('id', callbackIds)
    .eq('status', 'pending');

  if (!entries?.length) {
    return NextResponse.json({ error: 'No pending callbacks found' }, { status: 404 });
  }

  const results: { id: string; success: boolean; error?: string }[] = [];

  for (const entry of entries) {
    try {
      // Mark as in_progress
      await supabase
        .from('admission_callback_queue')
        .update({ status: 'in_progress' })
        .eq('id', entry.id);

      // Initiate call via existing TelephonyService
      const callResult = await TelephonyService.initiateCall({
        institutionId: entry.institution_id,
        toNumber: entry.caller_number,
        leadId: entry.lead_id ?? undefined,
      }, supabase);

      if (callResult.success) {
        // Link callback to return call
        await supabase
          .from('admission_callback_queue')
          .update({
            callback_call_id: callResult.call_log_id,
          })
          .eq('id', entry.id);
      }

      results.push({ id: entry.id, success: callResult.success, error: callResult.error });
    } catch (error) {
      results.push({ id: entry.id, success: false, error: String(error) });
    }
  }

  return NextResponse.json({ results, initiated: results.filter(r => r.success).length });
}
```

**Step 2: Commit**

```bash
git add app/api/admission/calls/bulk-callback/route.ts
git commit -m "feat(telephony): add bulk callback initiation route"
```

---

### Task 3.6: Telephony Health Status Route (GET)

**Files:**
- Create: `app/api/admission/telephony/health/route.ts`

**Step 1: Write the route**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const supabase = await createRouteHandlerClient();

  // Latest health event
  const { data: latest } = await supabase
    .from('telephony_health_events')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  // Recent events (last 24h)
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: recent } = await supabase
    .from('telephony_health_events')
    .select('id, status_type, connectivity_status, created_at')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(20);

  // Check if we should show a warning
  const isHealthy = !latest || latest.status_type === 'OK';
  const lastIssue = recent?.find(e => e.status_type !== 'OK');

  return NextResponse.json({
    status: isHealthy ? 'healthy' : latest?.status_type?.toLowerCase(),
    latest,
    recent: recent || [],
    lastIssueAt: lastIssue?.created_at ?? null,
  });
}
```

**Step 2: Commit**

```bash
git add app/api/admission/telephony/health/route.ts
git commit -m "feat(telephony): add telephony health status API route"
```

---

## Phase 4: Wire Pipeline + Expand Repeat Detection (sequential — modifies existing services)

---

### Task 4.1: Wire Pipeline into TelephonyService

**Files:**
- Modify: `lib/services/telephony/telephony-service.ts`

**Step 1: Add import at top of file (~line 1-10)**

After existing imports, add:

```typescript
import { CallPipelineService } from './call-pipeline-service';
```

**Step 2: Wire pipeline into `createInboundCallLog()` (~line 820)**

Find the end of `createInboundCallLog()` where it calls `processCallIntelligence()`. After that non-blocking call, add pipeline trigger:

```typescript
    // After processCallIntelligence(), trigger pipeline (non-blocking)
    CallPipelineService.runPipeline({
      callLogId: callLogId,
      callSid: callSid,
      institutionId: institutionId,
      direction: 'inbound',
      status: callStatus,
      fromNumber: fromNumber,
      toNumber: toNumber,
      durationSeconds: durationSeconds ?? 0,
      costAmount: costAmount ?? 0,
      recordingUrl: recordingUrl ?? undefined,
      leadId: matchedLeadId ?? undefined,
      counselorId: counselorId ?? undefined,
    }, supabase).catch(err => console.error('[Pipeline] Error:', err));
```

**Step 3: Expand repeat detection from today → 7 days in `processCallIntelligence()` (~line 845)**

Find where it queries today's calls. Change the date filter from today to 7-day window:

Current code queries with today's date filter. Change to:

```typescript
    // 7-day window instead of today only
    const windowStart = new Date();
    windowStart.setDate(windowStart.getDate() - 7);
    const windowStartStr = windowStart.toISOString();
```

And update the query to use `windowStartStr` instead of today's date.

**Step 4: Verify types compile**

Run: `cd /Users/omm/PROJECTS/MyJKKN && npx tsc --noEmit 2>&1 | grep telephony-service`
Expected: No errors.

**Step 5: Commit**

```bash
git add lib/services/telephony/telephony-service.ts
git commit -m "feat(telephony): wire pipeline into createInboundCallLog, expand repeat detection to 7 days"
```

---

### Task 4.2: Wire sweepPipeline into Cron Sync

**Files:**
- Modify: `app/api/admission/calls/sync/route.ts`

**Step 1: Add import**

```typescript
import { CallPipelineService } from '@/lib/services/telephony/call-pipeline-service';
```

**Step 2: After the sync loop completes (before returning response), add sweep**

```typescript
    // Pipeline sweep — retry stuck calls
    let sweepResult = { retried: 0, errors: [] as string[] };
    try {
      sweepResult = await CallPipelineService.sweepPipeline(supabase);
    } catch (err) {
      console.error('[Sync] Pipeline sweep error:', err);
    }
```

**Step 3: Include sweep results in response**

Add `pipeline_sweep: sweepResult` to the response JSON.

**Step 4: Commit**

```bash
git add app/api/admission/calls/sync/route.ts
git commit -m "feat(telephony): wire sweepPipeline into 5-min cron sync"
```

---

## Phase 5: React Query Hooks (can be parallel — independent files)

---

### Task 5.1: useCallIntelligence Hook

**Files:**
- Create: `hooks/admission/use-call-intelligence.ts`
- Modify: `hooks/admission/index.ts`

**Step 1: Write the hook**

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

interface CallIntelligence {
  id: string;
  call_log_id: string;
  analyze_status: 'pending' | 'submitted' | 'processing' | 'completed' | 'failed';
  transcription: string | null;
  transcription_language: string | null;
  sentiment: 'positive' | 'negative' | 'neutral' | null;
  sentiment_score: number | null;
  summary: string | null;
  categories: string[] | null;
  extracted_name: string | null;
  extracted_location: string | null;
  extracted_course: string | null;
  enrichment_applied: boolean;
  analyze_submitted_at: string | null;
  analyze_completed_at: string | null;
}

export const callIntelligenceKeys = {
  all: ['call-intelligence'] as const,
  detail: (callLogId: string) => ['call-intelligence', callLogId] as const,
};

export function useCallIntelligence(callLogId: string | undefined) {
  const query = useQuery({
    queryKey: callIntelligenceKeys.detail(callLogId ?? ''),
    queryFn: async () => {
      const res = await fetch(`/api/admission/calls/${callLogId}/intelligence`);
      if (!res.ok) throw new Error('Failed to fetch intelligence');
      const data = await res.json();
      return data.intelligence as CallIntelligence | null;
    },
    enabled: !!callLogId,
    // Auto-poll while processing
    refetchInterval: (query) => {
      const status = query.state.data?.analyze_status;
      if (status === 'submitted' || status === 'processing') return 5000; // 5s
      return false;
    },
  });

  return query;
}

export function useAnalyzeCall() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (callLogId: string) => {
      const res = await fetch(`/api/admission/calls/${callLogId}/analyze`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error('Failed to trigger analysis');
      return res.json();
    },
    onSuccess: (_, callLogId) => {
      queryClient.invalidateQueries({ queryKey: callIntelligenceKeys.detail(callLogId) });
    },
  });
}
```

**Step 2: Add export to `hooks/admission/index.ts`**

Add this line to the exports:

```typescript
export { useCallIntelligence, useAnalyzeCall, callIntelligenceKeys } from './use-call-intelligence';
```

**Step 3: Commit**

```bash
git add hooks/admission/use-call-intelligence.ts hooks/admission/index.ts
git commit -m "feat(telephony): add useCallIntelligence hook with auto-poll"
```

---

### Task 5.2: useCallbackQueue Hook

**Files:**
- Create: `hooks/admission/use-callback-queue.ts`
- Modify: `hooks/admission/index.ts`

**Step 1: Write the hook**

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

interface CallbackEntry {
  id: string;
  institution_id: string;
  call_log_id: string;
  lead_id: string | null;
  assigned_counselor_id: string | null;
  caller_number: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  status: 'pending' | 'in_progress' | 'completed' | 'expired' | 'cancelled';
  missed_count_7d: number;
  ever_connected: boolean;
  escalated: boolean;
  created_at: string;
}

export const callbackQueueKeys = {
  all: ['callback-queue'] as const,
  list: (institutionId?: string) => ['callback-queue', 'list', institutionId] as const,
  forCall: (callLogId: string) => ['callback-queue', 'call', callLogId] as const,
};

export function useCallbackQueue(institutionId?: string) {
  return useQuery({
    queryKey: callbackQueueKeys.list(institutionId),
    queryFn: async () => {
      // Fetch from DB directly via supabase client (or create API route if needed)
      const params = new URLSearchParams();
      if (institutionId) params.set('institution_id', institutionId);
      params.set('status', 'pending');
      const res = await fetch(`/api/admission/calls/bulk-callback?${params}`);
      if (!res.ok) return [];
      return (await res.json()) as CallbackEntry[];
    },
    refetchInterval: 30000, // 30s
  });
}

export function useBulkCallback() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (callbackIds: string[]) => {
      const res = await fetch('/api/admission/calls/bulk-callback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callbackIds }),
      });
      if (!res.ok) throw new Error('Bulk callback failed');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: callbackQueueKeys.all });
    },
  });
}
```

**Step 2: Add export to `hooks/admission/index.ts`**

```typescript
export { useCallbackQueue, useBulkCallback, callbackQueueKeys } from './use-callback-queue';
```

**Step 3: Commit**

```bash
git add hooks/admission/use-callback-queue.ts hooks/admission/index.ts
git commit -m "feat(telephony): add useCallbackQueue hook with 30s polling"
```

---

### Task 5.3: useTelephonyHealth Hook

**Files:**
- Create: `hooks/admission/use-telephony-health.ts`
- Modify: `hooks/admission/index.ts`

**Step 1: Write the hook**

```typescript
import { useQuery } from '@tanstack/react-query';

interface TelephonyHealth {
  status: 'healthy' | 'warning' | 'critical';
  latest: {
    status_type: string;
    connectivity_status: string;
    created_at: string;
  } | null;
  recent: {
    id: string;
    status_type: string;
    connectivity_status: string;
    created_at: string;
  }[];
  lastIssueAt: string | null;
}

export const telephonyHealthKeys = {
  all: ['telephony-health'] as const,
};

export function useTelephonyHealth() {
  return useQuery({
    queryKey: telephonyHealthKeys.all,
    queryFn: async () => {
      const res = await fetch('/api/admission/telephony/health');
      if (!res.ok) throw new Error('Failed to fetch health');
      return (await res.json()) as TelephonyHealth;
    },
    refetchInterval: 60000, // 60s
    staleTime: 30000,
  });
}
```

**Step 2: Add export to `hooks/admission/index.ts`**

```typescript
export { useTelephonyHealth, telephonyHealthKeys } from './use-telephony-health';
```

**Step 3: Commit**

```bash
git add hooks/admission/use-telephony-health.ts hooks/admission/index.ts
git commit -m "feat(telephony): add useTelephonyHealth hook with 60s polling"
```

---

## Phase 6: UI — Call Detail Page AI Insights (sequential — needs hooks)

---

### Task 6.1: Add AI Insights Card to Call Detail Page

**Files:**
- Modify: `app/(routes)/admission/counselors/calls/[id]/page.tsx`

**Step 1: Add imports**

```typescript
import { useCallIntelligence, useAnalyzeCall } from '@/hooks/admission';
```

**Step 2: Add hook calls inside the component**

After existing query hooks:

```typescript
  const { data: intelligence, isLoading: intelLoading } = useCallIntelligence(callLog?.id);
  const analyzeCall = useAnalyzeCall();
```

**Step 3: Add AI Insights card after the existing Notes & Disposition card**

```tsx
{/* AI Insights Card */}
<Card>
  <CardHeader>
    <CardTitle className="flex items-center gap-2">
      <span>AI Insights</span>
      {intelligence?.analyze_status === 'processing' && (
        <span className="text-xs text-muted-foreground animate-pulse">Analyzing...</span>
      )}
      {intelligence?.sentiment && (
        <span className={cn(
          "inline-block w-2.5 h-2.5 rounded-full",
          intelligence.sentiment === 'positive' && "bg-green-500",
          intelligence.sentiment === 'negative' && "bg-red-500",
          intelligence.sentiment === 'neutral' && "bg-yellow-500",
        )} />
      )}
    </CardTitle>
  </CardHeader>
  <CardContent className="space-y-4">
    {!intelligence && callLog?.recording_url && (
      <Button
        variant="outline"
        size="sm"
        onClick={() => analyzeCall.mutate(callLog.id)}
        disabled={analyzeCall.isPending}
      >
        {analyzeCall.isPending ? 'Submitting...' : 'Analyze Call'}
      </Button>
    )}

    {intelligence?.summary && (
      <div>
        <p className="text-sm font-medium text-muted-foreground">Summary</p>
        <p className="text-sm mt-1">{intelligence.summary}</p>
      </div>
    )}

    {intelligence?.categories?.length && (
      <div>
        <p className="text-sm font-medium text-muted-foreground">Categories</p>
        <div className="flex flex-wrap gap-1 mt-1">
          {intelligence.categories.map(cat => (
            <Badge key={cat} variant="secondary" className="text-xs">
              {cat.replace(/_/g, ' ')}
            </Badge>
          ))}
        </div>
      </div>
    )}

    {(intelligence?.extracted_name || intelligence?.extracted_course || intelligence?.extracted_location) && (
      <div>
        <p className="text-sm font-medium text-muted-foreground">Extracted Info</p>
        <div className="grid grid-cols-3 gap-2 mt-1 text-sm">
          {intelligence.extracted_name && <div><span className="text-muted-foreground">Name:</span> {intelligence.extracted_name}</div>}
          {intelligence.extracted_course && <div><span className="text-muted-foreground">Course:</span> {intelligence.extracted_course}</div>}
          {intelligence.extracted_location && <div><span className="text-muted-foreground">Location:</span> {intelligence.extracted_location}</div>}
        </div>
        {!intelligence.enrichment_applied && callLog?.lead_id && (
          <Button variant="outline" size="sm" className="mt-2">
            Apply to Lead
          </Button>
        )}
        {intelligence.enrichment_applied && (
          <p className="text-xs text-green-600 mt-1">Applied to lead record</p>
        )}
      </div>
    )}

    {intelligence?.transcription && (
      <div>
        <p className="text-sm font-medium text-muted-foreground">Transcription</p>
        <p className="text-sm mt-1 whitespace-pre-wrap max-h-40 overflow-y-auto bg-muted/30 p-2 rounded">
          {intelligence.transcription}
        </p>
      </div>
    )}

    {intelligence?.analyze_status === 'failed' && (
      <p className="text-sm text-red-500">Analysis failed. Try again.</p>
    )}
  </CardContent>
</Card>
```

**Step 4: Build and verify**

Run: `cd /Users/omm/PROJECTS/MyJKKN && NODE_OPTIONS="--max-old-space-size=8192" npm run build 2>&1 | tail -5`
Expected: Build succeeds.

**Step 5: Commit**

```bash
git add app/(routes)/admission/counselors/calls/[id]/page.tsx
git commit -m "feat(telephony): add AI Insights card to call detail page"
```

---

## Phase 7: UI — Incoming Calls Tab Enhancements (sequential — needs hooks)

---

### Task 7.1: Add Sentiment Dots + Follow-up Badges + Callback Button to Calls Table

**Files:**
- Modify: `app/(routes)/admission/counselors/calls/_components/incoming-calls-tab.tsx`

**Step 1: Add imports**

```typescript
import { useTelephonyHealth, useBulkCallback } from '@/hooks/admission';
```

**Step 2: Add health banner at top of component (above KPI cards)**

```tsx
{health && health.status !== 'healthy' && (
  <div className={cn(
    "p-3 rounded-lg text-sm flex items-center gap-2",
    health.status === 'critical' ? "bg-red-50 text-red-800 border border-red-200" : "bg-yellow-50 text-yellow-800 border border-yellow-200"
  )}>
    <span className="font-medium">
      {health.status === 'critical' ? 'ExoPhone Outage' : 'ExoPhone Warning'}
    </span>
    <span>— {health.latest?.connectivity_status}. Miss rates may be elevated.</span>
  </div>
)}
```

**Step 3: Add new columns to the table**

After the existing "Status" badge column, add:

- **"Follow-up" column:** Shows badges for SMS Sent / Callback Queued / Escalated based on `auto_sms_sent` and `callback_queued` fields.
- **"Actions" column:** One-click callback button for missed calls.

**Step 4: Add bulk action bar**

When rows are selected (add checkbox column), show a floating bar with "Call Back All" and "Send SMS" buttons.

**Step 5: Build and verify**

Run: `cd /Users/omm/PROJECTS/MyJKKN && NODE_OPTIONS="--max-old-space-size=8192" npm run build 2>&1 | tail -5`
Expected: Build succeeds.

**Step 6: Commit**

```bash
git add app/(routes)/admission/counselors/calls/_components/incoming-calls-tab.tsx
git commit -m "feat(telephony): add sentiment dots, follow-up badges, callback button to calls table"
```

---

## Phase 8: Build Verification + PR

---

### Task 8.1: Full Build + TypeScript Check

**Step 1: Full build**

Run: `cd /Users/omm/PROJECTS/MyJKKN && NODE_OPTIONS="--max-old-space-size=8192" npm run build 2>&1 | tail -20`
Expected: Build succeeds, no errors.

**Step 2: TypeScript check for new files**

Run: `cd /Users/omm/PROJECTS/MyJKKN && npx tsc --noEmit 2>&1 | grep -E "(pipeline|intelligence|enrichment|heartbeat|callback|health)" | head -20`
Expected: Zero errors.

**Step 3: Create PR**

Run:
```bash
cd /Users/omm/PROJECTS/MyJKKN
git push origin HEAD
~/bin/gh pr create \
  --repo Jicate-Solutions/MyJKKN \
  --title "feat(telephony): Call Intelligence Pipeline — auto-transcription, auto-SMS, callback queue" \
  --body "## Summary
- 8-stage pipeline: every call auto-enriches leads, triggers responses, surfaces insights
- ExoVoiceAnalyze integration: transcription, sentiment, summary, categories
- Auto-SMS for missed calls (institution-configurable, DLT-compliant)
- Callback queue with 7-day repeat detection and escalation
- ExoPhone health monitoring via heartbeat webhook
- AI Insights card on call detail page
- Pipeline sweep in existing 5-min cron for retry/backfill

## New Tables
- admission_call_intelligence (transcription, sentiment, summary)
- admission_callback_queue (missed call follow-up tracking)
- telephony_health_events (ExoPhone monitoring)
- institution_call_settings (per-institution pipeline config)

## Test Plan
- [ ] Build passes
- [ ] Make a real inbound call → verify pipeline stages fire
- [ ] Verify ExoVoiceAnalyze webhook receives transcription
- [ ] Verify auto-SMS sends for missed calls
- [ ] Verify callback queue entry created
- [ ] Verify AI Insights card shows on call detail page
- [ ] Verify health banner appears on status change"
```

**STOP here — share PR URL with user for merge.**

---

## Dependency Map

```
Task 1.1 (DB Migration)
  ├── Task 2.1 (ExotelClient.analyzeCall)
  │     └── Task 2.2 (CallPipelineService) ← uses analyzeCall + sendSms
  │           ├── Task 2.3 (CallEnrichmentService)
  │           ├── Task 3.1 (Intelligence Webhook) ← uses enrichment
  │           ├── Task 3.4 (Manual Analyze Route) ← uses pipeline
  │           └── Task 4.1 (Wire into TelephonyService) ← imports pipeline
  │                 └── Task 4.2 (Wire into Cron) ← imports pipeline
  │
  ├── Task 3.2 (Heartbeat Webhook) ← only needs DB tables
  ├── Task 3.3 (Intelligence GET Route) ← only needs DB tables
  ├── Task 3.5 (Bulk Callback Route) ← needs DB tables + TelephonyService.initiateCall
  ├── Task 3.6 (Health Status Route) ← only needs DB tables
  │
  ├── Task 5.1 (useCallIntelligence) ← needs Task 3.3
  ├── Task 5.2 (useCallbackQueue) ← needs Task 3.5
  ├── Task 5.3 (useTelephonyHealth) ← needs Task 3.6
  │
  ├── Task 6.1 (Call Detail AI Insights) ← needs Task 5.1
  └── Task 7.1 (Incoming Calls Tab) ← needs Tasks 5.2, 5.3
        └── Task 8.1 (Build + PR)
```

## Batch Execution Strategy

| Batch | Tasks | Why Sequential/Parallel |
|-------|-------|------------------------|
| Batch 1 | 1.1 | Sequential — everything depends on schema |
| Batch 2 | 2.1 → 2.2 → 2.3 | Sequential — each builds on previous |
| Batch 3 | 3.1, 3.2, 3.3, 3.4, 3.5, 3.6 | **Parallel** — independent route files |
| Batch 4 | 4.1 → 4.2 | Sequential — modifies same service chain |
| Batch 5 | 5.1, 5.2, 5.3 | **Parallel** — independent hook files |
| Batch 6 | 6.1 | Sequential — modifies existing page |
| Batch 7 | 7.1 | Sequential — modifies existing page |
| Batch 8 | 8.1 | Sequential — final verification |

## Gotchas / Risk Areas

1. **ExoVoiceAnalyze is Alpha** — API may change. Error handling must be defensive. Always return 200 from webhook.
2. **DLT compliance for auto-SMS** — India requires registered templates. `dlt_entity_id` and `dlt_template_id` MUST be set in `institution_call_settings` before auto-SMS works.
3. **cost_amount = 0 means missed** — This is the existing convention in TelephonyService. Don't use `status` field alone.
4. **Repeat detection window change** — Moving from today-only to 7-day window increases query scope. The existing `idx_call_logs_from_number_inbound` index covers this.
5. **Pipeline is non-blocking** — `runPipeline()` is called with `.catch()` (fire-and-forget). Failures are caught by `sweepPipeline()` in the 5-min cron.
6. **Webhook auth** — Uses same `EXOTEL_API_TOKEN` as existing webhook. New webhooks (intelligence, heartbeat) need to be registered in Exotel dashboard.
7. **RLS policies** — Service role has full access (API routes create their own service-role client). Authenticated users get read-only access scoped to their institution.
