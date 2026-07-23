export const dynamic = 'force-dynamic';

// app/api/webhooks/google-calendar/route.ts
//
// INBOUND Google Calendar push-notification receiver (Universal Booking).
// Google POSTs a CONTENTLESS ping here whenever a watched calendar changes
// (events.watch). We look the host up by the channel id, verify the ping is
// genuine, and run the incremental reconcile so meeting_bookings matches
// Google (cancel / reschedule). Closes the inbound gap found 2026-06-20.
//
// Public by necessity (Google has no MyJKKN session). MyJKKN has no auth
// middleware, so this route self-gates:
//   1. X-Goog-Channel-ID must match a stored watch_channel_id, AND
//   2. X-Goog-Resource-ID must match the stored watch_resource_id, AND
//   3. X-Goog-Channel-Token must equal HMAC(host, master secret).
// A ping failing any check is acknowledged (200) but ignored — we never 4xx,
// because Google retries non-2xx aggressively.

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/client';
import { GoogleCalendarService } from '@/lib/services/integrations/google-calendar-service';
import { CalendarSyncService } from '@/lib/services/meetings/calendar-sync-service';

const LOG_PREFIX = '[webhooks/google-calendar]';

// Always-200 ack. Body is irrelevant to Google; it only reads the status code.
function ack(): NextResponse {
  return NextResponse.json({ ok: true });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const channelId = request.headers.get('x-goog-channel-id');
  const resourceId = request.headers.get('x-goog-resource-id');
  const resourceState = request.headers.get('x-goog-resource-state');
  const channelToken = request.headers.get('x-goog-channel-token');

  // The first message after watch() is a handshake ('sync') — nothing changed.
  if (!channelId || resourceState === 'sync') return ack();

  // `as any`: the watch_* columns are newer than the generated Database types
  // (avoids TS2589 / unknown-column on the typed client — same pattern as the
  // meeting-workflows cron).
  const supabase = createAdminClient() as any;
  const { data: conn } = await supabase
    .from('meeting_host_google_connections')
    .select('host_profile_id, watch_resource_id, status')
    .eq('watch_channel_id', channelId)
    .maybeSingle();

  // Unknown channel → silent ack (don't reveal which channel ids exist).
  if (!conn) return ack();

  // Anti-spoof: resource id + HMAC token must match what we recorded at watch.
  const expectedToken = GoogleCalendarService.channelToken(conn.host_profile_id as string);
  const resourceMismatch =
    !!conn.watch_resource_id && !!resourceId && conn.watch_resource_id !== resourceId;
  const tokenMismatch = !!expectedToken && channelToken !== expectedToken;
  if (resourceMismatch || tokenMismatch) {
    console.warn(`${LOG_PREFIX} rejected ping for channel ${channelId} (resource/token mismatch)`);
    return ack();
  }

  // A broken connection can't be trusted to read; the renewal cron heals it.
  if (conn.status !== 'active') return ack();

  try {
    const result = await CalendarSyncService.reconcileHostFromGoogle(
      supabase,
      conn.host_profile_id as string,
    );
    if (result.cancelled || result.rescheduled) {
      console.log(
        `${LOG_PREFIX} host=${conn.host_profile_id} cancelled=${result.cancelled} rescheduled=${result.rescheduled}`,
      );
    }
  } catch (err) {
    // Swallow — a thrown error would make Google retry; we'd rather log and let
    // the next ping (or the safety cron) catch up.
    console.error(`${LOG_PREFIX} reconcile error:`, (err as Error).message);
  }

  return ack();
}
