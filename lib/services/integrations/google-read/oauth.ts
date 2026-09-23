// lib/services/integrations/google-read/oauth.ts
//
// SERVER-ONLY. Incremental authorization for Gmail + Drive read, on the SAME
// Google OAuth client as the calendar connection.
//
//   - The consent URL asks only for gmail.readonly + drive.readonly (+ openid,
//     email) with include_granted_scopes=true, so Google shows the new scopes on
//     top of whatever the person already allowed, and access_type=offline +
//     prompt=consent so a refresh token always comes back.
//   - State is signed with the calendar flow's own signer (signState /
//     verifyState, same secret, same 10-minute expiry) and carries
//     p = 'google_read'; the calendar callback now refuses such a state and this
//     callback refuses a calendar one.
//   - The token response's `scope` is kept, so the card and the endpoints know
//     exactly what the person allowed (Google lets them untick a box).
//
// The redirect URI registered on the OAuth client must include exactly
// ${NEXT_PUBLIC_APP_URL}/api/integrations/google-read/callback.

import {
  signState,
  verifyState,
} from '@/lib/services/integrations/google-calendar-service';
import {
  GOOGLE_FETCH_TIMEOUT_MS,
  GOOGLE_READ_SCOPES,
  GOOGLE_READ_STATE_PURPOSE,
} from './constants';

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const LOG_PREFIX = '[google-read/oauth]';

function env(name: string): string | null {
  const v = process.env[name];
  return v && v.trim().length > 0 ? v : null;
}

export function googleReadRedirectUri(): string {
  const app = env('NEXT_PUBLIC_APP_URL') ?? 'https://www.jkkn.ai';
  return `${app.replace(/\/$/, '')}/api/integrations/google-read/callback`;
}

/** Google consent URL for the signed-in person. Throws if not configured. */
export function buildGoogleReadAuthUrl(profileId: string): string {
  const clientId = env('GOOGLE_CAL_CLIENT_ID');
  const secret = env('GOOGLE_TOKEN_MASTER_SECRET');
  if (!clientId || !secret) throw new Error('Google integration is not configured');

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: googleReadRedirectUri(),
    response_type: 'code',
    scope: GOOGLE_READ_SCOPES.join(' '),
    access_type: 'offline',
    include_granted_scopes: 'true',
    prompt: 'consent',
    state: signState({ h: profileId, t: Date.now(), p: GOOGLE_READ_STATE_PURPOSE }, secret),
  });
  return `${AUTH_URL}?${params.toString()}`;
}

/** The profile id the state was issued to, or null (bad, expired, wrong flow). */
export function verifyGoogleReadState(state: string): string | null {
  const secret = env('GOOGLE_TOKEN_MASTER_SECRET');
  if (!secret || !state) return null;
  const payload = verifyState(state, secret);
  if (!payload || payload.p !== GOOGLE_READ_STATE_PURPOSE) return null;
  return payload.h;
}

export type ExchangeResult =
  | { ok: true; refreshToken: string; googleEmail: string; scopes: string[] }
  | { ok: false; error: 'not_configured' | 'exchange_failed' | 'no_refresh_token' | 'no_email' };

export async function exchangeGoogleReadCode(code: string): Promise<ExchangeResult> {
  const clientId = env('GOOGLE_CAL_CLIENT_ID');
  const clientSecret = env('GOOGLE_CAL_CLIENT_SECRET');
  if (!clientId || !clientSecret) return { ok: false, error: 'not_configured' };

  let res: Response;
  try {
    res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: googleReadRedirectUri(),
        grant_type: 'authorization_code',
      }),
      signal: AbortSignal.timeout(GOOGLE_FETCH_TIMEOUT_MS),
    });
  } catch (err) {
    console.error(`${LOG_PREFIX} code exchange threw:`, (err as Error).message);
    return { ok: false, error: 'exchange_failed' };
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error(`${LOG_PREFIX} code exchange failed:`, res.status, body.slice(0, 200));
    return { ok: false, error: 'exchange_failed' };
  }

  const tokens = (await res.json()) as {
    refresh_token?: string;
    id_token?: string;
    scope?: string;
  };
  if (!tokens.refresh_token) return { ok: false, error: 'no_refresh_token' };

  // Email from the id_token payload — it came straight from Google over TLS in
  // this same response, as in GoogleCalendarService.completeConnection.
  let googleEmail = '';
  try {
    const payload = JSON.parse(
      Buffer.from((tokens.id_token ?? '').split('.')[1] ?? '', 'base64url').toString(),
    ) as { email?: string };
    googleEmail = payload.email ?? '';
  } catch {
    /* fall through */
  }
  if (!googleEmail) return { ok: false, error: 'no_email' };

  const scopes = (tokens.scope ?? '').split(/\s+/).filter(Boolean);
  return { ok: true, refreshToken: tokens.refresh_token, googleEmail, scopes };
}

/**
 * Ask Google to withdraw the grant. NOTE: Google withdraws EVERY permission this
 * OAuth client holds for that Google account — calendar included — so the
 * disconnect route only calls this when no calendar connection rides on the
 * same account. Returns whether Google confirmed.
 */
export async function revokeAtGoogle(refreshToken: string): Promise<boolean> {
  try {
    const res = await fetch(REVOKE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token: refreshToken }),
      signal: AbortSignal.timeout(GOOGLE_FETCH_TIMEOUT_MS),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      // invalid_token = already gone at Google, which is what we wanted.
      if (body.includes('invalid_token')) return true;
      console.error(`${LOG_PREFIX} revoke failed:`, res.status, body.slice(0, 200));
      return false;
    }
    return true;
  } catch (err) {
    console.error(`${LOG_PREFIX} revoke threw:`, (err as Error).message);
    return false;
  }
}
