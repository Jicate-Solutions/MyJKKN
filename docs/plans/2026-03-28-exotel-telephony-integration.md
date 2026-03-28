# Exotel Telephony Integration — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Integrate Exotel cloud telephony into the Admission CRM for click-to-call, webhook-based call tracking, and call analytics — enabling counselors to call leads directly from the CRM with full recording, disposition, and cost tracking.

**Architecture:** Build an `ExotelClient` HTTP client that sends form-encoded requests to Exotel V1 API. Wire it into the existing `TelephonyService.initiateCall()` (currently a placeholder). Add a webhook endpoint for async call status updates using the CustomField bridge pattern to handle race conditions. Use Supabase Realtime for live call status in the UI.

**Tech Stack:** Next.js 14 (App Router), Supabase (Postgres + Realtime + RLS), React Query, Exotel V1 API, TypeScript, shadcn/ui, Tailwind CSS

**Scope:** Phase 1 MVP — Click-to-call + webhook processing + call analytics. No SMS switch (keep MSG91). No voice broadcast.

**Critical Context:**
- The `omm-dev` branch is a dead end (4,438 divergent commits, core client never written). Build from scratch.
- The `admission_call_logs` table, API routes, hooks, and counselor calls UI already exist (~40% scaffolded).
- `call_sid` column is NOT NULL — use `pending-{uuid}` placeholder pattern (already in code).
- Exotel V1 API accepts `application/x-www-form-urlencoded` and returns XML by default — append `.json` to all URLs.
- Exotel calls the counselor's phone FIRST, then bridges to the prospect.

---

## Phase 1: Database & Infrastructure (Tasks 1-3)

### Task 1: Run Database Migrations

**Files:**
- Execute SQL on Supabase production dashboard (SQL Editor)

**Step 1: Add 'exotel' to sms_provider enum**

Run this SQL in Supabase Dashboard → SQL Editor:

```sql
ALTER TYPE sms_provider ADD VALUE IF NOT EXISTS 'exotel';
```

**Step 2: Create communication_cost_log table**

```sql
CREATE TABLE IF NOT EXISTS communication_cost_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'sms', 'whatsapp', 'call', 'voice_broadcast')),
  event_type TEXT NOT NULL CHECK (event_type IN ('send', 'receive', 'call_minute', 'template_message')),
  unit_cost NUMERIC(10, 4) NOT NULL DEFAULT 0,
  quantity INTEGER NOT NULL DEFAULT 1,
  total_cost NUMERIC(10, 4) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'INR',
  reference_id UUID,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cost_log_institution ON communication_cost_log(institution_id);
CREATE INDEX IF NOT EXISTS idx_cost_log_channel ON communication_cost_log(channel);
CREATE INDEX IF NOT EXISTS idx_cost_log_reference ON communication_cost_log(reference_id);
CREATE INDEX IF NOT EXISTS idx_cost_log_created ON communication_cost_log(created_at DESC);

ALTER TABLE communication_cost_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cost_log_select" ON communication_cost_log
  FOR SELECT USING (
    institution_id IN (
      SELECT institution_id FROM profiles WHERE profiles.id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'super_admin'
    )
  );

-- INSERT restricted to service role only (server-side webhook handlers)
CREATE POLICY "cost_log_insert_service" ON communication_cost_log
  FOR INSERT WITH CHECK (
    current_setting('role') = 'service_role'
  );

CREATE POLICY "cost_log_update" ON communication_cost_log
  FOR UPDATE USING (
    institution_id IN (
      SELECT institution_id FROM profiles WHERE profiles.id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'super_admin'
    )
  );
```

**Step 3: Add call_sid index for webhook lookups**

```sql
CREATE INDEX IF NOT EXISTS idx_call_logs_call_sid ON admission_call_logs(call_sid);
```

**Step 4: Verify**

```sql
-- Check enum
SELECT enumlabel FROM pg_enum
WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'sms_provider')
ORDER BY enumsortorder;
-- Expected: msg91, twilio, exotel

-- Check table
SELECT table_name FROM information_schema.tables
WHERE table_name = 'communication_cost_log' AND table_schema = 'public';
-- Expected: communication_cost_log

-- Check index
SELECT indexname FROM pg_indexes WHERE tablename = 'admission_call_logs' AND indexname = 'idx_call_logs_call_sid';
-- Expected: idx_call_logs_call_sid
```

**Step 5: Enable Supabase Realtime on admission_call_logs**

In Supabase Dashboard → Database → Replication → add `admission_call_logs` to the Realtime publication (if not already enabled).

---

### Task 2: Create Phone Number Utility

**Files:**
- Create: `lib/utils/phone-number.ts`

**Step 1: Create the phone normalization utility**

This handles all Indian phone number formats (10-digit, 0-prefix, +91, 91, 0091):

```typescript
// lib/utils/phone-number.ts
// Phone number normalization for Indian numbers (Exotel integration)

/**
 * Normalize any Indian phone number to E.164 format: +91XXXXXXXXXX
 * Handles: 9876543210, 09876543210, +919876543210, 919876543210, 0091 9876543210
 */
export function normalizeIndianPhone(phone: string): string {
  // Strip all non-digit characters except leading +
  const cleaned = phone.replace(/[^\d+]/g, '');

  // Remove leading + if present
  const digits = cleaned.replace(/^\+/, '');

  // Handle various formats
  if (digits.length === 10) {
    // 9876543210 → +919876543210
    return `+91${digits}`;
  }
  if (digits.length === 11 && digits.startsWith('0')) {
    // 09876543210 → +919876543210
    return `+91${digits.slice(1)}`;
  }
  if (digits.length === 12 && digits.startsWith('91')) {
    // 919876543210 → +919876543210
    return `+91${digits.slice(2)}`;
  }
  if (digits.length === 13 && digits.startsWith('0091')) {
    // 00919876543210 → +919876543210
    return `+91${digits.slice(4)}`;
  }

  // If already in E.164 format with + prefix
  if (cleaned.startsWith('+91') && cleaned.length === 13) {
    return cleaned;
  }

  // Return as-is if we can't normalize (may be international)
  return phone;
}

/**
 * Convert to Exotel's expected format: 0XXXXXXXXXX (0-prefixed 11-digit)
 */
export function toExotelFormat(phone: string): string {
  const normalized = normalizeIndianPhone(phone);
  // +919876543210 → 09876543210
  if (normalized.startsWith('+91')) {
    return `0${normalized.slice(3)}`;
  }
  return phone;
}

/**
 * Mask phone number for logging: +91****3210
 */
export function maskPhone(phone: string): string {
  const normalized = normalizeIndianPhone(phone);
  if (normalized.length >= 10) {
    const last4 = normalized.slice(-4);
    const prefix = normalized.slice(0, normalized.length - 10);
    return `${prefix}****${last4}`;
  }
  return '****';
}

/**
 * Validate that a phone number looks like a valid Indian mobile number.
 * Indian mobile numbers start with 6-9.
 */
export function isValidIndianMobile(phone: string): boolean {
  const normalized = normalizeIndianPhone(phone);
  // Must be +91 followed by 10 digits starting with 6-9
  return /^\+91[6-9]\d{9}$/.test(normalized);
}
```

