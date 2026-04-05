# Exotel Advanced Integration — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Expand Exotel from 4 APIs to full admission communication platform: transcription, bulk SMS, campaigns, health monitoring, WhatsApp, number masking, agent management.

**Architecture:** 10 capabilities split into 4 phases. Each phase adds to `ExotelClient` (HTTP), new services in `lib/services/telephony/`, API routes in `app/api/`, webhooks in `app/api/webhooks/telephony/`, and React Query hooks in `hooks/admission/`. All services use static methods with injected supabase client. All webhooks create their own service-role client.

**Tech Stack:** Next.js 16 App Router, Supabase (PostgreSQL + RLS), React Query, Exotel REST APIs (v1 form-encoded + v2/v3 JSON), ExoVoiceAnalyze GenAI API.

---

## Phase 1: Intelligence + Bulk SMS + Health (3-4 days)

**Capabilities:** C1 (ExoVoiceAnalyze), C2 (Bulk SMS), C5 (Heartbeat)
**Dependencies:** None — fully additive, no breaking changes.

---

### Task 1.1: Database Migration — Phase 1 Tables

**Files:**
- Create: `supabase/migrations/admission/010_exotel_phase1.sql`

**Step 1: Write migration SQL**

```sql
-- ================================================================
-- Exotel Phase 1: Call Intelligence + Health Events
-- ================================================================

-- C1: Call Intelligence (transcription, sentiment, summary)
CREATE TABLE IF NOT EXISTS admission_call_intelligence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_log_id UUID NOT NULL REFERENCES admission_call_logs(id) ON DELETE CASCADE,
  institution_id UUID NOT NULL REFERENCES institutions(id),
  analysis_job_id TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  transcription TEXT,
  transcription_segments JSONB DEFAULT '[]',
  sentiment TEXT CHECK (sentiment IN ('positive', 'neutral', 'negative', 'mixed')),
  sentiment_score NUMERIC(4,2),
  summary TEXT,
  categories TEXT[] DEFAULT '{}',
  language_detected TEXT,
  error_message TEXT,
  analyzed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE admission_call_intelligence ENABLE ROW LEVEL SECURITY;

CREATE POLICY admission_call_intelligence_select ON admission_call_intelligence
  FOR SELECT TO authenticated USING (true);

CREATE POLICY admission_call_intelligence_service_all ON admission_call_intelligence
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX idx_call_intelligence_call ON admission_call_intelligence(call_log_id);
CREATE INDEX idx_call_intelligence_status ON admission_call_intelligence(status);
CREATE INDEX idx_call_intelligence_sentiment ON admission_call_intelligence(sentiment);
CREATE UNIQUE INDEX idx_call_intelligence_job ON admission_call_intelligence(analysis_job_id) WHERE analysis_job_id IS NOT NULL;

-- C5: Telephony Health Events
CREATE TABLE IF NOT EXISTS telephony_health_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exophone_sid TEXT NOT NULL,
  exophone_number TEXT,
  status_type TEXT NOT NULL CHECK (status_type IN ('ok', 'warning', 'critical')),
  connectivity_status TEXT,
  incoming_affected BOOLEAN DEFAULT false,
  outgoing_affected BOOLEAN DEFAULT false,
  alternate_exophone TEXT,
  raw_payload JSONB,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE telephony_health_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY telephony_health_events_select ON telephony_health_events
  FOR SELECT TO authenticated USING (true);

CREATE POLICY telephony_health_events_service_all ON telephony_health_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX idx_health_events_status ON telephony_health_events(status_type);
CREATE INDEX idx_health_events_created ON telephony_health_events(created_at DESC);
```

**Step 2: Apply migration to staging DB**

Run: `~/bin/supabase db push --project-ref hhprjbgknupaplivtoib`

Or via Supabase MCP: `mcp__supabase__apply_migration`

**Step 3: Verify tables exist**

Run: `mcp__supabase__execute_sql` with `SELECT tablename FROM pg_tables WHERE tablename IN ('admission_call_intelligence', 'telephony_health_events');`
Expected: 2 rows returned.

**Step 4: Commit**

```bash
git add supabase/migrations/admission/010_exotel_phase1.sql
git commit -m "schema: add call_intelligence and health_events tables (Exotel Phase 1)"
```

---

### Task 1.2: ExotelClient — Add analyzeCall() Method

**Files:**
- Modify: `lib/services/telephony/exotel-client.ts`

**Step 1: Add types for ExoVoiceAnalyze**

After the existing `ExotelSmsResponse` interface (~line 83), add:

```typescript
export interface AnalyzeCallParams {
  callSid: string;
  tasks: ('transcript' | 'sentiment' | 'summarization' | 'categorise')[];
  callbackUrl: string;
}

export interface AnalyzeCallResponse {
  // ExoVoiceAnalyze returns a job acknowledgment
  status: string;
  job_id?: string;
  message?: string;
}
```

**Step 2: Add analyzeCall() method**

After `sendSms()` method, add new section:

