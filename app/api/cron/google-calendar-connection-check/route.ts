export const dynamic = 'force-dynamic';

// /api/cron/google-calendar-connection-check
//
// Daily validation of every active Google Calendar connection (Universal
// Booking, D19). A connection can silently die between bookings (password
// change, admin revoke); waiting for a visitor's slot request to discover it
// means a public page sat unprotected. This cron probes each active
// connection with a 1-minute freebusy call; failures flow through
// busyForHost → markConnectionBroken → auto-hide + host email.
//
// Pattern: app/api/cron/whatsapp-byow-health/route.ts (Bearer CRON_SECRET).

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { GoogleCalendarService } from '@/lib/services/integrations/google-calendar-service';

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase credentials');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function GET(request: Request) {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getServiceClient();
  const { data: connections, error } = await supabase
    .from('meeting_host_google_connections')
    .select('host_profile_id')
    .eq('status', 'active');
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const now = new Date();
  const probeEnd = new Date(now.getTime() + 60_000);
  let ok = 0;
  let broke = 0;

  for (const conn of connections ?? []) {
    const result = await GoogleCalendarService.busyForHost(
      supabase,
      conn.host_profile_id,
      now.toISOString(),
      probeEnd.toISOString(),
    );
    if (result.status === 'ok') {
      ok++;
    } else if (result.status === 'failed') {
      // invalid_grant already marked broken inside accessTokenForHost; other
      // failure shapes (API errors) get marked here so D19 still fires.
      await GoogleCalendarService.markConnectionBroken(
        supabase,
        conn.host_profile_id,
        'Daily connection check failed',
      );
      broke++;
    }
  }

  return NextResponse.json({ checked: (connections ?? []).length, ok, broke });
}