**Step 2: Commit**

```bash
git add lib/utils/phone-number.ts
git commit -m "feat(telephony): add Indian phone number normalization utility"
```

---

### Task 3: Create ExotelClient HTTP Client

**Files:**
- Create: `lib/services/telephony/exotel-client.ts`

**Step 1: Create the Exotel client class**

```typescript
// lib/services/telephony/exotel-client.ts
// HTTP client for Exotel V1 API — voice calls and SMS
//
// IMPORTANT: Exotel V1 API accepts application/x-www-form-urlencoded (NOT JSON).
// Append .json to URL paths to get JSON responses (default is XML).
//
// Auth: Basic HTTP Auth using base64(API_KEY:API_TOKEN)
// Docs: https://developer.exotel.com/api/

import { logger } from '@/lib/utils/enhanced-logger';
import { toExotelFormat, maskPhone } from '@/lib/utils/phone-number';

// ═══════════════════════════════════════════════════════════════════════════
// ERROR TYPES
// ═══════════════════════════════════════════════════════════════════════════

export class ExotelError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = 'ExotelError';
  }
}

export class ExotelConfigError extends ExotelError {
  constructor(missing: string[]) {
    super(
      `Exotel not configured. Missing: ${missing.join(', ')}`,
      'CONFIG_ERROR'
    );
    this.name = 'ExotelConfigError';
  }
}

export class ExotelApiError extends ExotelError {
  constructor(public statusCode: number, message: string, public body?: string) {
    super(message, 'API_ERROR');
    this.name = 'ExotelApiError';
  }
}

export class ExotelRateLimitError extends ExotelError {
  constructor() {
    super('Exotel rate limit exceeded. Please wait and retry.', 'RATE_LIMIT');
    this.name = 'ExotelRateLimitError';
  }
}

export class ExotelNetworkError extends ExotelError {
  constructor(originalError: Error) {
    super(
      `Could not reach Exotel: ${originalError.message}`,
      'NETWORK_ERROR'
    );
    this.name = 'ExotelNetworkError';
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface MakeCallParams {
  /** Counselor's phone number (Exotel calls this number FIRST) */
  from: string;
  /** Prospect's phone number (bridged after counselor picks up) */
  to: string;
  /** DB record UUID — passed as CustomField for webhook correlation */
  customField: string;
  /** Full URL for status callbacks */
  statusCallbackUrl: string;
  /** Override the default ExoPhone caller ID */
  callerId?: string;
  /** Max ring time in seconds (default: 30) */
  timeLimit?: number;
}

export interface ExotelCallResponse {
  /** Exotel's unique call identifier */
  callSid: string;
  /** Call status from Exotel */
  status: string;
  /** Raw response for debugging */
  raw?: Record<string, any>;
}

export interface ExotelCallbackPayload {
  CallSid: string;
  Status: string;
  Direction?: string;
  From?: string;
  To?: string;
  Duration?: string;
  RecordingUrl?: string;
  Price?: string;
  CustomField?: string;
  StartTime?: string;
  EndTime?: string;
  AnswerTime?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// CLIENT
// ═══════════════════════════════════════════════════════════════════════════

export class ExotelClient {
  private apiKey: string;
  private apiToken: string;
  private accountSid: string;
  private subdomain: string;
  private callerId: string;
  private timeout: number;
  private maxRetries: number;

  constructor() {
    const apiKey = process.env.EXOTEL_API_KEY;
    const apiToken = process.env.EXOTEL_API_TOKEN;
    const accountSid = process.env.EXOTEL_ACCOUNT_SID;
    const subdomain = process.env.EXOTEL_SUBDOMAIN || 'api.in.exotel.com';
    const callerId = process.env.EXOTEL_CALLER_ID;

    const missing: string[] = [];
    if (!apiKey) missing.push('EXOTEL_API_KEY');
    if (!apiToken) missing.push('EXOTEL_API_TOKEN');
    if (!accountSid) missing.push('EXOTEL_ACCOUNT_SID');
    if (!callerId) missing.push('EXOTEL_CALLER_ID');

    if (missing.length > 0) {
      throw new ExotelConfigError(missing);
    }

    this.apiKey = apiKey!;
    this.apiToken = apiToken!;
    this.accountSid = accountSid!;
    this.subdomain = subdomain;
    this.callerId = callerId!;
    this.timeout = 15_000; // 15 seconds
    this.maxRetries = 2;
  }

  /**
   * Get Basic Auth header value.
   * Exotel uses: Authorization: Basic base64(API_KEY:API_TOKEN)
   */
  private getAuthHeader(): string {
    const credentials = Buffer.from(`${this.apiKey}:${this.apiToken}`).toString('base64');
    return `Basic ${credentials}`;
  }

  /**
   * Build the base URL for API version.
   * V1: https://{subdomain}/v1/Accounts/{sid}
   */
  private getBaseUrl(version: 'v1' | 'v2' = 'v1'): string {
    return `https://${this.subdomain}/${version}/Accounts/${this.accountSid}`;
  }

  /**
   * Check if a status code is retryable (5xx or 429).
   */
  private isRetryable(status: number): boolean {
    return status === 429 || status >= 500;
  }

  /**
   * Execute an HTTP request with retry logic.
   */
  private async request(
    method: 'GET' | 'POST',
    path: string,
    body?: URLSearchParams
  ): Promise<Record<string, any>> {
    const url = `${this.getBaseUrl()}${path}`;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        const headers: Record<string, string> = {
          'Authorization': this.getAuthHeader(),
          'Accept': 'application/json',
        };
        if (body) {
          headers['Content-Type'] = 'application/x-www-form-urlencoded';
        }

        const response = await fetch(url, {
          method,
          headers,
          body: body?.toString(),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (response.status === 429) {
          if (attempt < this.maxRetries) {
            // Exponential backoff: 1s, 2s
            await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
            continue;
          }
          throw new ExotelRateLimitError();
        }

        if (!response.ok) {
          const text = await response.text().catch(() => '');
          if (this.isRetryable(response.status) && attempt < this.maxRetries) {
            await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
            continue;
          }
          throw new ExotelApiError(
            response.status,
            `Exotel API error ${response.status}: ${text.slice(0, 200)}`,
            text
          );
        }

        return await response.json();
      } catch (err) {
        if (err instanceof ExotelError) throw err;
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < this.maxRetries) {
          await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
          continue;
        }
      }
    }

    throw new ExotelNetworkError(lastError || new Error('Unknown error'));
  }

  /**
   * Initiate a click-to-call.
   *
   * Flow: Exotel calls `from` (counselor) first → when answered, bridges to `to` (prospect).
   *
   * Exotel V1 endpoint: POST /v1/Accounts/{sid}/Calls/connect.json
   * Content-Type: application/x-www-form-urlencoded
   */
  async makeCall(params: MakeCallParams): Promise<ExotelCallResponse> {
    const body = new URLSearchParams();
    body.set('From', toExotelFormat(params.from));
    body.set('To', toExotelFormat(params.to));
    body.set('CallerId', params.callerId || this.callerId);
    body.set('CustomField', params.customField);
    body.set('StatusCallback', params.statusCallbackUrl);
    body.set('StatusCallbackEvents[0]', 'terminal');
    body.set('StatusCallbackEvents[1]', 'answered');
    if (params.timeLimit) {
      body.set('TimeLimit', String(params.timeLimit));
    }

    logger.info('admission/telephony', 'Initiating Exotel call', {
      from: maskPhone(params.from),
      to: maskPhone(params.to),
      customField: params.customField,
    });

    const result = await this.request('POST', '/Calls/connect.json', body);

    // Exotel V1 response structure: { Call: { Sid, Status, ... } }
    const call = result?.Call || result;

    return {
      callSid: call.Sid || call.sid || '',
      status: call.Status || call.status || 'queued',
      raw: result,
    };
  }

  /**
   * Get call details from Exotel.
   * Useful as a fallback when webhook doesn't arrive.
   *
   * Exotel V1 endpoint: GET /v1/Accounts/{sid}/Calls/{callSid}.json
   */
  async getCallDetails(callSid: string): Promise<Record<string, any>> {
    return this.request('GET', `/Calls/${callSid}.json`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SINGLETON
// ═══════════════════════════════════════════════════════════════════════════

let _client: ExotelClient | null = null;

/**
 * Get or create the ExotelClient singleton.
 * Lazy initialization — only created when first called.
 * Throws ExotelConfigError if env vars are missing.
 */
export function getExotelClient(): ExotelClient {
  if (!_client) {
    _client = new ExotelClient();
  }
  return _client;
}

/**
 * Check if Exotel is configured (without throwing).
 */
export function isExotelConfigured(): boolean {
  return !!(
    process.env.EXOTEL_API_KEY &&
    process.env.EXOTEL_API_TOKEN &&
    process.env.EXOTEL_ACCOUNT_SID &&
    process.env.EXOTEL_CALLER_ID
  );
}

/**
 * Reset the singleton (for testing).
 */
export function resetExotelClient(): void {
  _client = null;
}
```

**Step 2: Commit**

```bash
git add lib/services/telephony/exotel-client.ts
git commit -m "feat(telephony): create ExotelClient HTTP client with auth, retry, and error handling"
```

---

## Phase 2: Service Layer Integration (Tasks 4-6)

### Task 4: Update TelephonyService — Add Webhook Handler + Wire ExotelClient

**Files:**
- Modify: `lib/services/telephony/telephony-service.ts`

**Step 1: Add the new types and status ordering constants after line 108**

Add after the `UpdateCallNotesInput` interface (line 108), before the SERVICE section:

```typescript
// ═══════════════════════════════════════════════════════════════════════════
// WEBHOOK TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface ExotelCallbackPayload {
  CallSid: string;
  Status: string;
  Direction?: string;
  From?: string;
  To?: string;
  Duration?: string;
  RecordingUrl?: string;
  Price?: string;
  CustomField?: string;
  StartTime?: string;
  EndTime?: string;
  AnswerTime?: string;
}

/**
 * Status ordering for idempotent webhook processing.
 * A webhook with a lower order than the current status is stale and should be skipped.
 */
const STATUS_ORDER: Record<string, number> = {
  'initiating': 0,
  'initiated': 1,
  'ringing': 2,
  'in-progress': 3,
  'completed': 4,
  'busy': 4,
  'no-answer': 4,
  'failed': 4,
  'cancelled': 4,
};

const TERMINAL_STATUSES = ['completed', 'busy', 'no-answer', 'failed', 'cancelled'];
```

**Step 2: Fix `isConfigured()` to use `EXOTEL_ACCOUNT_SID` (line 118-124)**

Replace the existing `isConfigured` method:

```typescript
  static isConfigured(): boolean {
    return !!(
      process.env.EXOTEL_API_KEY &&
      process.env.EXOTEL_API_TOKEN &&
      process.env.EXOTEL_ACCOUNT_SID &&
      process.env.EXOTEL_CALLER_ID
    );
  }
```

**Step 3: Replace `initiateCall()` method (lines 251-286)**

Replace the entire `initiateCall` method with the Exotel-integrated version:

```typescript
  static async initiateCall(input: InitiateCallInput, supabase: any): Promise<InitiateCallResult> {
    try {
      // TRAI compliance: no calls before 9 AM or after 9 PM IST
      const istHour = new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata', hour: 'numeric', hour12: false });
      const hour = parseInt(istHour, 10);
      if (hour < 9 || hour >= 21) {
        return {
          success: false,
          error: 'Calls are only allowed between 9:00 AM and 9:00 PM IST (TRAI regulation)',
        };
      }

      // Step 1: Create DB record with placeholder call_sid
      const recordId = crypto.randomUUID();
      const { data, error } = await supabase
        .from('admission_call_logs')
        .insert({
          id: recordId,
          institution_id: input.institution_id,
          lead_id: input.lead_id || null,
          counselor_id: input.counselor_id,
          to_number: input.prospect_phone,
          from_number: input.counselor_phone,
          direction: 'outbound',
          status: 'initiated',
          call_sid: `pending-${recordId}`,
        })
        .select('id')
        .single();

      if (error) throw new Error(error.message);

      // Step 2: Call Exotel API
      const { getExotelClient } = await import('./exotel-client');
      const client = getExotelClient();

      const appUrl = process.env.NEXT_PUBLIC_APP_URL || `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` || 'http://localhost:3000';

      const exotelResponse = await client.makeCall({
        from: input.counselor_phone,
        to: input.prospect_phone,
        customField: data.id,
        statusCallbackUrl: `${appUrl}/api/webhooks/telephony`,
        callerId: input.caller_id,
      });

      // Step 3: Update DB with real Exotel call_sid
      await supabase
        .from('admission_call_logs')
        .update({
          call_sid: exotelResponse.callSid,
          started_at: new Date().toISOString(),
        })
        .eq('id', data.id);

      return {
        success: true,
        call_sid: exotelResponse.callSid,
        call_log_id: data.id,
      };
    } catch (err) {
      // If we created a record but Exotel failed, mark it as failed
      const { ExotelError } = await import('./exotel-client');
      const errorMessage = err instanceof Error ? err.message : 'Failed to initiate call';

      return {
        success: false,
        error: errorMessage,
      };
    }
  }
```

**Step 4: Add `handleCallStatusCallback()` method after `updateCallNotes()` (after line 303)**

```typescript
  /**
   * Handle an Exotel call status webhook callback.
   * Uses idempotent status ordering to prevent regression from out-of-order webhooks.
   * Uses CustomField (DB record UUID) for correlation when call_sid isn't yet in the DB.
   */
  static async handleCallStatusCallback(
    payload: ExotelCallbackPayload,
    supabase: any
  ): Promise<{ processed: boolean; reason?: string }> {
    const { CallSid, Status, Duration, RecordingUrl, Price, CustomField, AnswerTime, EndTime } = payload;

    // Map Exotel status strings to our status values
    const statusMap: Record<string, CallStatus> = {
      'queued': 'initiated',
      'ringing': 'ringing',
      'in-progress': 'in-progress',
      'completed': 'completed',
      'busy': 'busy',
      'no-answer': 'no-answer',
      'failed': 'failed',
      'canceled': 'cancelled',
      'cancelled': 'cancelled',
    };

    const newStatus = statusMap[Status?.toLowerCase()] || 'failed';

    // Find the call record — try CustomField (DB UUID) first, then call_sid
    let record = null;

    if (CustomField) {
      const { data } = await supabase
        .from('admission_call_logs')
        .select('id, status, institution_id')
        .eq('id', CustomField)
        .single();
      record = data;
    }

    if (!record && CallSid) {
      const { data } = await supabase
        .from('admission_call_logs')
        .select('id, status, institution_id')
        .eq('call_sid', CallSid)
        .single();
      record = data;
    }

    if (!record) {
      return { processed: false, reason: 'Call record not found' };
    }

    // Idempotent status check: don't go backward
    const currentOrder = STATUS_ORDER[record.status] ?? 0;
    const newOrder = STATUS_ORDER[newStatus] ?? 0;

    if (newOrder < currentOrder) {
      return { processed: false, reason: `Stale webhook: ${newStatus} < ${record.status}` };
    }

    // Don't update if already terminal
    if (TERMINAL_STATUSES.includes(record.status)) {
      return { processed: false, reason: `Already terminal: ${record.status}` };
    }

    // Build update object
    const update: Record<string, any> = {
      status: newStatus,
      updated_at: new Date().toISOString(),
    };

    if (CallSid && !CallSid.startsWith('pending-')) {
      update.call_sid = CallSid;
    }

    if (Duration) {
      update.duration_seconds = parseInt(Duration, 10) || 0;
    }

    if (RecordingUrl) {
      update.recording_url = RecordingUrl;
    }

    if (Price) {
      update.cost_amount = parseFloat(Price) || 0;
      update.cost_currency = 'INR';
    }

    if (AnswerTime) {
      update.answered_at = AnswerTime;
    }

    if (EndTime && TERMINAL_STATUSES.includes(newStatus)) {
      update.ended_at = EndTime;
    }

    // Update with DB-level guard against concurrent terminal updates
    const { error } = await supabase
      .from('admission_call_logs')
      .update(update)
      .eq('id', record.id)
      .not('status', 'in', `(${TERMINAL_STATUSES.join(',')})`);

    if (error) {
      return { processed: false, reason: error.message };
    }

    // Log cost for terminal statuses
    if (TERMINAL_STATUSES.includes(newStatus) && Duration) {
      const durationMinutes = Math.ceil((parseInt(Duration, 10) || 0) / 60);
      const costPerMin = parseFloat(process.env.EXOTEL_CALL_COST_PER_MIN || '0.50');
      const totalCost = Price ? parseFloat(Price) : durationMinutes * costPerMin;

      if (totalCost > 0) {
        await supabase.from('communication_cost_log').insert({
          institution_id: record.institution_id,
          channel: 'call',
          event_type: 'call_minute',
          unit_cost: costPerMin,
          quantity: durationMinutes,
          total_cost: totalCost,
          currency: 'INR',
          reference_id: record.id,
          metadata: { call_sid: CallSid, exotel_price: Price },
        });
      }
    }

    return { processed: true };
  }
```

**Step 5: Commit**

```bash
git add lib/services/telephony/telephony-service.ts
git commit -m "feat(telephony): wire ExotelClient into TelephonyService with webhook handler and TRAI compliance"
```

---

### Task 5: Create Webhook Route

**Files:**
- Create: `app/api/webhooks/telephony/route.ts`

**Step 1: Create the webhook endpoint**

```typescript
// app/api/webhooks/telephony/route.ts
// POST /api/webhooks/telephony — Exotel call status callbacks
//
// Security: Validates x-exotel-token header using timing-safe comparison.
// Processing: Returns 200 immediately, processes in background via waitUntil.
// Idempotency: Status ordering in TelephonyService prevents backward transitions.

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { TelephonyService, type ExotelCallbackPayload } from '@/lib/services/telephony/telephony-service';
import { logger } from '@/lib/utils/enhanced-logger';
import { maskPhone } from '@/lib/utils/phone-number';
import crypto from 'crypto';

/**
 * Verify the webhook token using timing-safe comparison.
 */
function verifyWebhookAuth(request: NextRequest): boolean {
  const expectedToken = process.env.EXOTEL_API_TOKEN;
  if (!expectedToken) return false;

  // Check x-exotel-token header (primary)
  const headerToken = request.headers.get('x-exotel-token')
    || request.headers.get('x-api-token');

  if (!headerToken) return false;

  try {
    return crypto.timingSafeEqual(
      Buffer.from(headerToken),
      Buffer.from(expectedToken)
    );
  } catch {
    return false;
  }
}

/**
 * Parse form-encoded webhook body into typed payload.
 */
async function parsePayload(request: NextRequest): Promise<ExotelCallbackPayload> {
  const text = await request.text();
  const params = new URLSearchParams(text);

  return {
    CallSid: params.get('CallSid') || '',
    Status: params.get('Status') || '',
    Direction: params.get('Direction') || undefined,
    From: params.get('From') || undefined,
    To: params.get('To') || undefined,
    Duration: params.get('Duration') || undefined,
    RecordingUrl: params.get('RecordingUrl') || undefined,
    Price: params.get('Price') || undefined,
    CustomField: params.get('CustomField') || undefined,
    StartTime: params.get('StartTime') || undefined,
    EndTime: params.get('EndTime') || undefined,
    AnswerTime: params.get('AnswerTime') || undefined,
  };
}

/**
 * Process the webhook in the background.
 */
async function processWebhook(payload: ExotelCallbackPayload) {
  try {
    const supabase = createServiceRoleClient();
    const result = await TelephonyService.handleCallStatusCallback(payload, supabase);

    if (result.processed) {
      logger.info('admission/telephony', 'Webhook processed', {
        callSid: payload.CallSid,
        status: payload.Status,
        customField: payload.CustomField,
      });
    } else {
      logger.info('admission/telephony', 'Webhook skipped', {
        callSid: payload.CallSid,
        reason: result.reason,
      });
    }
  } catch (error) {
    logger.error('admission/telephony', 'Webhook processing failed', {
      callSid: payload.CallSid,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

export async function POST(request: NextRequest) {
  // Step 1: Verify authentication
  if (!verifyWebhookAuth(request)) {
    logger.warn('admission/telephony', 'Webhook auth failed');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Step 2: Parse payload
  const payload = await parsePayload(request);

  if (!payload.CallSid && !payload.CustomField) {
    return NextResponse.json({ error: 'Missing CallSid and CustomField' }, { status: 400 });
  }

  logger.info('admission/telephony', 'Webhook received', {
    callSid: payload.CallSid,
    status: payload.Status,
    from: payload.From ? maskPhone(payload.From) : undefined,
    to: payload.To ? maskPhone(payload.To) : undefined,
  });

  // Step 3: Respond 200 immediately, process in background
  // NOTE: Using waitUntil when available (Vercel), otherwise process synchronously
  const responsePromise = processWebhook(payload);

  // Try to use waitUntil for background processing
  try {
    const { waitUntil } = await import('@vercel/functions');
    waitUntil(responsePromise);
  } catch {
    // Not on Vercel — process synchronously
    await responsePromise;
  }

  return NextResponse.json({ received: true, processed: true });
}

/**
 * GET — Health check for webhook endpoint.
 */
export async function GET() {
  return NextResponse.json({
    status: 'active',
    provider: 'exotel',
    configured: !!process.env.EXOTEL_API_TOKEN,
  });
}
```

**Step 2: Commit**

```bash
git add app/api/webhooks/telephony/route.ts
git commit -m "feat(telephony): add Exotel webhook route with auth, background processing, and health check"
```

---

### Task 6: Update Initiate Call API Route — Add Rate Limiting & PII Masking

**Files:**
- Modify: `app/api/admission/calls/initiate/route.ts`

**Step 1: Replace the entire route file**

Update the existing file to add rate limiting, phone validation, TRAI time checks, and PII masking:

```typescript
// app/api/admission/calls/initiate/route.ts
// POST /api/admission/calls/initiate — Initiate a click-to-call via Exotel

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, createServiceRoleClient } from '@/lib/supabase/server';
import { TelephonyService } from '@/lib/services/telephony/telephony-service';
import { logger } from '@/lib/utils/enhanced-logger';
import { isValidIndianMobile, maskPhone, normalizeIndianPhone } from '@/lib/utils/phone-number';

export async function POST(request: NextRequest) {
  try {
    // Authenticate
    const { user, error: authError } = await getAuthUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: 'UNAUTHORIZED', message: 'Authentication required' },
        { status: 401 }
      );
    }

    // Check Exotel configuration
    if (!TelephonyService.isConfigured()) {
      return NextResponse.json(
        { error: 'NOT_CONFIGURED', message: 'Telephony service is not configured. Contact your administrator.' },
        { status: 503 }
      );
    }

    // Parse body
    const body = await request.json();
    const { institution_id, counselor_phone, prospect_phone, lead_id, caller_id } = body;

    // Validate required fields
    if (!institution_id) {
      return NextResponse.json(
        { error: 'VALIDATION_ERROR', message: 'institution_id is required' },
        { status: 400 }
      );
    }
    if (!counselor_phone) {
      return NextResponse.json(
        { error: 'VALIDATION_ERROR', message: 'counselor_phone is required' },
        { status: 400 }
      );
    }
    if (!prospect_phone) {
      return NextResponse.json(
        { error: 'VALIDATION_ERROR', message: 'prospect_phone is required' },
        { status: 400 }
      );
    }

    // Validate phone numbers
    if (!isValidIndianMobile(prospect_phone)) {
      return NextResponse.json(
        { error: 'VALIDATION_ERROR', message: 'Invalid prospect phone number. Must be a valid Indian mobile number.' },
        { status: 400 }
      );
    }

    const supabase = createServiceRoleClient();

    // Rate limiting: max 5 calls per counselor per minute (prevents double-clicks and abuse)
    const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString();
    const { count: recentCallCount } = await supabase
      .from('admission_call_logs')
      .select('id', { count: 'exact', head: true })
      .eq('counselor_id', user.id)
      .gte('created_at', oneMinuteAgo);

    if ((recentCallCount ?? 0) >= 5) {
      return NextResponse.json(
        { error: 'RATE_LIMITED', message: 'Too many calls. Please wait a moment before trying again.' },
        { status: 429 }
      );
    }

    // Duplicate call check: prevent calling the same prospect within 30 seconds
    const thirtySecsAgo = new Date(Date.now() - 30_000).toISOString();
    const normalizedProspect = normalizeIndianPhone(prospect_phone);
    const { count: duplicateCount } = await supabase
      .from('admission_call_logs')
      .select('id', { count: 'exact', head: true })
      .eq('counselor_id', user.id)
      .eq('to_number', normalizedProspect)
      .gte('created_at', thirtySecsAgo);

    if ((duplicateCount ?? 0) > 0) {
      return NextResponse.json(
        { error: 'DUPLICATE_CALL', message: 'A call to this number was just initiated. Please wait.' },
        { status: 429 }
      );
    }

    logger.info('admission/calls', 'Initiating call', {
      userId: user.id,
      leadId: lead_id,
      to: maskPhone(prospect_phone),
    });

    const result = await TelephonyService.initiateCall({
      institution_id,
      counselor_id: user.id,
      counselor_phone: normalizeIndianPhone(counselor_phone),
      prospect_phone: normalizeIndianPhone(prospect_phone),
      lead_id,
      caller_id,
    }, supabase);

    if (!result.success) {
      return NextResponse.json(
        {
          error: 'CALL_FAILED',
          message: result.error || 'Failed to initiate call',
          fallbackPhone: prospect_phone,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        call_sid: result.call_sid,
        call_log_id: result.call_log_id,
      },
      message: 'Call initiated — your phone will ring shortly',
    });
  } catch (error) {
    logger.error('admission/calls', 'Initiate call error', error);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'An unexpected error occurred. Please try again.' },
      { status: 500 }
    );
  }
}
```

**Step 2: Commit**

```bash
git add app/api/admission/calls/initiate/route.ts
git commit -m "feat(telephony): add rate limiting, phone validation, and PII masking to call initiation"
```

---

## Phase 3: Frontend — Live Call Status Hook (Task 7)

### Task 7: Create useLiveCallStatus Hook

**Files:**
- Create: `hooks/admission/use-live-call-status.ts`

**Step 1: Create the Supabase Realtime hook**

```typescript
// hooks/admission/use-live-call-status.ts
// Real-time call status updates via Supabase Realtime subscription.
// Falls back to polling if Realtime is unavailable.