```typescript
// ═══════════════════════════════════════════════════════════════════════
// VOICE INTELLIGENCE API (V1 — ExoVoiceAnalyze)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Submit a call for AI analysis: transcription, sentiment, summary, categorization.
 * Results are delivered async to callbackUrl.
 * Endpoint: POST /v1/Accounts/{sid}/Calls/{callSid}/ExoVoiceAnalyze.json
 */
static async analyzeCall(params: AnalyzeCallParams): Promise<AnalyzeCallResponse> {
  const body: Record<string, string> = {
    insights: JSON.stringify(params.tasks.map(task => ({ task }))),
    callback_url: params.callbackUrl,
  };

  return this.request<AnalyzeCallResponse>(
    'POST',
    `/Calls/${params.callSid}/ExoVoiceAnalyze.json`,
    body
  );
}
```

**Step 3: Verify build**

Run: `npx tsc --noEmit 2>&1 | grep exotel-client` — expected: no errors in this file.

**Step 4: Commit**

```bash
git add lib/services/telephony/exotel-client.ts
git commit -m "feat(telephony): add ExoVoiceAnalyze analyzeCall() to ExotelClient"
```

---

### Task 1.3: ExotelClient — Add sendBulkSms() Method

**Files:**
- Modify: `lib/services/telephony/exotel-client.ts`

**Step 1: Add types for Bulk SMS**

```typescript
export interface BulkSmsMessage {
  To: string;
  Body: string;
  DltEntityId?: string;
  DltTemplateId?: string;
  StatusCallback?: string;
  CustomField?: string;
}

export interface BulkSmsResponse {
  // HTTP 207 response: per-message status
  Messages?: Array<{
    Sid?: string;
    To: string;
    Status: string;
    DetailedStatusCode?: number;
    DetailedStatus?: string;
    ErrorMessage?: string;
  }>;
}
```

**Step 2: Add sendBulkSms() method**

```typescript
// ═══════════════════════════════════════════════════════════════════════
// BULK SMS API (V1)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Send up to 100 personalized SMS in a single request.
 * Endpoint: POST /v1/Accounts/{sid}/Sms/bulksend
 * Response: HTTP 207 with per-message status.
 */
static async sendBulkSms(messages: BulkSmsMessage[]): Promise<BulkSmsResponse> {
  if (messages.length > 100) {
    throw new ExotelApiError('Bulk SMS max 100 messages per request', 400);
  }

  const config = this.getConfig();
  const url = `${this.getBaseUrl('v1')}/Sms/bulksend`;
  const authHeader = this.getAuthHeader();

  const response = await withRetry(
    () =>
      withTimeout(
        fetch(url, {
          method: 'POST',
          headers: {
            Authorization: authHeader,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ Messages: messages }),
        }),
        30000,
        'Exotel Bulk SMS timeout'
      ),
    2,
    1000
  );

  const responseText = await response.text();

  // HTTP 207 is expected (multi-status)
  if (response.status !== 207 && !response.ok) {
    throw new ExotelApiError(
      `Bulk SMS failed: ${response.status}`,
      response.status,
      undefined,
      responseText.substring(0, 500)
    );
  }

  try {
    return JSON.parse(responseText) as BulkSmsResponse;
  } catch {
    throw new ExotelApiError('Bulk SMS returned non-JSON', response.status);
  }
}
```

**Step 3: Verify build, commit**

---

### Task 1.4: CallIntelligenceService — New Service

**Files:**
- Create: `lib/services/telephony/call-intelligence-service.ts`

**Step 1: Create the service**

