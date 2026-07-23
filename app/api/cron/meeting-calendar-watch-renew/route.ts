export const dynamic = 'force-dynamic';

// app/api/cron/meeting-calendar-watch-renew/route.ts
//
// Daily maintenance for the inbound Google Calendar sync (Universal Booking):
//   1. SAFETY RECONCILE every active host — re-check each confirmed future
//      booking directly (events.get). Catches pings Google never delivered AND
//      bookings that predate the watch channel (the smoke-test stale booking).
//   2. RENEW watch channels that are missing or expiring within 2 days.
//
// Order matters: reconcile reads the sync_token; startWatch re-seeds it. So we
// reconcile BEFORE renewing, or a renew would discard an unread delta.
//
// Auth pattern mirrors app/api/cron/meeting-workflows/route.ts:
//   Authorization: Bearer <CRON_SECRET>  (Vercel cron auto-fires), OR
//   ?secret=<CRON_SECRET>                (manual curl tests).

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/client';
import { GoogleCalendarService } from '@/lib/services/integrations/google-calendar-service';
import { CalendarSyncService } from '@/lib/services/meetings/calendar-sync-service';

const LOG_PREFIX = '[meetings/cal-watch-renew-cron]';
const RENEW_WINDOW_MS = 2 * 24 * 60 * 60 * 1000; // re-watch when < 2 days left

export async function GET(request: NextRequest): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.warn(`${LOG_PREFIX} CRON_SECRET not configured`);
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const authHeader = request.headers.get('authorization');
  const querySecret = request.nextUrl.searchParams.get('secret');
  if (authHeader !== `Bearer ${cronSecret}` && querySecret !== cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // `as any`: the watch_* columns are newer than the generated Database types
  // (avoids TS2589 / unknown-column — same pattern as the meeting-workflows cron).
  const supabase = createAdminClient() as any;
  const renewCutoff = new Date(Date.now() + RENEW_WINDOW_MS).toISOString();

  const { data: conns, error } = await supabase
    .from('meeting_host_google_connections')
    .select('host_profile_id, watch_expiration')
    .eq('status', 'active');
  if (error) {
    console.error(`${LOG_PREFIX} connection list failed:`, error.message);
    return NextResponse.json({ ok: false, error: error.message }, { status: 200 });
  }

  let reconciledHosts = 0;
  let cancelled = 0;
  let rescheduled = 0;
  let renewed = 0;

  for (const c of conns ?? []) {
    const hostId = c.host_profile_id as string;

    // 1. Safety reconcile (targeted — independent of the push channel).
    const r = await CalendarSyncService.safetyReconcile(supabase, hostId).catch((e) => {
      console.error(`${LOG_PREFIX} safetyReconcile ${hostId} threw:`, (e as Error).message);
      return null;
    });
    if (r?.ok) {
      reconciledHosts++;
      cancelled += r.cancelled;
      rescheduled += r.rescheduled;
    }

    // 2. Renew the watch if missing or near expiry.
    const exp = c.watch_expiration as string | null;
    if (!exp || exp < renewCutoff) {
      const ok = await GoogleCalendarService.startWatch(supabase, hostId).catch(() => false);
      if (ok) renewed++;
    }
  }

  console.log(
    `${LOG_PREFIX} done — hosts=${(conns ?? []).length} reconciled=${reconciledHosts} cancelled=${cancelled} rescheduled=${rescheduled} renewed=${renewed}`,
  );
  return NextResponse.json({
    ok: true,
    hosts: (conns ?? []).length,
    reconciledHosts,
    cancelled,
    rescheduled,
    renewed,
  });
}
