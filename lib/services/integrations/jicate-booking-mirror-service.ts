// lib/services/integrations/jicate-booking-mirror-service.ts
//
// F4 — Inbound Cal.com webhook → jicate_booking_mirror ingestion.
//
// Verifies HMAC-SHA256 signatures from jicate-booking-prod (project_ref
// fkihmsuwruohdgsqvnxg) and idempotently upserts a mirror row keyed by
// Cal.com Booking.uid. The receiving API route
// (app/api/webhooks/jicate-booking/route.ts) is the only consumer — never
// call this from user-facing UI.
//
// Env: CAL_BOOKING_WEBHOOK_SECRET (must be set in Vercel; HMAC fails closed
//      if missing). Same secret is configured on jicate-booking-prod's
//      webhook entry pointing at https://www.jkkn.ai/api/webhooks/jicate-booking.
//
// Lock: jicate-booking-multi-tenant-90d clause A4 — "JOINable record visible
//       from MyJKKN's Supabase via cross-DB bridge". This service IS the
//       bridge.
//
// Pattern: mirrors lib/services/solutions/intent-platform-ingest-service.ts
// (Phase C4) — same HMAC verification + Zod validation + idempotent UPSERT
// shape, differing only in payload schema + env var name + target table.

import crypto from 'crypto';
import { createAdminClient } from '@/lib/supabase/client';

// ============================================================================
// PUBLIC TYPES — Cal.com v6 webhook payload shape
// ============================================================================

/**
 * Cal.com v6 webhook trigger events.
 * Source: jicate-booking/packages/features/webhooks/lib/constants.ts
 *
 * Not every event maps to a status change in our mirror — see
 * `mapTriggerEventToStatus` for the projection.
 */
export type CalWebhookTriggerEvent =
  | 'BOOKING_CREATED'
  | 'BOOKING_RESCHEDULED'
  | 'BOOKING_CANCELLED'
  | 'BOOKING_REJECTED'
  | 'BOOKING_REQUESTED'
  | 'BOOKING_PAID'
  | 'BOOKING_PAYMENT_INITIATED'
  | 'MEETING_STARTED'
  | 'MEETING_ENDED'
  | 'MEETING_NO_SHOW';

/**
 * The relevant subset of the Cal.com webhook payload that we mirror.
 * Cal.com sends additional fields (location, video metadata, organizer
 * timezone, etc.) — we capture the full payload in raw_payload for replay
 * but only project the columns below into typed mirror fields.
 */
export interface CalWebhookPayload {
  triggerEvent: CalWebhookTriggerEvent;
  payload: {
    uid: string; // Booking.uid — our idempotency key
    bookingId?: number; // Booking.id (numeric)
    eventTypeId?: number;
    title?: string;
    startTime: string; // ISO 8601
    endTime: string;   // ISO 8601
    organizer: {
      email: string;
      name?: string;
      timeZone?: string;
    };
    attendees: Array<{
      email: string;
      name?: string;
      phone?: string;
      timeZone?: string;
    }>;
    cancellationReason?: string;
    rescheduleUid?: string; // previous Booking.uid if rescheduled
    status?: string;
  };
}

export interface MirrorIngestResult {
  cal_booking_uid: string;
  action: 'created' | 'updated';
  host_user_id_resolved: boolean;
  status: string;
}

// ============================================================================
// SERVICE
// ============================================================================

export class JicateBookingMirrorService {
  /**
   * Constant-time HMAC-SHA256 verification of the raw request body against
   * the X-Cal-Signature-256 header. Fails closed (returns false) if the
   * CAL_BOOKING_WEBHOOK_SECRET env var is missing or the signature does
   * not exactly match.
   *
   * Always pass the raw request body BEFORE JSON.parse — re-stringifying
   * `request.json()` will reorder keys and break the signature.
   *
   * Cal.com algorithm (verified in jicate-booking source
   * packages/features/webhooks/lib/sendPayload.ts):
   *   createHmac("sha256", secret).update(body).digest("hex")
   */
  static verifySignature(rawBody: string, headerSig: string | null | undefined): boolean {
    const secret = process.env.CAL_BOOKING_WEBHOOK_SECRET;
    if (!secret) {
      console.error(
        '[jicate-booking/webhook] CAL_BOOKING_WEBHOOK_SECRET is not configured; rejecting all webhooks',
      );
      return false;
    }
    if (!headerSig || typeof headerSig !== 'string') {
      return false;
    }

    // Cal.com sends a bare hex digest (no `sha256=` prefix), but accept both
    // for forward compatibility with proxies that may add it.
    const cleanSig = headerSig.startsWith('sha256=') ? headerSig.slice(7) : headerSig;

    const computed = crypto
      .createHmac('sha256', secret)
      .update(rawBody, 'utf8')
      .digest('hex');

    const computedBuf = Buffer.from(computed, 'utf8');
    const providedBuf = Buffer.from(cleanSig, 'utf8');
    if (computedBuf.length !== providedBuf.length) {
      return false;
    }

    try {
      return crypto.timingSafeEqual(computedBuf, providedBuf);
    } catch {
      return false;
    }
  }