```typescript
// lib/services/telephony/call-intelligence-service.ts
// Service for call transcription, sentiment analysis, and intelligence
// Uses ExoVoiceAnalyze API (async: submit → webhook callback)

import { ExotelClient } from './exotel-client';
import { logger } from '@/lib/utils/enhanced-logger';

// ═══════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════

export interface CallIntelligence {
  id: string;
  call_log_id: string;
  institution_id: string;
  analysis_job_id: string | null;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  transcription: string | null;
  transcription_segments: Array<{
    speaker: string;
    text: string;
    start_time?: number;
    end_time?: number;
  }>;
  sentiment: 'positive' | 'neutral' | 'negative' | 'mixed' | null;
  sentiment_score: number | null;
  summary: string | null;
  categories: string[];
  language_detected: string | null;
  error_message: string | null;
  analyzed_at: string | null;
  created_at: string;
}

export interface AnalyzeCallInput {
  call_log_id: string;
  call_sid: string;
  institution_id: string;
}

export interface VoiceAnalyzeWebhookPayload {
  CallSid: string;
  job_id?: string;
  insights?: Array<{
    task: string;
    result?: any;
    error?: string;
  }>;
  status?: string;
  [key: string]: any;
}

// ═══════════════════════════════════════════════════════════════════════
// SERVICE
// ═══════════════════════════════════════════════════════════════════════

export class CallIntelligenceService {

  /**
   * Submit a call for AI analysis. Creates a pending record in DB,
   * then POSTs to ExoVoiceAnalyze. Results arrive via webhook.
   */
  static async analyzeCall(
    input: AnalyzeCallInput,
    supabase: any
  ): Promise<{ success: boolean; intelligence_id?: string; error?: string }> {
    try {
      // Check if already analyzed
      const { data: existing } = await supabase
        .from('admission_call_intelligence')
        .select('id, status')
        .eq('call_log_id', input.call_log_id)
        .in('status', ['pending', 'processing', 'completed'])
        .maybeSingle();

      if (existing) {
        return { success: true, intelligence_id: existing.id };
      }

      // Create pending record
      const { data: record, error: insertError } = await supabase
        .from('admission_call_intelligence')
        .insert({
          call_log_id: input.call_log_id,
          institution_id: input.institution_id,
          status: 'pending',
        })
        .select('id')
        .single();

      if (insertError) throw new Error(insertError.message);

      // Submit to ExoVoiceAnalyze
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://jkkn.ai';
      const callbackUrl = `${baseUrl}/api/webhooks/telephony/voice-analyze`;

      const response = await ExotelClient.analyzeCall({
        callSid: input.call_sid,
        tasks: ['transcript', 'sentiment', 'summarization', 'categorise'],
        callbackUrl,
      });

      // Update with job ID
      await supabase
        .from('admission_call_intelligence')
        .update({
          analysis_job_id: response.job_id || null,
          status: 'processing',
        })
        .eq('id', record.id);

      logger.info('telephony/intelligence', 'Analysis submitted', {
        callLogId: input.call_log_id,
        jobId: response.job_id,
      });

      return { success: true, intelligence_id: record.id };
    } catch (err) {
      logger.error('telephony/intelligence', 'Failed to submit analysis', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Analysis submission failed',
      };
    }
  }

  /**
   * Get intelligence data for a call.
   */
  static async getIntelligence(
    callLogId: string,
    supabase: any
  ): Promise<CallIntelligence | null> {
    const { data, error } = await supabase
      .from('admission_call_intelligence')
      .select('*')
      .eq('call_log_id', callLogId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return data;
  }

  /**
   * Handle the async webhook callback from ExoVoiceAnalyze.
   * Extracts transcription, sentiment, summary, categories from the payload.
   */
  static async handleWebhookResult(
    payload: VoiceAnalyzeWebhookPayload
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const { createServiceRoleClient } = await import('@/lib/supabase/server');
      const supabase = createServiceRoleClient();

      const { CallSid, job_id, insights, status } = payload;

      if (!CallSid && !job_id) {
        return { success: false, error: 'Missing CallSid and job_id' };
      }

      // Find the intelligence record
      let query = supabase.from('admission_call_intelligence').select('id');
      if (job_id) {
        query = query.eq('analysis_job_id', job_id);
      } else {
        // Fallback: find by call_sid through call_logs join
        const { data: callLog } = await supabase
          .from('admission_call_logs')
          .select('id')
          .eq('call_sid', CallSid)
          .maybeSingle();

        if (!callLog) return { success: false, error: `Call not found: ${CallSid}` };
        query = query.eq('call_log_id', callLog.id);
      }

      const { data: record } = await query.maybeSingle();
      if (!record) return { success: false, error: 'Intelligence record not found' };

      // Extract results from insights array
      const updateData: Record<string, any> = {
        status: 'completed',
        analyzed_at: new Date().toISOString(),
      };

      if (status === 'failed' || status === 'error') {
        updateData.status = 'failed';
        updateData.error_message = JSON.stringify(insights);
      } else if (insights) {
        for (const insight of insights) {
          switch (insight.task) {
            case 'transcript':
              if (insight.result) {
                updateData.transcription = typeof insight.result === 'string'
                  ? insight.result
                  : JSON.stringify(insight.result);
                if (Array.isArray(insight.result)) {
                  updateData.transcription_segments = insight.result;
                }
              }
              break;
            case 'sentiment':
              if (insight.result) {
                updateData.sentiment = insight.result.sentiment || insight.result;
                updateData.sentiment_score = insight.result.score || null;
              }
              break;
            case 'summarization':
              if (insight.result) {
                updateData.summary = typeof insight.result === 'string'
                  ? insight.result
                  : insight.result.summary || JSON.stringify(insight.result);
              }
              break;
            case 'categorise':
              if (insight.result) {
                updateData.categories = Array.isArray(insight.result)
                  ? insight.result
                  : [insight.result];
              }
              break;
          }

          if (insight.error) {
            updateData.error_message = (updateData.error_message || '') + `${insight.task}: ${insight.error}; `;
          }
        }
      }

      const { error: updateError } = await supabase
        .from('admission_call_intelligence')
        .update(updateData)
        .eq('id', record.id);

      if (updateError) {
        logger.error('telephony/intelligence', 'Failed to update', updateError);
        return { success: false, error: updateError.message };
      }

      logger.info('telephony/intelligence', 'Analysis results stored', {
        recordId: record.id,
        sentiment: updateData.sentiment,
        hasTranscription: !!updateData.transcription,
      });

      return { success: true };
    } catch (err) {
      logger.error('telephony/intelligence', 'Webhook processing failed', err);
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
    }
  }

  /**
   * Get sentiment summary for an institution (dashboard KPI).
   */
  static async getSentimentSummary(
    institutionId: string | undefined,
    supabase: any,
    fromDate?: string,
    toDate?: string
  ): Promise<{ positive: number; neutral: number; negative: number; mixed: number; total: number }> {
    let query = supabase
      .from('admission_call_intelligence')
      .select('sentiment')
      .eq('status', 'completed')
      .not('sentiment', 'is', null);

    if (institutionId) query = query.eq('institution_id', institutionId);
    if (fromDate) query = query.gte('created_at', fromDate);
    if (toDate) query = query.lte('created_at', toDate);

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const counts = { positive: 0, neutral: 0, negative: 0, mixed: 0, total: 0 };
    for (const row of data || []) {
      counts.total++;
      if (row.sentiment in counts) {
        counts[row.sentiment as keyof typeof counts]++;
      }
    }
    return counts;
  }
}
```

