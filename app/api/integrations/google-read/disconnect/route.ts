export const dynamic = 'force-dynamic';

// app/api/integrations/google-read/disconnect/route.ts
//
// "Disconnect" on the Gmail/Drive card. Works whether or not the switch is on —
// nobody may ever be stuck connected.
//
// What it does: deletes MyJKKN's key (the vaulted refresh token), so MyJKKN can
// no longer read the person's mail or Drive.
//
// Whether it ALSO withdraws the permission at Google depends on the calendar:
// Google's revoke withdraws EVERY permission this OAuth client holds for that
// Google account, calendar included, and cannot remove just two scopes. So:
//   - calendar connected on the SAME Google account → the key is deleted, the
//     Google-side permission is left in place (the calendar needs it), and the
//     card tells the person how to remove it at Google themselves;
//   - otherwise → the permission is also withdrawn at Google.
//
// Order, so the banner can only ever say what really happened (repair round 1):
//   1. read the key; 2. if there is one, check the calendar row — if that READ
//   fails, stop here with nothing changed (never revoke on a guess: a revoke
//   would take the calendar down with it); 3. delete the key — if that fails,
//   stop here with nothing changed; 4. only then ask Google, and record it.

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

  // 1. the key. 'none' = no active connection (never connected, already
  //    disconnected, or Google withdrew it earlier); 'error' = the key could not
  //    be read (vault call failed, server secret missing, key no longer
  //    decrypts). In both, MyJKKN cannot ask Google — but the key is still
  //    deleted, so nobody is ever stuck connected.
  const read = await readOwnGrant(supabase);
  const grant = read.kind === 'ok' ? read.grant : null;

  // 2. does the calendar ride on the same Google account? Fail CLOSED.
  let calendarRidesOnSameAccount = false;
  if (grant) {
    const { data: cal, error: calError } = await supabase
      .from('meeting_host_google_connections')
      .select('google_email, status')
      .eq('host_profile_id', user.id)
      .maybeSingle();
    if (calError) {
      console.error('[google-read/disconnect] calendar check failed:', calError.message);
      await logGoogleRead(user.id, 'disconnect', 'calendar_check_failed');
      return back('disconnect_failed');
    }
    const calendar = cal as { google_email?: string; status?: string } | null;
    calendarRidesOnSameAccount =
      calendar?.status === 'active' &&
      (calendar.google_email ?? '').toLowerCase() === grant.googleEmail.toLowerCase();
  }

  // 3. delete the key — first, so a failure here means nothing has changed.
  const { error: clearError } = await supabase.rpc('fn_ai_google_read_clear_token', {
    p_revoked_at_google: false,
  });
  if (clearError) {
    console.error('[google-read/disconnect] clear failed:', clearError.message);
    await logGoogleRead(user.id, 'disconnect', 'clear_failed');
    return back('disconnect_failed');
  }

  // From here on the key is gone; the flags differ only in what happened at
  // Google, so the card can say it truthfully.
  if (!grant) {
    await logGoogleRead(user.id, 'disconnect', read.kind === 'error' ? 'key_unreadable' : 'key_deleted');
    return back('disconnected_key_only');
  }
  if (calendarRidesOnSameAccount) {
    await logGoogleRead(user.id, 'disconnect', 'kept_for_calendar');
    return back('disconnected_kept_for_calendar');
  }

  // 4. ask Google (we still hold the token in memory), then record the answer.
  const revokedAtGoogle = await revokeAtGoogle(grant.refreshToken);
  if (!revokedAtGoogle) {
    await logGoogleRead(user.id, 'disconnect', 'revoke_failed');
    return back('disconnected_revoke_failed');
  }
  const { error: recordError } = await supabase.rpc('fn_ai_google_read_clear_token', {
    p_revoked_at_google: true,
  });
  if (recordError) {
    // Google did withdraw it; only our note of that failed. The banner stays
    // true — it describes what happened, not what we recorded.
    console.error('[google-read/disconnect] recording the revoke failed:', recordError.message);
  }
  await logGoogleRead(user.id, 'disconnect', 'revoked_at_google');
  return back('disconnected');
}
