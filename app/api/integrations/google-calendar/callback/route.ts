export const dynamic = 'force-dynamic';

// app/api/integrations/google-calendar/callback/route.ts
//
// Google OAuth redirect target (Universal Booking U2). Verifies the
// HMAC-signed state, exchanges the code, vaults the refresh token
// (fn_set_google_cal_token, service-role) and bounces back to the
// availability page with a status flag the UI (U3) renders as a banner.
//
// The redirect URI registered on the Google OAuth client must be exactly
// ${NEXT_PUBLIC_APP_URL}/api/integrations/google-calendar/callback.

import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { GoogleCalendarService } from '@/lib/services/integrations/google-calendar-service';

function back(flag: string): NextResponse {
  const app = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.jkkn.ai').replace(/\/$/, '');
  return NextResponse.redirect(`${app}/meetings/availability?google=${flag}`);
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const state = url.searchParams.get('state') ?? '';
  const code = url.searchParams.get('code') ?? '';
  const oauthError = url.searchParams.get('error');

  // User hit "cancel" on the consent screen — not an error condition.
  if (oauthError) return back('declined');

  const hostProfileId = GoogleCalendarService.verifyStateParam(state);
  if (!hostProfileId || !code) return back('invalid');

  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const result = await GoogleCalendarService.completeConnection(service, hostProfileId, code);
  if (!result.success) {
    console.error('[google-calendar/callback] connection failed:', result.error);

    // Calendar-connect lock (2026-08-18): count this failure. At the ceiling
    // (3 by policy) fn_calendar_lock_record_failure releases the person, so a
    // broken Google flow can never leave someone permanently unable to use
    // MyJKKN. Best effort on purpose — if the counter itself fails we still send
    // them back with a message rather than swallowing the original error.
    try {
      await (service as any).rpc('fn_calendar_lock_record_failure', {
        p_profile: hostProfileId,
      });
    } catch (counterErr) {
      console.error('[google-calendar/callback] failure counter failed:', counterErr);
    }
    return back('failed');
  }

  // Connected: drop the lock immediately rather than making them wait for the
  // hourly sweep. Someone who has just done what was asked must not stay held.
  try {
    await (service as any)
      .from('profiles')
      .update({ calendar_lock_active: false, calendar_lock_warned_at: null })
      .eq('id', hostProfileId);
  } catch (clearErr) {
    console.error('[google-calendar/callback] lock clear failed:', clearErr);
  }
  return back('connected');
}
