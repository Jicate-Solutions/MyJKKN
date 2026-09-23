export const dynamic = 'force-dynamic';

// app/api/integrations/google-read/disconnect/route.ts
//
// "Disconnect" on the Gmail/Drive card. Works whether or not the switch is on —
// nobody may ever be stuck connected.
//
// What it does, in every case: deletes MyJKKN's key (the vaulted refresh token),
// so MyJKKN can no longer read the person's mail or Drive.
//
// Whether it ALSO withdraws the permission at Google depends on the calendar:
// Google's revoke withdraws EVERY permission this OAuth client holds for that
// Google account, calendar included, and cannot remove just two scopes. So:
//   - calendar connected on the SAME Google account → the key is deleted, the
//     Google-side permission is left in place (the calendar needs it), and the
//     card tells the person how to remove it at Google themselves;
//   - otherwise → the permission is also withdrawn at Google.

import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { logGoogleRead, readOwnGrant } from '@/lib/services/integrations/google-read/connection';
import { revokeAtGoogle } from '@/lib/services/integrations/google-read/oauth';
import { GOOGLE_READ_CARD_PATH } from '@/lib/services/integrations/google-read/constants';

function back(flag: string): NextResponse {
  const app = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.jkkn.ai').replace(/\/$/, '');
  // 303 so the browser follows the form POST with a GET.
  return NextResponse.redirect(`${app}${GOOGLE_READ_CARD_PATH}?google_read=${flag}`, 303);
}

export async function POST(request: NextRequest) {
  // A form on our own page. Refuse a cross-site POST outright.
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) {
    const app = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '');
    if (!app || origin !== app) {
      return NextResponse.json({ error: 'Cross-site request refused.' }, { status: 403 });
    }
  }

  const supabase = (await createClient()) as unknown as SupabaseClient;
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    return NextResponse.json({ error: 'Please sign in first.' }, { status: 401 });
  }

  const grant = await readOwnGrant(supabase);

  let revokedAtGoogle = false;
  let keptForCalendar = false;
  if (grant) {
    const { data: cal } = await supabase
      .from('meeting_host_google_connections')
      .select('google_email, status')
      .eq('host_profile_id', user.id)
      .maybeSingle();
    const calendar = cal as { google_email?: string; status?: string } | null;
    const calendarRidesOnSameAccount =
      calendar?.status === 'active' &&
      (calendar.google_email ?? '').toLowerCase() === grant.googleEmail.toLowerCase();

    if (calendarRidesOnSameAccount) {
      keptForCalendar = true;
    } else {
      revokedAtGoogle = await revokeAtGoogle(grant.refreshToken);
    }
  }

  const { error: clearError } = await supabase.rpc('fn_ai_google_read_clear_token', {
    p_revoked_at_google: revokedAtGoogle,
  });
  if (clearError) {
    console.error('[google-read/disconnect] clear failed:', clearError.message);
    await logGoogleRead(supabase, 'disconnect', 'clear_failed');
    return back('disconnect_failed');
  }

  // The key is gone in every branch below; the flags differ only in what
  // happened at Google, so the card can say it truthfully.
  if (!grant || revokedAtGoogle) {
    await logGoogleRead(supabase, 'disconnect', grant ? 'revoked_at_google' : 'key_deleted');
    return back('disconnected');
  }
  if (keptForCalendar) {
    await logGoogleRead(supabase, 'disconnect', 'kept_for_calendar');
    return back('disconnected_kept_for_calendar');
  }
  await logGoogleRead(supabase, 'disconnect', 'revoke_failed');
  return back('disconnected_revoke_failed');
}
