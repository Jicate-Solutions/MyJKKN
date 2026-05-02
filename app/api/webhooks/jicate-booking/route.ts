// app/api/webhooks/jicate-booking/route.ts
//
// F4 — Inbound webhook from jicate-booking-prod (Cal.com self-host) that
// mirrors booking events into MyJKKN's jicate_booking_mirror table.
//
// Auth model:
//   - Sender (jicate-booking-prod) computes HMAC-SHA256(rawBody,
//     CAL_BOOKING_WEBHOOK_SECRET) and sends the hex digest in
//     `X-Cal-Signature-256` (Cal.com's standard header — verified in
//     jicate-booking source packages/features/webhooks/lib/sendPayload.ts).
//   - We verify with crypto.timingSafeEqual to prevent timing-side-channel
//     leakage. ANY signature mismatch returns 401.
//
// Idempotency:
//   - Body MUST contain `payload.uid` (Cal.com Booking.uid).
//   - Repeated calls with the same uid UPDATE the existing mirror row
//     (guaranteed by the UNIQUE constraint in
//     20260502000006_create_jicate_booking_mirror.sql).
//
// Lock: jicate-booking-multi-tenant-90d clause A4.
// Spec: specs/jicate-booking-integration-f4-f7-spec.md §4.1
// Pattern: mirrors app/api/integrations/intent-platform/prospects/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  JicateBookingMirrorService,
  type CalWebhookPayload,
} from '@/lib/services/integrations/jicate-booking-mirror-service';

// ============================================================================
// PAYLOAD SCHEMA
// ============================================================================

const CAL_TRIGGER_EVENTS = [
  'BOOKING_CREATED',
  'BOOKING_RESCHEDULED',
  'BOOKING_CANCELLED',
  'BOOKING_REJECTED',
  'BOOKING_REQUESTED',
  'BOOKING_PAID',
  'BOOKING_PAYMENT_INITIATED',
  'MEETING_STARTED',
  'MEETING_ENDED',
  'MEETING_NO_SHOW',
] as const;

const calAttendeeSchema = z.object({
  email: z.string().email('attendee.email must be a valid email'),
  name: z.string().optional(),
  phone: z.string().optional(),
  timeZone: z.string().optional(),
});

const calOrganizerSchema = z.object({
  email: z.string().email('organizer.email must be a valid email'),
  name: z.string().optional(),
  timeZone: z.string().optional(),
});

const calBookingPayloadSchema = z.object({
  uid: z.string().min(1, 'payload.uid is required'),
  bookingId: z.number().int().nonnegative().optional(),
  eventTypeId: z.number().int().nonnegative().optional(),
  title: z.string().optional(),
  startTime: z.string().min(1, 'payload.startTime is required'),
  endTime: z.string().min(1, 'payload.endTime is required'),
  organizer: calOrganizerSchema,
  attendees: z.array(calAttendeeSchema).min(1, 'payload.attendees must have ≥1 entry'),
  cancellationReason: z.string().optional(),
  rescheduleUid: z.string().optional(),
  status: z.string().optional(),
});

const calWebhookSchema = z.object({
  triggerEvent: z.enum(CAL_TRIGGER_EVENTS),
  payload: calBookingPayloadSchema,
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
    console.error('[jicate-booking/webhook] Failed to read request body', err);
    return NextResponse.json(
      { error: 'INVALID_BODY', message: 'Could not read request body' },
      { status: 400 },
    );
  }

  // 2. Verify HMAC signature.
  const signature = request.headers.get('x-cal-signature-256');
  const valid = JicateBookingMirrorService.verifySignature(rawBody, signature);
  if (!valid) {
    console.warn('[jicate-booking/webhook] HMAC verification FAILED', {
      sigPresent: !!signature,
      bodyBytes: rawBody.length,
    });
    return NextResponse.json(
      { error: 'UNAUTHORIZED', message: 'Invalid or missing X-Cal-Signature-256' },
      { status: 401 },
    );
  }

  // 3. Parse JSON only AFTER signature passes (defence in depth).
  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch (err) {
    console.error('[jicate-booking/webhook] Body is not valid JSON', err);
    return NextResponse.json(
      { error: 'INVALID_JSON', message: 'Request body is not valid JSON' },
      { status: 400 },
    );
  }

  // 4. Validate shape with zod.
  const parsed = calWebhookSchema.safeParse(json);
  if (!parsed.success) {
    console.warn('[jicate-booking/webhook] Payload validation failed', {
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

  const payload: CalWebhookPayload = parsed.data;

  // 5. Ingest.
  try {
    const result = await JicateBookingMirrorService.ingestWebhook(payload);
    const elapsedMs = Date.now() - startedAt;

    console.log('[jicate-booking/webhook] SUCCESS', {
      cal_booking_uid: result.cal_booking_uid,
      trigger_event: payload.triggerEvent,
      action: result.action,
      status: result.status,
      host_user_id_resolved: result.host_user_id_resolved,
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
    console.error('[jicate-booking/webhook] Ingest failed', {
      cal_booking_uid: payload.payload.uid,
      trigger_event: payload.triggerEvent,
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
