export const dynamic = 'force-dynamic';

// app/api/integrations/google-read/callback/route.ts
//
// Google's redirect target for "Let the assistant read my Gmail and Drive".
// Verifies the signed state (and that it was issued to THIS signed-in person),
// exchanges the code, vaults the refresh token AS the person
// (fn_ai_google_read_set_token is pinned to auth.uid()), records which scopes
// Google actually granted, and returns to the card with a banner flag.
//
// The redirect URI registered on the Google OAuth client must include exactly
// ${NEXT_PUBLIC_APP_URL}/api/integrations/google-read/callback.

import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import {
  hasDriveScope,
  hasMailScope,
  isGoogleReadEnabled,
  logGoogleRead,
} from '@/lib/services/integrations/google-read/connection';
import {
  exchangeGoogleReadCode,
  verifyGoogleReadState,
} from '@/lib/services/integrations/google-read/oauth';
import { GOOGLE_READ_CARD_PATH } from '@/lib/services/integrations/google-read/constants';

function back(flag: string): NextResponse {
  const app = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.jkkn.ai').replace(/\/$/, '');
  return NextResponse.redirect(`${app}${GOOGLE_READ_CARD_PATH}?google_read=${flag}`);
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const state = url.searchParams.get('state') ?? '';
  const code = url.searchParams.get('code') ?? '';

  // "Cancel" on Google's consent screen — not an error.
  if (url.searchParams.get('error')) return back('declined');

  const stateProfileId = verifyGoogleReadState(state);
  if (!stateProfileId || !code) return back('invalid');

  // The browser finishing the flow must be the person who started it. Without
  // this, someone could send a victim their own half-finished callback link and
  // the victim's assistant would end up reading the sender's mailbox.
  const supabase = (await createClient()) as unknown as SupabaseClient;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.id !== stateProfileId) return back('invalid');

  if (!(await isGoogleReadEnabled(supabase))) return back('off');

  const exchanged = await exchangeGoogleReadCode(code);
  if (exchanged.ok === false) {
    console.error('[google-read/callback] connection failed:', exchanged.error);
    await logGoogleRead(supabase, 'connect', exchanged.error);
    return back('failed');
  }

  const { error } = await supabase.rpc('fn_ai_google_read_set_token', {
    p_google_email: exchanged.googleEmail,
    p_refresh_token: exchanged.refreshToken,
    p_granted_scopes: exchanged.scopes,
    p_master_secret: process.env.GOOGLE_TOKEN_MASTER_SECRET ?? '',
  });
  if (error) {
    console.error('[google-read/callback] vault store failed:', error.message);
    await logGoogleRead(supabase, 'connect', 'vault_failed');
    return back('failed');
  }

  const mail = hasMailScope(exchanged.scopes);
  const drive = hasDriveScope(exchanged.scopes);
  await logGoogleRead(supabase, 'connect', mail && drive ? 'ok' : 'partial');
  return back(mail && drive ? 'connected' : 'partial');
}
