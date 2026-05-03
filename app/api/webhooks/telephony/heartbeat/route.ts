// app/api/webhooks/telephony/heartbeat/route.ts
// Exotel telephony heartbeat webhook.
//
// BEFORE 2026-05-03 (M-6): silent no-op acknowledger. Inserted raw payload to
//   telephony_health_events and returned 200. CRITICAL events fired ZERO alerts.
//   An Exotel outage was invisible to the Director — see probe-pipeline-2026-05-03.md I2.
//
// AFTER 2026-05-03 (M-6, brand-integrity recovery):
//   - Always logs the event into telephony_health_events (existing table).
//   - For CRITICAL events: inserts a Director-facing notifications row pointing
//     at the calls dashboard, and emits a Sentry message at 'error' severity.
//   - Notification insert is fire-and-forget so the webhook still returns 200
//     quickly. Sentry capture is best-effort and wrapped defensively.
//
// Auth path (Bearer-token / x-exotel-token / x-api-token) is preserved.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import * as Sentry from '@sentry/nextjs';
import crypto from 'crypto';

// Heartbeat is a fast-path INSERT; 30s is generous headroom against the
// Vercel 10s default. Future CRITICAL-event branching (notification dispatch,
// Director WA alert) will benefit from this cushion.
export const maxDuration = 30;

// Notifications surface — links Director to the calls dashboard so they can
// see what's affected. Aligned with feedback_action_config_url_target_domain_not_meta.md
// (point at the live entity page, NOT a meta /admin/notifications surface).
const HEARTBEAT_NOTIFICATION_URL = '/admission/counselors/calls';

// Notifications recipient category for telephony outages.
const HEARTBEAT_NOTIFICATION_CATEGORY = 'system';

interface HeartbeatPayload {
  status_type?: 'OK' | 'WARNING' | 'CRITICAL' | 'PAYLOAD_TOO_LARGE' | string;
  connectivity_status?: string;
  virtual_number?: string;
  incoming_affected?: string[];
  outgoing_affected?: string[];
  alternate_exophone?: unknown;
  timestamp?: string;
  message?: string;
  [key: string]: unknown;
}

// ----------------------------------------------------------------------------
// Director-facing notifications insert. Fire-and-forget — caller does NOT
// await this so a slow notifications insert doesn't slow the webhook.
// ----------------------------------------------------------------------------
async function emitCriticalNotification(
  supabase: ReturnType<typeof createClient>,
  payload: HeartbeatPayload
): Promise<void> {
  try {
    const incomingAffected = Array.isArray(payload.incoming_affected)
      ? payload.incoming_affected.length
      : 0;
    const outgoingAffected = Array.isArray(payload.outgoing_affected)
      ? payload.outgoing_affected.length
      : 0;

    const title = `Telephony outage: ${payload.connectivity_status || 'connectivity affected'}`;
    const bodyParts: string[] = [];
    if (payload.message && typeof payload.message === 'string') {
      bodyParts.push(payload.message);
    }
    if (incomingAffected > 0) {
      bodyParts.push(`${incomingAffected} inbound DID(s) affected`);
    }
    if (outgoingAffected > 0) {
      bodyParts.push(`${outgoingAffected} outbound number(s) affected`);
    }
    if (payload.virtual_number) {
      bodyParts.push(`Virtual number: ${payload.virtual_number}`);
    }
    const body = bodyParts.length > 0
      ? bodyParts.join(' · ')
      : 'Exotel reported a CRITICAL connectivity event. Check the calls dashboard.';

    // Insert into the canonical notifications table. Director-side fan-out is
    // handled by the existing notification dispatcher pipeline. Per
    // feedback_action_config_url_target_domain_not_meta.md, action_config.url
    // must point at the live entity page, NOT /admin/notifications.
    const { error } = await (supabase as any)
      .from('notifications')
      .insert({
        title,
        body,
        category: HEARTBEAT_NOTIFICATION_CATEGORY,
        priority: 'high',
        action_type: 'navigate',
        action_config: { url: HEARTBEAT_NOTIFICATION_URL },
        metadata: {
          source: 'telephony.heartbeat',
          status_type: payload.status_type,
          virtual_number: payload.virtual_number,
          incoming_affected: payload.incoming_affected || [],
          outgoing_affected: payload.outgoing_affected || [],
          received_at: new Date().toISOString(),
        },
      });

    if (error) {
      console.error('[Heartbeat Webhook] notifications insert failed:', error);
    }
  } catch (err) {
    console.error('[Heartbeat Webhook] emitCriticalNotification threw:', err);
  }
}

// ----------------------------------------------------------------------------
// POST handler
// ----------------------------------------------------------------------------
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
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  let payload: HeartbeatPayload = {};
  try {
    payload = (await request.json()) as HeartbeatPayload;
  } catch (err) {
    // Malformed body — log it but still return 200 so Exotel doesn't retry-storm.
    console.error('[Heartbeat Webhook] JSON parse failed:', err);
    return NextResponse.json({ received: true, parse_error: true });
  }

  const statusType = (payload.status_type || 'CRITICAL').toString().toUpperCase();

  // 1. Always log to telephony_health_events. (Existing table — preserved
  //    behaviour from BEFORE this PR.) Awaited so the row is durably written
  //    before we return 200, but wrapped in try/catch so a transient DB blip
  //    doesn't make us 500 to Exotel.
  try {
    const { error } = await (supabase as any)
      .from('telephony_health_events')
      .insert({
        status_type: statusType,
        connectivity_status: payload.connectivity_status,
        incoming_affected: payload.incoming_affected || [],
        outgoing_affected: payload.outgoing_affected || [],
        alternate_exophones: payload.alternate_exophone || null,
        raw_payload: payload,
      });
    if (error) {
      console.error('[Heartbeat Webhook] telephony_health_events insert failed:', error);
    }
  } catch (err) {
    console.error('[Heartbeat Webhook] telephony_health_events insert threw:', err);
  }

  // 2. CRITICAL: page the Director via notifications + Sentry. Both are
  //    fire-and-forget / best-effort so we still return 200 fast.
  if (statusType === 'CRITICAL') {
    // Sentry — best-effort. captureMessage is sync-ish; wrap defensively.
    try {
      Sentry.captureMessage('Telephony heartbeat: CRITICAL', {
        level: 'error',
        tags: {
          source: 'telephony.heartbeat',
          status_type: statusType,
          virtual_number: payload.virtual_number || 'unknown',
        },
        extra: {
          connectivity_status: payload.connectivity_status,
          incoming_affected: payload.incoming_affected,
          outgoing_affected: payload.outgoing_affected,
          alternate_exophone: payload.alternate_exophone,
          message: payload.message,
        },
      });
    } catch (err) {
      console.error('[Heartbeat Webhook] Sentry.captureMessage threw:', err);
    }

    // Notifications — fire-and-forget. Errors logged inside the helper.
    void emitCriticalNotification(supabase, payload);
  }

  // WARNING / OK / PAYLOAD_TOO_LARGE → telephony_health_events row only,
  // no notification, no Sentry. Aligned with the brief: warnings are
  // log-only; only CRITICAL pages.

  return NextResponse.json({ received: true, status_type: statusType });
}
