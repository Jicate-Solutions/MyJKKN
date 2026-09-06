export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * GET /api/cron/ig-login-token-refresh
 *
 * Keeps Instagram Business Login tokens alive. Long-lived tokens last 60
 * days and can be refreshed (graph.instagram.com/refresh_access_token,
 * grant_type=ig_refresh_token) any time they are ≥24h old and unexpired —
 * each refresh restarts the 60-day clock.
 *
 * Daily pass:
 *   1. mark any active/error connection past expires_at as 'expired'
 *      (expired tokens cannot be refreshed — the account must reconnect)
 *   2. refresh connections expiring within REFRESH_WINDOW_DAYS (wide
 *      window: a connection gets ~50 daily attempts before it can lapse)
 *   3. on token-invalid errors (OAuthException 190) mark 'error' so the
 *      departments page shows a Reconnect prompt
 *
 * Auth: Bearer CRON_SECRET (Vercel-provided in production).
 */

import { NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  IgLoginError,
  igLoginConfigured,
  refreshLongLivedToken,
} from '@/lib/instagram/login-client';

const REFRESH_WINDOW_DAYS = 10;
const MIN_TOKEN_AGE_HOURS = 24;

function svc(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

interface ConnectionRow {
  id: string;
  username: string;
  access_token: string;
  expires_at: string;
  connected_at: string;
  last_refreshed_at: string | null;
  status: string;
}

export async function GET(request: Request): Promise<Response> {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!igLoginConfigured()) {
    return NextResponse.json({
      success: true,
      data: { skipped: 'Instagram Login not configured' },
    });
  }

  const supabase = svc();
  const start = Date.now();
  const nowIso = new Date().toISOString();

  // 1. sweep: anything past expiry can no longer be refreshed
  const { data: expiredRows } = await supabase
    .from('ig_account_connections')
    .update({ status: 'expired', updated_at: nowIso })
    .in('status', ['active', 'error'])
    .lt('expires_at', nowIso)
    .select('id');
  const expired = expiredRows?.length ?? 0;

  // 2. refresh those approaching expiry ('error' included — refresh errors
  //    are often transient and a successful refresh self-heals the row)
  const windowEnd = new Date(
    Date.now() + REFRESH_WINDOW_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();
  const { data: dueRows, error: dueErr } = await supabase
    .from('ig_account_connections')
    .select('id, username, access_token, expires_at, connected_at, last_refreshed_at, status')
    .in('status', ['active', 'error'])
    .gte('expires_at', nowIso)
    .lte('expires_at', windowEnd);
  if (dueErr) {
    return NextResponse.json({ success: false, error: dueErr.message }, { status: 500 });
  }

  let refreshed = 0;
  let failed = 0;
  let tooYoung = 0;
  const errors: Array<{ username: string; error: string }> = [];

  for (const conn of (dueRows ?? []) as ConnectionRow[]) {
    // Meta rejects refreshing tokens younger than 24h.
    const tokenBornAt = new Date(conn.last_refreshed_at || conn.connected_at).getTime();
    if (Date.now() - tokenBornAt < MIN_TOKEN_AGE_HOURS * 60 * 60 * 1000) {
      tooYoung++;
      continue;
    }
    try {
      const next = await refreshLongLivedToken(conn.access_token);
      await supabase
        .from('ig_account_connections')
        .update({
          access_token: next.access_token,
          expires_at: new Date(
            Date.now() + (next.expires_in || 5184000) * 1000
          ).toISOString(),
          last_refreshed_at: new Date().toISOString(),
          status: 'active',
          last_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', conn.id);
      refreshed++;
    } catch (e) {
      failed++;
      const msg = e instanceof Error ? e.message : 'unknown';
      errors.push({ username: conn.username, error: msg });
      await supabase
        .from('ig_account_connections')
        .update({
          // 190 = token invalidated (password change, deauth) → needs reconnect
          status: e instanceof IgLoginError && e.isTokenError ? 'error' : conn.status,
          last_error: `refresh: ${msg}`.slice(0, 500),
          updated_at: new Date().toISOString(),
        })
        .eq('id', conn.id);
    }
  }

  return NextResponse.json({
    success: true,
    data: {
      due: dueRows?.length ?? 0,
      refreshed,
      too_young: tooYoung,
      failed,
      marked_expired: expired,
      errors,
      duration_ms: Date.now() - start,
    },
  });
}