**Step 2: Verify build, commit**

```bash
git add lib/services/telephony/call-intelligence-service.ts
git commit -m "feat(telephony): add CallIntelligenceService — transcription, sentiment, summary"
```

---

### Task 1.5: HealthMonitorService — New Service

**Files:**
- Create: `lib/services/telephony/health-monitor-service.ts`

```typescript
// lib/services/telephony/health-monitor-service.ts
// Service for ExoPhone health monitoring via Heartbeat webhook

import { logger } from '@/lib/utils/enhanced-logger';

export interface HealthEvent {
  id: string;
  exophone_sid: string;
  exophone_number: string | null;
  status_type: 'ok' | 'warning' | 'critical';
  connectivity_status: string | null;
  incoming_affected: boolean;
  outgoing_affected: boolean;
  alternate_exophone: string | null;
  raw_payload: any;
  resolved_at: string | null;
  created_at: string;
}

export interface HeartbeatPayload {
  status_type: string;
  incoming_affected?: string[];
  outgoing_affected?: string[];
  connectivity_status?: string;
  alternate_exophone?: string;
  [key: string]: any;
}

export class HealthMonitorService {

  /**
   * Process a heartbeat webhook from Exotel.
   */
  static async handleHeartbeat(
    payload: HeartbeatPayload
  ): Promise<{ success: boolean; event_id?: string; error?: string }> {
    try {
      const { createServiceRoleClient } = await import('@/lib/supabase/server');
      const supabase = createServiceRoleClient();

      const statusType = (payload.status_type || 'ok').toLowerCase();
      const incomingAffected = payload.incoming_affected || [];
      const outgoingAffected = payload.outgoing_affected || [];

      // For each affected ExoPhone, create/update a health event
      const allAffected = new Set([...incomingAffected, ...outgoingAffected]);

      if (allAffected.size === 0 && statusType === 'ok') {
        // Global OK — resolve all open events
        await supabase
          .from('telephony_health_events')
          .update({ resolved_at: new Date().toISOString() })
          .is('resolved_at', null);

        return { success: true };
      }

      for (const sid of allAffected) {
        const { data, error } = await supabase
          .from('telephony_health_events')
          .insert({
            exophone_sid: sid,
            status_type: statusType,
            connectivity_status: payload.connectivity_status || null,
            incoming_affected: incomingAffected.includes(sid),
            outgoing_affected: outgoingAffected.includes(sid),
            alternate_exophone: payload.alternate_exophone || null,
            raw_payload: payload,
          })
          .select('id')
          .single();

        if (error) {
          logger.error('telephony/health', 'Failed to store health event', error);
        }
      }

      if (statusType === 'critical') {
        logger.error('telephony/health', 'CRITICAL: ExoPhone outage detected', {
          affected: Array.from(allAffected),
          connectivity: payload.connectivity_status,
        });
      }

      return { success: true };
    } catch (err) {
      logger.error('telephony/health', 'Heartbeat processing failed', err);
      return { success: false, error: err instanceof Error ? err.message : 'Unknown' };
    }
  }

  /**
   * Get current health status of all ExoPhones.
   */
  static async getCurrentHealth(supabase: any): Promise<HealthEvent[]> {
    const { data, error } = await supabase
      .from('telephony_health_events')
      .select('*')
      .is('resolved_at', null)
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);
    return data || [];
  }

  /**
   * Get health event history.
   */
  static async getHealthHistory(
    supabase: any,
    limit: number = 50
  ): Promise<HealthEvent[]> {
    const { data, error } = await supabase
      .from('telephony_health_events')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw new Error(error.message);
    return data || [];
  }
}
```

**Commit:**

```bash
git add lib/services/telephony/health-monitor-service.ts
git commit -m "feat(telephony): add HealthMonitorService — ExoPhone health tracking"
```

---

### Task 1.6: API Route — Trigger Call Analysis

**Files:**
- Create: `app/api/admission/calls/[id]/analyze/route.ts`

```typescript
// POST /api/admission/calls/[id]/analyze — Trigger ExoVoiceAnalyze
import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/supabase/server';
import { CallIntelligenceService } from '@/lib/services/telephony/call-intelligence-service';
import { logger } from '@/lib/utils/enhanced-logger';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAuthSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const { createServiceRoleClient } = await import('@/lib/supabase/server');
    const supabase = createServiceRoleClient();

    // Fetch the call log to get call_sid and institution_id
    const { data: callLog, error: fetchError } = await supabase
      .from('admission_call_logs')
      .select('id, call_sid, institution_id, recording_url, cost_amount')
      .eq('id', id)
      .single();

    if (fetchError || !callLog) {
      return NextResponse.json({ error: 'Call not found' }, { status: 404 });
    }

    if (!callLog.recording_url) {
      return NextResponse.json({ error: 'No recording available for this call' }, { status: 400 });
    }

    const result = await CallIntelligenceService.analyzeCall(
      {
        call_log_id: callLog.id,
        call_sid: callLog.call_sid,
        institution_id: callLog.institution_id,
      },
      supabase
    );

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: { intelligence_id: result.intelligence_id },
      message: 'Analysis submitted. Results will arrive in 30s-5min.',
    });
  } catch (error) {
    logger.error('telephony/api', 'Analyze call failed', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Analysis failed' },
      { status: 500 }
    );
  }
}
```