'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import type { CallStatus } from '@/lib/services/telephony/telephony-service';

interface LiveCallState {
  status: CallStatus | null;
  duration: number;
  recordingUrl: string | null;
  isActive: boolean;
  isRinging: boolean;
  isConnected: boolean;
  isTerminal: boolean;
}

const TERMINAL_STATUSES: CallStatus[] = ['completed', 'busy', 'no-answer', 'failed', 'cancelled'];

export function useLiveCallStatus(callLogId: string | null): LiveCallState {
  const [status, setStatus] = useState<CallStatus | null>(null);
  const [duration, setDuration] = useState(0);
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);
  const [realtimeActive, setRealtimeActive] = useState(true);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  // Supabase Realtime subscription
  useEffect(() => {
    if (!callLogId) return;

    const supabase = createClientSupabaseClient();
    const channel = supabase
      .channel(`call-status-${callLogId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'admission_call_logs',
          filter: `id=eq.${callLogId}`,
        },
        (payload) => {
          const newData = payload.new as any;
          setStatus(newData.status);
          setDuration(newData.duration_seconds || 0);
          setRecordingUrl(newData.recording_url || null);
        }
      )
      .subscribe((subscriptionStatus) => {
        if (subscriptionStatus !== 'SUBSCRIBED') {
          setRealtimeActive(false);
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [callLogId]);

  // Polling fallback (every 3 seconds) if Realtime is not available
  useEffect(() => {
    if (!callLogId || realtimeActive) return;
    if (status && TERMINAL_STATUSES.includes(status)) return;

    const poll = async () => {
      try {
        const supabase = createClientSupabaseClient();
        const { data } = await supabase
          .from('admission_call_logs')
          .select('status, duration_seconds, recording_url')
          .eq('id', callLogId)
          .single();

        if (data) {
          setStatus(data.status as CallStatus);
          setDuration(data.duration_seconds || 0);
          setRecordingUrl(data.recording_url || null);
        }
      } catch {
        // Silently fail polling
      }
    };

    pollingRef.current = setInterval(poll, 3000);
    poll(); // Initial fetch

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [callLogId, realtimeActive, status]);

  const isTerminal = status ? TERMINAL_STATUSES.includes(status) : false;

  return {
    status,
    duration,
    recordingUrl,
    isActive: !!status && !isTerminal,
    isRinging: status === 'ringing' || status === 'initiated',
    isConnected: status === 'in-progress',
    isTerminal,
  };
}
```

**Step 2: Commit**

```bash
git add hooks/admission/use-live-call-status.ts
git commit -m "feat(telephony): add useLiveCallStatus hook with Supabase Realtime and polling fallback"
```

---

## Phase 4: Frontend — Call UI Components (Tasks 8-9)

### Task 8: Create Click-to-Call Button Component

**Files:**
- Create: `components/admission/call-button.tsx`

**Step 1: Create the reusable call button**

```typescript
// components/admission/call-button.tsx
// Reusable click-to-call button for lead lists, detail pages, and dashboards.
// Handles: confirmation popover, phone validation, disabled states, error display.

'use client';

import { useState } from 'react';
import { Phone, PhoneOff, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useCallMutations } from '@/hooks/admission/use-call-mutations';
import { normalizeIndianPhone, maskPhone, isValidIndianMobile } from '@/lib/utils/phone-number';
import { toast } from 'sonner';

interface CallButtonProps {
  /** Institution ID for the call */
  institutionId: string;
  /** Prospect's phone number */
  prospectPhone: string;
  /** Prospect's name (for display) */
  prospectName?: string;
  /** Lead ID (optional, for linking call to lead) */
  leadId?: string;
  /** Counselor's phone number (the number Exotel will ring first) */
  counselorPhone: string;
  /** Button variant */
  variant?: 'default' | 'ghost' | 'outline' | 'icon';
  /** Button size */
  size?: 'default' | 'sm' | 'lg' | 'icon';
  /** Show text label or icon-only */
  iconOnly?: boolean;
  /** Callback when call is initiated successfully */
  onCallInitiated?: (callLogId: string) => void;
  /** Skip confirmation popover */
  skipConfirmation?: boolean;
  /** Additional class names */
  className?: string;
}

export function CallButton({
  institutionId,
  prospectPhone,
  prospectName,
  leadId,
  counselorPhone,
  variant = 'ghost',
  size = 'sm',
  iconOnly = false,
  onCallInitiated,
  skipConfirmation = false,
  className,
}: CallButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { initiateCall, isInitiating } = useCallMutations();

  const isValid = isValidIndianMobile(prospectPhone);
  const displayPhone = maskPhone(prospectPhone);

  const handleCall = () => {
    if (!isValid) {
      toast.error('Invalid phone number');
      return;
    }

    initiateCall.mutate(
      {
        institution_id: institutionId,
        counselor_phone: normalizeIndianPhone(counselorPhone),
        prospect_phone: normalizeIndianPhone(prospectPhone),
        lead_id: leadId,
      },
      {
        onSuccess: (data) => {
          setIsOpen(false);
          onCallInitiated?.(data.call_log_id);
        },
      }
    );
  };

  // Direct call (skip confirmation)
  if (skipConfirmation) {
    return (
      <Button
        variant={variant}
        size={size}
        onClick={handleCall}
        disabled={isInitiating || !isValid}
        className={className}
        title={isValid ? `Call ${prospectName || displayPhone}` : 'Invalid phone number'}
      >
        {isInitiating ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Phone className="h-4 w-4" />
        )}
        {!iconOnly && (
          <span className="ml-1.5">{isInitiating ? 'Connecting...' : 'Call'}</span>
        )}
      </Button>
    );
  }

  // With confirmation popover
  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant={variant}
          size={size}
          disabled={isInitiating || !isValid}
          className={className}
          title={isValid ? `Call ${prospectName || displayPhone}` : 'Invalid phone number'}
        >
          {isInitiating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Phone className="h-4 w-4" />
          )}
          {!iconOnly && <span className="ml-1.5">Call</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72" align="end">
        <div className="space-y-3">
          <div>
            <p className="font-medium text-sm">
              Call {prospectName || 'Lead'}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {displayPhone}
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            Your phone will ring first. Once you pick up, the call will be bridged to the prospect.
          </p>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsOpen(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleCall}
              disabled={isInitiating}
            >
              {isInitiating ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                  Connecting...
                </>
              ) : (
                <>
                  <Phone className="h-3.5 w-3.5 mr-1.5" />
                  Call Now
                </>
              )}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
```

**Step 2: Commit**

```bash
git add components/admission/call-button.tsx
git commit -m "feat(telephony): add CallButton component with confirmation popover and validation"
```

---

### Task 9: Create Floating Call Bar Component

**Files:**
- Create: `components/admission/floating-call-bar.tsx`

**Step 1: Create the floating call bar**

This component renders at the layout level and shows real-time call status. It persists across page navigation.

```typescript
// components/admission/floating-call-bar.tsx
// Floating call status bar — renders at layout level, persists across navigation.
// Shows: call status, timer, quick notes, and post-call disposition form.

'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Phone, PhoneOff, X, FileText, Clock, ChevronUp, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useLiveCallStatus } from '@/hooks/admission/use-live-call-status';
import { useCallMutations } from '@/hooks/admission/use-call-mutations';
import type { CallDisposition } from '@/lib/services/telephony/telephony-service';
import { cn } from '@/lib/utils';

interface FloatingCallBarProps {
  /** Active call log ID (null when no call is active) */
  callLogId: string | null;
  /** Lead/prospect name */
  prospectName?: string;
  /** Lead ID for linking */
  leadId?: string;
  /** Called when the bar is dismissed after call ends */
  onDismiss: () => void;
}

const DISPOSITIONS: { value: CallDisposition; label: string }[] = [
  { value: 'interested', label: 'Interested' },
  { value: 'not_interested', label: 'Not Interested' },
  { value: 'callback', label: 'Callback' },
  { value: 'not_reachable', label: 'Not Reachable' },
  { value: 'wrong_number', label: 'Wrong Number' },
  { value: 'busy', label: 'Busy' },
  { value: 'other', label: 'Other' },
];

export function FloatingCallBar({
  callLogId,
  prospectName,
  leadId,
  onDismiss,
}: FloatingCallBarProps) {
  const { status, duration, isActive, isRinging, isConnected, isTerminal } = useLiveCallStatus(callLogId);
  const { updateCallNotes, isUpdatingNotes } = useCallMutations();

  const [expanded, setExpanded] = useState(false);
  const [notes, setNotes] = useState('');
  const [disposition, setDisposition] = useState<CallDisposition | null>(null);
  const [followUpDate, setFollowUpDate] = useState('');
  const [timer, setTimer] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Start timer when call connects
  useEffect(() => {
    if (isConnected) {
      timerRef.current = setInterval(() => {
        setTimer(prev => prev + 1);
      }, 1000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isConnected]);

  // Stop timer when call ends
  useEffect(() => {
    if (isTerminal && timerRef.current) {
      clearInterval(timerRef.current);
    }
  }, [isTerminal]);

  // Auto-expand disposition form when call ends
  useEffect(() => {
    if (isTerminal) {
      setExpanded(true);
    }
  }, [isTerminal]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getStatusMessage = () => {
    if (!status) return 'Preparing...';
    switch (status) {
      case 'initiated': return 'Connecting...';
      case 'ringing': return 'Your phone is ringing — pick up to connect';
      case 'in-progress': return `In Progress — ${formatTime(duration || timer)}`;
      case 'completed': return `Call Ended — ${formatTime(duration || timer)}`;
      case 'busy': return 'Line Busy';
      case 'no-answer': return 'No Answer';
      case 'failed': return 'Call Failed';
      case 'cancelled': return 'Call Cancelled';
      default: return status;
    }
  };

  const getStatusColor = () => {
    if (isConnected) return 'bg-green-500';
    if (isRinging) return 'bg-yellow-500';
    if (isTerminal) return 'bg-gray-500';
    return 'bg-blue-500';
  };

  const handleSaveDisposition = useCallback(() => {
    if (!callLogId) return;

    updateCallNotes.mutate(
      {
        call_id: callLogId,
        call_notes: notes || undefined,
        call_disposition: disposition || undefined,
        follow_up_date: followUpDate || undefined,
      },
      {
        onSuccess: () => {
          onDismiss();
        },
      }
    );
  }, [callLogId, notes, disposition, followUpDate, updateCallNotes, onDismiss]);

  if (!callLogId) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-full max-w-lg mx-auto px-4">
      <div className="bg-card border rounded-lg shadow-lg overflow-hidden">
        {/* Status Bar (always visible) */}
        <div
          className="flex items-center justify-between px-4 py-3 cursor-pointer"
          onClick={() => setExpanded(!expanded)}
        >
          <div className="flex items-center gap-3">
            <div className={cn('w-2.5 h-2.5 rounded-full animate-pulse', getStatusColor())} />
            <div>
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4" />
                <span className="font-medium text-sm">
                  {prospectName || 'Calling...'}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                {getStatusMessage()}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isConnected && (
              <Badge variant="outline" className="text-green-600 border-green-600">
                <Clock className="h-3 w-3 mr-1" />
                {formatTime(duration || timer)}
              </Badge>
            )}
            {expanded ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
        </div>

        {/* Expanded Panel */}
        {expanded && (
          <div className="border-t px-4 py-3 space-y-3">
            {/* Quick Notes (during or after call) */}
            <div>
              <Label className="text-xs font-medium">Notes</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Quick notes during the call..."
                className="mt-1 text-sm resize-none"
                rows={2}
              />
            </div>

            {/* Disposition (shown after call ends) */}
            {isTerminal && (
              <>
                <div>
                  <Label className="text-xs font-medium">Outcome</Label>
                  <RadioGroup
                    value={disposition || ''}
                    onValueChange={(v) => setDisposition(v as CallDisposition)}
                    className="mt-1 grid grid-cols-2 gap-1.5"
                  >
                    {DISPOSITIONS.map((d) => (
                      <div key={d.value} className="flex items-center space-x-2">
                        <RadioGroupItem value={d.value} id={d.value} />
                        <Label htmlFor={d.value} className="text-xs cursor-pointer">
                          {d.label}
                        </Label>
                      </div>
                    ))}
                  </RadioGroup>
                </div>

                <div>
                  <Label className="text-xs font-medium">Follow-up Date</Label>
                  <Input
                    type="date"
                    value={followUpDate}
                    onChange={(e) => setFollowUpDate(e.target.value)}
                    className="mt-1 text-sm"
                    min={new Date().toISOString().split('T')[0]}
                  />
                </div>

                <div className="flex justify-between pt-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onDismiss}
                  >
                    Skip
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSaveDisposition}
                    disabled={isUpdatingNotes}
                  >
                    <FileText className="h-3.5 w-3.5 mr-1.5" />
                    {isUpdatingNotes ? 'Saving...' : 'Save & Close'}
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add components/admission/floating-call-bar.tsx
git commit -m "feat(telephony): add FloatingCallBar component with live status, notes, and disposition"
```

---

## Phase 5: Integration & Testing (Tasks 10-12)

### Task 10: Create Mock ExotelClient for Development

**Files:**
- Create: `lib/services/telephony/exotel-client-mock.ts`

**Step 1: Create the mock client**

```typescript
// lib/services/telephony/exotel-client-mock.ts
// Mock ExotelClient for local development and testing.
// Set EXOTEL_MOCK=true in env to use this instead of real Exotel.
// Simulates call flow with delayed webhook callbacks.

import { logger } from '@/lib/utils/enhanced-logger';
import type { MakeCallParams, ExotelCallResponse } from './exotel-client';

export class MockExotelClient {
  async makeCall(params: MakeCallParams): Promise<ExotelCallResponse> {
    const fakeSid = `mock-${crypto.randomUUID().slice(0, 8)}`;

    logger.info('admission/telephony', '[MOCK] Simulating Exotel call', {
      from: params.from,
      to: params.to,
      customField: params.customField,
      fakeSid,
    });

    // Simulate network latency
    await new Promise(r => setTimeout(r, 500));

    // Simulate failures for testing (numbers ending in 0000)
    if (params.to.endsWith('0000')) {
      throw new Error('Mock: Invalid phone number');
    }

    // Fire simulated webhook callbacks asynchronously
    this.simulateWebhookCallbacks(params, fakeSid);

    return {
      callSid: fakeSid,
      status: 'queued',
    };
  }

  private async simulateWebhookCallbacks(params: MakeCallParams, callSid: string) {
    const baseUrl = params.statusCallbackUrl;
    const token = process.env.EXOTEL_API_TOKEN || 'mock-token';

    // Simulate: ringing after 2s, in-progress after 5s, completed after 15s
    const webhooks = [
      { delay: 2000, status: 'ringing' },
      { delay: 5000, status: 'in-progress' },
      { delay: 15000, status: 'completed', duration: '10', price: '0.50' },
    ];

    for (const wh of webhooks) {
      setTimeout(async () => {
        try {
          const body = new URLSearchParams({
            CallSid: callSid,
            Status: wh.status,
            CustomField: params.customField,
            From: params.from,
            To: params.to,
            ...(wh.duration ? { Duration: wh.duration } : {}),
            ...(wh.price ? { Price: wh.price } : {}),
          });

          await fetch(baseUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'x-exotel-token': token,
            },
            body: body.toString(),
          });
        } catch (err) {
          logger.warn('admission/telephony', '[MOCK] Webhook simulation failed', err);
        }
      }, wh.delay);
    }
  }

  async getCallDetails(callSid: string): Promise<Record<string, any>> {
    return {
      Call: {
        Sid: callSid,
        Status: 'completed',
        Duration: '10',
        Price: '0.50',
      },
    };
  }
}
```

**Step 2: Update ExotelClient singleton to support mock mode**

Modify `lib/services/telephony/exotel-client.ts` — add at the bottom, replacing the existing `getExotelClient` function:

```typescript
/**
 * Get or create the ExotelClient singleton.
 * In development with EXOTEL_MOCK=true, returns MockExotelClient.
 */
export function getExotelClient(): ExotelClient {
  if (!_client) {
    if (process.env.EXOTEL_MOCK === 'true') {
      // Dynamic import to avoid bundling mock in production
      const { MockExotelClient } = require('./exotel-client-mock');
      _client = new MockExotelClient() as any;
    } else {
      _client = new ExotelClient();
    }
  }
  return _client;
}
```

**Step 3: Commit**

```bash
git add lib/services/telephony/exotel-client-mock.ts lib/services/telephony/exotel-client.ts
git commit -m "feat(telephony): add MockExotelClient for development with simulated webhook callbacks"
```

---

### Task 11: Create Webhook Simulation Script

**Files:**
- Create: `scripts/simulate-exotel-webhook.ts`

**Step 1: Create the simulation script**

```typescript
// scripts/simulate-exotel-webhook.ts
// Simulate an Exotel webhook callback for testing.
//
// Usage:
//   npx tsx scripts/simulate-exotel-webhook.ts <call-log-id> [status]
//
// Examples:
//   npx tsx scripts/simulate-exotel-webhook.ts abc-123 completed
//   npx tsx scripts/simulate-exotel-webhook.ts abc-123 ringing
//   npx tsx scripts/simulate-exotel-webhook.ts abc-123 in-progress

const callLogId = process.argv[2];
const status = process.argv[3] || 'completed';
const baseUrl = process.argv[4] || 'http://localhost:3000';

if (!callLogId) {
  console.error('Usage: npx tsx scripts/simulate-exotel-webhook.ts <call-log-id> [status] [base-url]');
  process.exit(1);
}

const token = process.env.EXOTEL_API_TOKEN || 'test-token';

const body = new URLSearchParams({
  CallSid: `sim-${Date.now()}`,
  Status: status,
  Duration: status === 'completed' ? '45' : '0',
  RecordingUrl: status === 'completed' ? 'https://example.com/recording.mp3' : '',
  Price: status === 'completed' ? '0.75' : '0',
  CustomField: callLogId,
  Direction: 'outbound',
  From: '09876543210',
  To: '09876543211',
});

async function main() {
  console.log(`Simulating Exotel webhook: ${status} for call ${callLogId}`);
  console.log(`URL: ${baseUrl}/api/webhooks/telephony`);

  const response = await fetch(`${baseUrl}/api/webhooks/telephony`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'x-exotel-token': token,
    },
    body: body.toString(),
  });

  const result = await response.json();
  console.log(`Response (${response.status}):`, JSON.stringify(result, null, 2));
}

main().catch(console.error);
```

**Step 2: Commit**

```bash
git add scripts/simulate-exotel-webhook.ts
git commit -m "feat(telephony): add webhook simulation script for local testing"
```

---

### Task 12: Environment Variables Setup

**Files:**
- Document only (set in Vercel Dashboard, not committed)

**Required Environment Variables:**

| Variable | Value | Where |
|----------|-------|-------|
| `EXOTEL_API_KEY` | From Exotel Dashboard → Settings → API | Vercel + .env.local |
| `EXOTEL_API_TOKEN` | From Exotel Dashboard → Settings → API | Vercel + .env.local |
| `EXOTEL_ACCOUNT_SID` | From Exotel Dashboard → Settings → API | Vercel + .env.local |
| `EXOTEL_SUBDOMAIN` | `api.in.exotel.com` (Mumbai region) | Vercel + .env.local |
| `EXOTEL_CALLER_ID` | Your ExoPhone number (e.g., `04440001234`) | Vercel + .env.local |
| `EXOTEL_CALL_COST_PER_MIN` | `0.50` (fallback if Exotel doesn't report) | Vercel |
| `EXOTEL_SMS_COST_PER_MSG` | `0.25` (fallback) | Vercel |
| `NEXT_PUBLIC_APP_URL` | `https://your-domain.com` | Vercel |

**For local development with mock mode:**

```env
# .env.local
EXOTEL_API_KEY=mock-key
EXOTEL_API_TOKEN=mock-token
EXOTEL_ACCOUNT_SID=mock-sid
EXOTEL_CALLER_ID=0000000000
EXOTEL_SUBDOMAIN=api.in.exotel.com
EXOTEL_MOCK=true
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

**For production (set in Vercel Dashboard → Environment Variables):**

All real Exotel credentials. Do NOT set `EXOTEL_MOCK`.

**Exotel Dashboard Configuration:**

1. Go to Exotel Dashboard → Settings → Webhooks
2. Set Status Callback URL: `https://your-domain.com/api/webhooks/telephony`
3. Configure webhook to send `x-exotel-token` header with the API token value
4. Events: `terminal`, `answered`
5. Method: POST

---

## Summary: File Inventory

### New Files (7)
| File | Purpose |
|------|---------|
| `lib/utils/phone-number.ts` | Indian phone number normalization |
| `lib/services/telephony/exotel-client.ts` | Exotel HTTP client (auth, retry, errors) |
| `lib/services/telephony/exotel-client-mock.ts` | Mock client for development |
| `app/api/webhooks/telephony/route.ts` | Webhook endpoint for call status |
| `hooks/admission/use-live-call-status.ts` | Supabase Realtime hook |
| `components/admission/call-button.tsx` | Reusable call button with confirmation |
| `components/admission/floating-call-bar.tsx` | Live call status bar |
| `scripts/simulate-exotel-webhook.ts` | Webhook testing tool |

### Modified Files (2)
| File | Change |
|------|--------|
| `lib/services/telephony/telephony-service.ts` | Add webhook handler, wire ExotelClient, fix env vars |
| `app/api/admission/calls/initiate/route.ts` | Add rate limiting, phone validation, PII masking |

### Database Changes (3)
| Change | Risk |
|--------|------|
| Add `'exotel'` to `sms_provider` enum | Zero — additive |
| Create `communication_cost_log` table | Zero — new table |
| Add `idx_call_logs_call_sid` index | Low — additive index |

### Deployment Order
1. Database migrations (Task 1)
2. Code deployment (Tasks 2-11) — inert without env vars
3. Set env vars + redeploy (Task 12)
4. Configure Exotel dashboard webhooks
5. Test with real call

### Estimated Effort
| Phase | Tasks | Estimate |
|-------|-------|----------|
| Database & Infrastructure | 1-3 | 2-3 hours |
| Service Layer | 4-6 | 3-4 hours |
| Frontend Hooks | 7 | 30 min |
| Frontend Components | 8-9 | 2-3 hours |
| Testing & Config | 10-12 | 1-2 hours |
| **Total** | **12 tasks** | **~8-12 hours** |
