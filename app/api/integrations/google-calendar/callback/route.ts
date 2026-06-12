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
    return back('failed');
  }
  return back('connected');
}