**Commit:**

```bash
git add app/api/admission/calls/[id]/analyze/route.ts
git commit -m "feat(telephony): add POST /calls/[id]/analyze — trigger ExoVoiceAnalyze"
```

---

### Task 1.7: API Route — Get Call Intelligence

**Files:**
- Create: `app/api/admission/calls/[id]/intelligence/route.ts`

```typescript
// GET /api/admission/calls/[id]/intelligence
import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/supabase/server';
import { CallIntelligenceService } from '@/lib/services/telephony/call-intelligence-service';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAuthSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const { createServiceRoleClient } = await import('@/lib/supabase/server');
    const supabase = createServiceRoleClient();

    const intelligence = await CallIntelligenceService.getIntelligence(id, supabase);

    return NextResponse.json({
      success: true,
      data: intelligence,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch intelligence' },
      { status: 500 }
    );
  }
}
```

**Commit:**

```bash
git add app/api/admission/calls/[id]/intelligence/route.ts
git commit -m "feat(telephony): add GET /calls/[id]/intelligence"
```

---

### Task 1.8: Webhook — ExoVoiceAnalyze Results

**Files:**
- Create: `app/api/webhooks/telephony/voice-analyze/route.ts`

```typescript
// POST /api/webhooks/telephony/voice-analyze — ExoVoiceAnalyze async results
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { logger } from '@/lib/utils/enhanced-logger';
import { CallIntelligenceService } from '@/lib/services/telephony/call-intelligence-service';

function verifyAuth(request: NextRequest): boolean {
  const expectedToken = process.env.EXOTEL_API_TOKEN;
  if (!expectedToken) return true; // Allow if no token configured (alpha API)

  const token = request.headers.get('x-exotel-token')
    || request.headers.get('x-api-token')
    || request.nextUrl.searchParams.get('token')
    || '';

  if (!token || token.length !== expectedToken.length) return false;

  try {
    return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expectedToken));
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  try {
    logger.info('telephony/voice-analyze', 'Received ExoVoiceAnalyze callback');

    if (!verifyAuth(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let payload: any;
    const contentType = request.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      payload = await request.json();
    } else {
      const formData = await request.formData();
      payload = Object.fromEntries(formData.entries());
    }

    const result = await CallIntelligenceService.handleWebhookResult(payload);

    // Return 200 even on processing failure (don't trigger Exotel retries)
    return NextResponse.json({
      status: result.success ? 'ok' : 'error',
      message: result.error || 'processed',
    });
  } catch (error) {
    logger.error('telephony/voice-analyze', 'Webhook failed', error);
    return NextResponse.json({ status: 'ok' }); // Always 200 for webhooks
  }
}

export async function GET() {
  return NextResponse.json({
    service: 'ExoVoiceAnalyze Webhook',
    status: 'active',
    methods: ['POST'],
  });
}
```

**Commit:**

```bash
git add app/api/webhooks/telephony/voice-analyze/route.ts
git commit -m "feat(telephony): add ExoVoiceAnalyze webhook handler"
```

---

### Task 1.9: Webhook — Heartbeat Health Monitor

**Files:**
- Create: `app/api/webhooks/telephony/heartbeat/route.ts`

```typescript
// POST /api/webhooks/telephony/heartbeat — ExoPhone health events
import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/utils/enhanced-logger';
import { HealthMonitorService } from '@/lib/services/telephony/health-monitor-service';

export async function POST(request: NextRequest) {
  try {
    logger.info('telephony/heartbeat', 'Received heartbeat');

    let payload: any;
    const contentType = request.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      payload = await request.json();
    } else {
      const formData = await request.formData();
      payload = Object.fromEntries(formData.entries());
    }

    const result = await HealthMonitorService.handleHeartbeat(payload);

    return NextResponse.json({
      status: result.success ? 'ok' : 'error',
    });
  } catch (error) {
    logger.error('telephony/heartbeat', 'Heartbeat failed', error);
    return NextResponse.json({ status: 'ok' });
  }
}

export async function GET() {
  return NextResponse.json({
    service: 'Exotel Heartbeat Webhook',
    status: 'active',
  });
}
```

**Commit:**

```bash
git add app/api/webhooks/telephony/heartbeat/route.ts
git commit -m "feat(telephony): add ExoPhone heartbeat webhook handler"
```

---

### Task 1.10: API Route — Bulk SMS Send

**Files:**
- Create: `app/api/admission/sms/bulk-send/route.ts`

