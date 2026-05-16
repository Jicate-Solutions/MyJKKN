// app/api/integrations/intent-platform/prospects/route.ts
//
// Phase C4 — Inbound webhook from the Intent Platform that drops new
// prospect leads into MyJKKN's Solutions Hub pipeline.
//
// Auth model:
//   - Sender computes HMAC-SHA256(rawBody, INTENT_PLATFORM_WEBHOOK_SECRET)
//     and sends the hex digest in `X-Intent-Signature` (optional `sha256=`
//     prefix accepted).
//   - We verify with crypto.timingSafeEqual to prevent timing-side-channel
//     leakage. ANY signature mismatch returns 401.
//
// Idempotency:
//   - Body MUST contain `intent_lead_id`. Repeated calls with the same id
//     UPDATE the existing prospect row instead of inserting a duplicate
//     (guaranteed by the partial unique index in
//     20260502000003_add_intent_columns_to_prospects.sql).
//
// Rate limiting:
//   - No project-level rate-limiter exists today, so we deliberately skip
//     in-line throttling. Vercel's per-route concurrency cap + the upstream
//     Intent Platform's own send rate are the primary defenses. If a flood
//     ever materializes, drop a token-bucket here keyed on intent_agency_id.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  IntentPlatformIngestService,
  type IntentLeadPayload,
} from '@/lib/services/solutions/intent-platform-ingest-service';

// ============================================================================
// PAYLOAD SCHEMA
// ============================================================================

// solution_type_interest must match sh_solution_type enum values exactly.
const SOLUTION_TYPES = [
  'software',
  'training',
  'content',
  'consulting',
  'research',
  'audit',
] as const;

const intentLeadPayloadSchema = z.object({
  intent_lead_id: z.string().min(1, 'intent_lead_id is required'),
  company_name: z.string().min(1, 'company_name is required'),
  contact_person: z.string().min(1, 'contact_person is required'),
  contact_phone: z.string().min(1, 'contact_phone is required'),
  contact_email: z.string().email().optional(),
  expected_deal_size: z.number().nonnegative().optional(),
  expected_close_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected_close_date must be ISO YYYY-MM-DD').optional(),
  solution_type_interest: z.enum(SOLUTION_TYPES).optional(),
  intent_agency_id: z.string().uuid().optional(),
  source: z.string().max(255).optional(),
  notes: z.string().max(10_000).optional(),
});

// ============================================================================
// ROUTE HANDLER
// ============================================================================

export async function POST(request: NextRequest) {
  const startedAt = Date.now();

  // 1. Read raw body BEFORE JSON.parse so the HMAC computation uses the
  //    exact bytes the sender signed.
  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch (err) {
    console.error('[intent-platform/ingest] Failed to read request body', err);
    return NextResponse.json(
      { error: 'INVALID_BODY', message: 'Could not read request body' },
      { status: 400 },
    );
  }

  // 2. Verify HMAC signature.
  const signature = request.headers.get('x-intent-signature');
  const valid = IntentPlatformIngestService.verifySignature(rawBody, signature);
  if (!valid) {
    console.warn('[intent-platform/ingest] HMAC verification FAILED', {
      sigPresent: !!signature,
      bodyBytes: rawBody.length,
    });
    return NextResponse.json(
      { error: 'UNAUTHORIZED', message: 'Invalid or missing X-Intent-Signature' },
      { status: 401 },
    );
  }

  // 3. Parse JSON only AFTER signature passes (defence in depth).
  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch (err) {
    console.error('[intent-platform/ingest] Body is not valid JSON', err);
    return NextResponse.json(
      { error: 'INVALID_JSON', message: 'Request body is not valid JSON' },
      { status: 400 },
    );
  }

  // 4. Validate shape with zod.
  const parsed = intentLeadPayloadSchema.safeParse(json);
  if (!parsed.success) {
    console.warn('[intent-platform/ingest] Payload validation failed', {
      issues: parsed.error.flatten(),
    });
    return NextResponse.json(
      {
        error: 'VALIDATION_ERROR',
        message: 'Payload failed schema validation',
        issues: parsed.error.flatten(),
      },
      { status: 422 },
    );
  }

  const payload: IntentLeadPayload = parsed.data;

  // 5. Ingest.
  try {
    const result = await IntentPlatformIngestService.ingestLead(payload);
    const elapsedMs = Date.now() - startedAt;

    console.log('[intent-platform/ingest] SUCCESS', {
      intent_lead_id: payload.intent_lead_id,
      action: result.action,
      prospect_id: result.prospect_id,
      prospect_code: result.prospect_code,
      elapsedMs,
    });

    return NextResponse.json(
      {
        ok: true,
        ...result,
      },
      { status: 200 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[intent-platform/ingest] Ingest failed', {
      intent_lead_id: payload.intent_lead_id,
      error: message,
    });
    return NextResponse.json(
      { error: 'INGEST_FAILED', message },
      { status: 500 },
    );
  }
}

// Reject all non-POST verbs explicitly so callers get a clean 405 instead
// of a Next.js 404.
export async function GET() {
  return NextResponse.json(
    { error: 'METHOD_NOT_ALLOWED', message: 'Use POST' },
    { status: 405 },
  );
}