  /**
   * Map Cal.com trigger event → mirror.status enum value.
   * Aligns with the CHECK constraint on jicate_booking_mirror.status.
   */
  private static mapTriggerEventToStatus(event: CalWebhookTriggerEvent): string {
    switch (event) {
      case 'BOOKING_CREATED':
      case 'BOOKING_PAID':
      case 'BOOKING_PAYMENT_INITIATED':
        return 'confirmed';
      case 'BOOKING_RESCHEDULED':
        return 'rescheduled';
      case 'BOOKING_CANCELLED':
      case 'BOOKING_REJECTED':
        return 'cancelled';
      case 'BOOKING_REQUESTED':
        return 'pending';
      case 'MEETING_STARTED':
      case 'MEETING_ENDED':
        return 'completed';
      case 'MEETING_NO_SHOW':
        return 'no_show';
    }
  }

  /**
   * Resolve a Cal.com host email to a MyJKKN profiles.id.
   * Returns null when no matching profile exists — per OPEN-4 (spec §6),
   * the mirror row is persisted with host_user_id=NULL and a nightly
   * reconciliation job (separate spec) backfills later.
   */
  private static async resolveHostUserId(
    hostEmail: string,
  ): Promise<string | null> {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('profiles')
      .select('id')
      .ilike('email', hostEmail)
      .limit(1)
      .maybeSingle();

    if (error) {
      console.warn('[jicate-booking/webhook] profile lookup failed', {
        host_email: hostEmail,
        error: error.message,
      });
      return null;
    }
    return data?.id ?? null;
  }

  /**
   * Idempotently upsert a mirror row keyed by cal_booking_uid.
   * Uses the UNIQUE constraint on (cal_booking_uid) added in migration
   * 20260502000006_create_jicate_booking_mirror.sql.
   *
   * - On insert: persists the full row + raw_payload.
   * - On conflict (cal_booking_uid match): UPDATE mutable fields (status,
   *   start_time, end_time, raw_payload, webhook_event, webhook_received_at).
   *   Cal.com Booking.uid is stable across status changes (cancelled,
   *   completed) — same row gets updated. Reschedules emit a NEW uid so
   *   they create a new row, with reschedule_uid pointing at the old one.
   */
  static async ingestWebhook(
    body: CalWebhookPayload,
  ): Promise<MirrorIngestResult> {
    const supabase = createAdminClient();

    const hostEmail = body.payload.organizer.email;
    const attendee = body.payload.attendees[0]; // first attendee is canonical
    const status = JicateBookingMirrorService.mapTriggerEventToStatus(
      body.triggerEvent,
    );
    const hostUserId = await JicateBookingMirrorService.resolveHostUserId(hostEmail);

    const row = {
      cal_booking_uid: body.payload.uid,
      cal_booking_id: body.payload.bookingId ?? 0, // 0 sentinel if missing
      cal_event_type_id: body.payload.eventTypeId ?? null,
      host_user_id: hostUserId,
      host_email: hostEmail,
      host_name: body.payload.organizer.name ?? null,
      attendee_email: attendee?.email ?? '',
      attendee_name: attendee?.name ?? null,
      attendee_phone: attendee?.phone ?? null,
      start_time: body.payload.startTime,
      end_time: body.payload.endTime,
      timezone: body.payload.organizer.timeZone ?? attendee?.timeZone ?? null,
      status,
      cancellation_reason: body.payload.cancellationReason ?? null,
      reschedule_uid: body.payload.rescheduleUid ?? null,
      webhook_event: body.triggerEvent,
      webhook_received_at: new Date().toISOString(),
      raw_payload: body as unknown as Record<string, unknown>,
    };

    // 1. Existence check (drives created vs updated outcome).
    const { data: existing } = await supabase
      .from('jicate_booking_mirror')
      .select('id')
      .eq('cal_booking_uid', body.payload.uid)
      .limit(1)
      .maybeSingle();

    if (existing?.id) {
      const { error } = await supabase
        .from('jicate_booking_mirror')
        .update(row)
        .eq('id', existing.id);
      if (error) throw new Error(`mirror update failed: ${error.message}`);
      return {
        cal_booking_uid: body.payload.uid,
        action: 'updated',
        host_user_id_resolved: hostUserId !== null,
        status,
      };
    }

    const { error } = await supabase.from('jicate_booking_mirror').insert(row);
    if (error) throw new Error(`mirror insert failed: ${error.message}`);

    return {
      cal_booking_uid: body.payload.uid,
      action: 'created',
      host_user_id_resolved: hostUserId !== null,
      status,
    };
  }
}