```typescript
// POST /api/admission/sms/bulk-send — Send personalized SMS to multiple leads
import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/supabase/server';
import { ExotelClient, type BulkSmsMessage } from '@/lib/services/telephony/exotel-client';
import { logger } from '@/lib/utils/enhanced-logger';

export async function POST(request: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { institution_id, messages } = body as {
      institution_id: string;
      messages: Array<{
        to: string;
        body: string;
        lead_id?: string;
        dlt_template_id?: string;
      }>;
    };

    if (!messages?.length) {
      return NextResponse.json({ error: 'No messages provided' }, { status: 400 });
    }

    if (messages.length > 500) {
      return NextResponse.json({ error: 'Max 500 messages per request' }, { status: 400 });
    }

    const { createServiceRoleClient } = await import('@/lib/supabase/server');
    const supabase = createServiceRoleClient();

    const dltEntityId = process.env.EXOTEL_DLT_ENTITY_ID;
    const callerId = process.env.EXOTEL_CALLER_ID || '';
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://jkkn.ai';
    const statusCallback = `${baseUrl}/api/webhooks/sms?provider=exotel`;

    // Split into batches of 100
    const batches: BulkSmsMessage[][] = [];
    for (let i = 0; i < messages.length; i += 100) {
      batches.push(
        messages.slice(i, i + 100).map((m) => ({
          To: m.to,
          Body: m.body,
          DltEntityId: dltEntityId,
          DltTemplateId: m.dlt_template_id,
          StatusCallback: statusCallback,
        }))
      );
    }

    let totalQueued = 0;
    let totalFailed = 0;
    const errors: string[] = [];

    for (const batch of batches) {
      try {
        const response = await ExotelClient.sendBulkSms(batch);
        const results = response.Messages || [];

        for (let i = 0; i < results.length; i++) {
          const result = results[i];
          const original = messages[totalQueued + totalFailed + i] || {};

          // Create SMS log entry
          await supabase.from('admission_sms_logs').insert({
            institution_id,
            lead_id: original.lead_id || null,
            phone_number: result.To || batch[i]?.To,
            provider: 'exotel',
            provider_message_id: result.Sid || null,
            message_content: batch[i]?.Body,
            status: result.Status === 'queued' ? 'queued' : 'failed',
            dlt_template_id: batch[i]?.DltTemplateId,
            dlt_entity_id: dltEntityId,
          });

          if (result.Status === 'queued') {
            totalQueued++;
          } else {
            totalFailed++;
            if (result.ErrorMessage) errors.push(`${result.To}: ${result.ErrorMessage}`);
          }
        }
      } catch (err) {
        logger.error('telephony/bulk-sms', 'Batch failed', err);
        totalFailed += batch.length;
        errors.push(err instanceof Error ? err.message : 'Batch failed');
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        total: messages.length,
        queued: totalQueued,
        failed: totalFailed,
        errors: errors.slice(0, 10), // Cap error list
      },
    });
  } catch (error) {
    logger.error('telephony/bulk-sms', 'Bulk send failed', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Bulk send failed' },
      { status: 500 }
    );
  }
}
```

**Commit:**

```bash
git add app/api/admission/sms/bulk-send/route.ts
git commit -m "feat(telephony): add POST /sms/bulk-send — batch personalized SMS"
```

---

### Task 1.11: API Route — Telephony Health Status

**Files:**
- Create: `app/api/admission/telephony/health/route.ts`

```typescript
// GET /api/admission/telephony/health — Current ExoPhone health
import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/supabase/server';
import { HealthMonitorService } from '@/lib/services/telephony/health-monitor-service';

export async function GET(request: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { createServiceRoleClient } = await import('@/lib/supabase/server');
    const supabase = createServiceRoleClient();

    const url = request.nextUrl;
    const history = url.searchParams.get('history') === 'true';

    const data = history
      ? await HealthMonitorService.getHealthHistory(supabase, 50)
      : await HealthMonitorService.getCurrentHealth(supabase);

    return NextResponse.json({
      success: true,
      data,
      metadata: { count: data.length, mode: history ? 'history' : 'current' },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch health' },
      { status: 500 }
    );
  }
}
```

**Commit:**

```bash
git add app/api/admission/telephony/health/route.ts
git commit -m "feat(telephony): add GET /telephony/health — ExoPhone status"
```

---

### Task 1.12: React Query Hooks — Intelligence + Health

**Files:**
- Create: `hooks/admission/use-call-intelligence.ts`

```typescript
// hooks/admission/use-call-intelligence.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export const callIntelligenceKeys = {
  all: ['call-intelligence'] as const,
  detail: (callLogId: string) => [...callIntelligenceKeys.all, callLogId] as const,
};

export function useCallIntelligence(callLogId: string) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: callIntelligenceKeys.detail(callLogId),
    queryFn: async () => {
      const res = await fetch(`/api/admission/calls/${callLogId}/intelligence`);
      if (!res.ok) throw new Error('Failed to fetch intelligence');
      const json = await res.json();
      return json.data;
    },
    enabled: !!callLogId,
    staleTime: 30_000,
  });

  return { intelligence: data, isLoading, error, refetch };
}

export function useAnalyzeCall() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (callLogId: string) => {
      const res = await fetch(`/api/admission/calls/${callLogId}/analyze`, {
        method: 'POST',
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || 'Analysis failed');
      }
      return res.json();
    },
    onSuccess: (_, callLogId) => {
      queryClient.invalidateQueries({ queryKey: callIntelligenceKeys.detail(callLogId) });
    },
  });
}
```

**Files:**
- Create: `hooks/admission/use-telephony-health.ts`

```typescript
// hooks/admission/use-telephony-health.ts
import { useQuery } from '@tanstack/react-query';

export const telephonyHealthKeys = {
  all: ['telephony-health'] as const,
  current: () => [...telephonyHealthKeys.all, 'current'] as const,
  history: () => [...telephonyHealthKeys.all, 'history'] as const,
};

export function useTelephonyHealth() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: telephonyHealthKeys.current(),
    queryFn: async () => {
      const res = await fetch('/api/admission/telephony/health');
      if (!res.ok) throw new Error('Failed to fetch health');
      const json = await res.json();
      return json.data;
    },
    refetchInterval: 60_000, // Poll every minute
  });

  return { events: data || [], isLoading, error, refetch };
}

export function useTelephonyHealthHistory() {
  const { data, isLoading, error } = useQuery({
    queryKey: telephonyHealthKeys.history(),
    queryFn: async () => {
      const res = await fetch('/api/admission/telephony/health?history=true');
      if (!res.ok) throw new Error('Failed to fetch health history');
      const json = await res.json();
      return json.data;
    },
  });

  return { events: data || [], isLoading, error };
}
```

