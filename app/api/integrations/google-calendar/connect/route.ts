export const dynamic = 'force-dynamic';

// app/api/integrations/google-calendar/connect/route.ts
//
// Starts the per-host Google Calendar OAuth flow (Universal Booking U2).
// Auth-gated: the signed-in user connects THEIR OWN calendar — the host id
// comes from the session, never from a query param. State is HMAC-signed
// (10-min expiry) so the callback can trust it without server-side sessions.
//
// Pattern: explicit-error responses, never silent redirect (rule #27).

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  GoogleCalendarService,
  isGoogleCalConfigured,
} from '@/lib/services/integrations/google-calendar-service';

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    return NextResponse.json({ error: 'Please sign in first.' }, { status: 401 });
  }
  if (!isGoogleCalConfigured()) {
    return NextResponse.json(
      { error: 'Google Calendar integration is not configured on this deployment yet.' },
      { status: 503 },
    );
  }
  return NextResponse.redirect(GoogleCalendarService.buildAuthUrl(user.id));
}
