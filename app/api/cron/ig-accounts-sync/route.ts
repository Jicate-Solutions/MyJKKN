export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * GET /api/cron/ig-accounts-sync
 *
 * Daily auto-detection of Instagram account ownership. Runs the SAME discovery
 * + classification core as the POST /api/social/instagram/accounts/sync route
 * (lib/instagram/sync-accounts.ts) with no institution / no explicit ids — the
 * full auto-discovery path.
 *
 * Why this exists: connecting a department's Instagram to a Facebook Page in
 * Meta makes that account appear under our system token's /me/accounts. Until
 * something re-runs the sync, the account stays mis-classified as
 * 'business_discovery' (public metrics only). The hourly IG polls only READ
 * already-classified accounts — none of them re-enumerates /me/accounts. This
 * cron closes that gap: once a Page is connected, the next daily tick flips the
 * account business_discovery → graph automatically, no human "Discover" click.
 *
 * Idempotent (upsert on ig_user_id) and ownership-safe (a transient Meta
 * enumeration failure skips unclassifiable accounts rather than misrouting
 * them, and alerts super-admins — see the core).
 *
 * Auth: Bearer CRON_SECRET (Vercel-injected in production). Registered in
 * vercel.json as `?secret=${CRON_SECRET}` like the other IG crons; Vercel also
 * sends the Authorization header automatically, which is what this route checks.
 */

import { NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { runIgAccountsSync } from '@/lib/instagram/sync-accounts';

function svc(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

export async function GET(request: Request): Promise<Response> {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const start = Date.now();

  // Auto-discovery: no institutionId, no igUserIds → enumerate every
  // Page-linked + extra-portfolio account and (re)classify. Newly
  // Page-connected department accounts flip business_discovery → graph here.
  const outcome = await runIgAccountsSync(svc(), {});

  if (!outcome.ok) {
    // no_token → 503, enumeration_failed → 502 (mirrors ig-business-discovery-poll's
    // status codes; the core has already alerted super-admins on a persistent
    // enumeration failure).
    const status = outcome.code === 'no_token' ? 503 : 502;
    return NextResponse.json(
      {
        success: false,
        error: outcome.error,
        code: outcome.code,
        duration_ms: Date.now() - start,
      },
      { status }
    );
  }

  return NextResponse.json({
    success: true,
    data: { ...outcome.data, duration_ms: Date.now() - start },
  });
}