**Commit:**

```bash
git add hooks/admission/use-call-intelligence.ts hooks/admission/use-telephony-health.ts
git commit -m "feat(telephony): add hooks for call intelligence + telephony health"
```

---

### Task 1.13: Update hooks/admission/index.ts barrel export

**Files:**
- Modify: `hooks/admission/index.ts`

Add exports:

```typescript
export * from './use-call-intelligence';
export * from './use-telephony-health';
```

**Commit:**

```bash
git add hooks/admission/index.ts
git commit -m "chore: export new intelligence + health hooks from barrel"
```

---

### Task 1.14: Auto-analyze on answered call completion

**Files:**
- Modify: `lib/services/telephony/telephony-service.ts`

In `handleCallStatusCallback()`, after the existing `processCallIntelligence()` call (non-blocking), add auto-analysis trigger for answered calls:

```typescript
// After: processCallIntelligence(...)
// Add: auto-analyze answered calls
if (TERMINAL_STATUSES.includes(mappedStatus) && updateData.cost_amount && updateData.cost_amount > 0) {
  // Non-blocking: submit for transcription + sentiment
  import('./call-intelligence-service').then(({ CallIntelligenceService }) => {
    CallIntelligenceService.analyzeCall(
      { call_log_id: callLog.id, call_sid: CallSid, institution_id: callLog.institution_id },
      supabase
    ).catch(err => logger.warn('telephony/webhook', 'Auto-analyze failed', err));
  });
}
```

**Commit:**

```bash
git add lib/services/telephony/telephony-service.ts
git commit -m "feat(telephony): auto-analyze answered calls via ExoVoiceAnalyze"
```

---

### Task 1.15: Build verification — Phase 1

**Step 1: Run TypeScript check**

```bash
npx tsc --noEmit 2>&1 | grep -E "(telephony|intelligence|health|bulk-sms)" | head -20
```

Expected: No errors in new files.

**Step 2: Run full build**

```bash
NODE_OPTIONS="--max-old-space-size=8192" npm run build 2>&1 | tail -30
```

Expected: Build succeeds. New routes appear:
- `/api/admission/calls/[id]/analyze`
- `/api/admission/calls/[id]/intelligence`
- `/api/admission/sms/bulk-send`
- `/api/admission/telephony/health`
- `/api/webhooks/telephony/voice-analyze`
- `/api/webhooks/telephony/heartbeat`

**Step 3: Commit all Phase 1**

```bash
git add -A
git commit -m "feat(telephony): Phase 1 complete — ExoVoiceAnalyze + Bulk SMS + Heartbeat"
```

---

## Phase 2: Voice v3 + User Management (2-3 days)

**Capabilities:** C3 (Voice v3 Upgrade), C10 (User Management API)
**Dependencies:** Phase 1 complete (heartbeat monitors v3 too).

---

### Task 2.1: Database Migration — Phase 2 Tables

**Files:**
- Create: `supabase/migrations/admission/011_exotel_phase2.sql`

```sql
-- ================================================================
-- Exotel Phase 2: Call Legs + User Management
-- ================================================================

-- C3: Call Legs (Voice v3)
CREATE TABLE IF NOT EXISTS admission_call_legs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_log_id UUID NOT NULL REFERENCES admission_call_logs(id) ON DELETE CASCADE,
  leg_id TEXT NOT NULL,
  leg_type TEXT NOT NULL CHECK (leg_type IN ('from', 'to')),
  phone_number TEXT,
  status TEXT,
  duration_seconds INTEGER,
  recording_url TEXT,
  recording_channel TEXT CHECK (recording_channel IN ('single', 'dual')),
  started_at TIMESTAMPTZ,
  answered_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE admission_call_legs ENABLE ROW LEVEL SECURITY;
CREATE POLICY admission_call_legs_select ON admission_call_legs FOR SELECT TO authenticated USING (true);
CREATE POLICY admission_call_legs_service_all ON admission_call_legs FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX idx_call_legs_call ON admission_call_legs(call_log_id);

-- C10: Exotel User Management columns on profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS exotel_user_id TEXT,
  ADD COLUMN IF NOT EXISTS exotel_device_id TEXT,
  ADD COLUMN IF NOT EXISTS exotel_agent_status TEXT DEFAULT 'offline'
    CHECK (exotel_agent_status IN ('online', 'offline', 'busy', 'away'));

CREATE INDEX IF NOT EXISTS idx_profiles_exotel ON profiles(exotel_user_id) WHERE exotel_user_id IS NOT NULL;
```

**Apply + verify + commit.**

---

### Task 2.2: ExotelClient — Add Voice v3 Methods

**Files:**
- Modify: `lib/services/telephony/exotel-client.ts`

Add CCM subdomain support + v3 methods:

```typescript
/**
 * Get CCM base URL for Voice v2/v3 APIs.
 * Falls back to null if EXOTEL_CCM_SUBDOMAIN not configured.
 */
private static getCcmBaseUrl(version: 'v2' | 'v3' = 'v3'): string | null {
  const ccmSubdomain = process.env.EXOTEL_CCM_SUBDOMAIN;
  if (!ccmSubdomain) return null;
  const config = this.getConfig();
  return `https://${ccmSubdomain}/${version}/accounts/${config.accountSid}`;
}

static isCcmConfigured(): boolean {
  return !!process.env.EXOTEL_CCM_SUBDOMAIN;
}

// Voice v3 methods:
static async makeCallV3(params: MakeCallParams & {
  recordingChannels?: 'single' | 'dual';
  recordingFormat?: 'mp3';
}): Promise<any> { /* ... */ }

static async getCallDetailsV3(callSid: string): Promise<any> { /* ... */ }

static async getCallLegs(callSid: string): Promise<any> { /* ... */ }
```

---

### Task 2.3: ExotelClient — Add User Management Methods

```typescript
// User Management (CCM API)
static async createUser(params: { name: string; phone: string; email?: string }): Promise<any> { /* ... */ }
static async updateUserStatus(userId: string, status: 'online' | 'offline' | 'busy' | 'away'): Promise<any> { /* ... */ }
static async getUsers(): Promise<any> { /* ... */ }
```

---

### Tasks 2.4-2.8: Services, API Routes, Hooks for Voice v3 + User Mgmt

Following the same pattern as Phase 1:
- `lib/services/telephony/user-management-service.ts`
- `app/api/admission/calls/[id]/legs/route.ts`
- `app/api/admission/telephony/users/route.ts` (GET + POST sync)
- `app/api/admission/telephony/users/[id]/status/route.ts` (PUT)
- `hooks/admission/use-call-legs.ts`
- `hooks/admission/use-telephony-users.ts`
- Update `TelephonyService.initiateCall()` to use v3 when available

---

## Phase 3: Campaigns (4-5 days)

**Capabilities:** C4 (Call Campaigns), C6 (SMS Campaigns)
**Dependencies:** Phase 2 (v3 for campaign calls).

### Tasks 3.1-3.12:
- Migration: `012_exotel_phase3.sql` (call_campaigns, campaign_contacts, sms_campaigns tables)
- `lib/services/telephony/call-campaign-service.ts` (create, list, get, pause, resume)
- `lib/services/telephony/sms-campaign-v2-service.ts` (Exotel native campaigns)
- API routes: `app/api/admission/campaigns/calls/` (CRUD + [id])
- API routes: `app/api/admission/campaigns/sms/` (CRUD + [id])
- Webhooks: `campaign-status/route.ts`, `campaign-call/route.ts`, `sms-campaign/route.ts`
- Hooks: `use-call-campaigns.ts`, `use-sms-campaigns-v2.ts`
- UI pages: `/admission/campaigns/calls/page.tsx` (list), `/admission/campaigns/calls/[id]/page.tsx` (detail)
- UI pages: `/admission/campaigns/sms/page.tsx`, `/admission/campaigns/sms/[id]/page.tsx`
- Sidebar menu update: add Campaigns section

---

## Phase 4: WhatsApp + URL Tracking + Number Masking (5-6 days)

**Capabilities:** C7 (URL Tracking), C8 (WhatsApp), C9 (Number Masking)
**Dependencies:** Phase 3 (campaigns use link tracking).

### Tasks 4.1-4.15:
- Migration: `013_exotel_phase4.sql` (link_tracking, whatsapp_logs, number_masks tables)
- `lib/services/telephony/link-tracking-service.ts`
- `lib/services/telephony/whatsapp-service.ts`
- `lib/services/telephony/number-masking-service.ts`
- ExotelClient additions: `shortenUrl()`, `sendWhatsApp()`, `createNumberMask()`, `deallocateMask()`
- API routes for each capability
- Webhooks: `link-click/route.ts`, `whatsapp-dlr/route.ts`, `whatsapp-incoming/route.ts`, `mask-event/route.ts`
- Hooks: `use-link-tracking.ts`, `use-whatsapp.ts`, `use-number-masking.ts`
- UI: WhatsApp messaging in lead detail page, link analytics in campaign detail

---

## Summary

| Phase | Tasks | New Files | Modified Files |
|-------|-------|-----------|----------------|
| **Phase 1** | 15 tasks | 9 new | 2 modified |
| **Phase 2** | 8 tasks | 5 new | 2 modified |
| **Phase 3** | 12 tasks | 10 new | 2 modified |
| **Phase 4** | 15 tasks | 12 new | 2 modified |
| **TOTAL** | **50 tasks** | **36 new files** | **8 modified files** |

---

## Gotchas & Risks

| Risk | Mitigation |
|------|-----------|
| ExoVoiceAnalyze is alpha | Store job_id, retry on failure, graceful degradation |
| Bulk SMS HTTP 207 parsing | Handle per-message errors, don't treat 207 as failure |
| Voice v3 different subdomain | Feature-flagged via `EXOTEL_CCM_SUBDOMAIN` env var |
| Campaign API rate limits | Queue campaigns, don't submit >5000 contacts |
| WhatsApp template approval | Template management is manual via Exotel dashboard |
| Number masking requires Lead Assist add-on | Check availability before enabling in UI |
| DLT compliance for SMS | Entity ID and template ID mandatory for India |
