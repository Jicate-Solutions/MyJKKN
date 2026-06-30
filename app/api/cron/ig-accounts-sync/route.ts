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
 * Auto-route hook (PR #169x): after the sync finishes, snapshot-diff the
 * ig_accounts table to detect ownership flips (new account, institution_id
 * change, metrics_source change) and:
 *   - log social_instagram_logs event_type='ownership_flipped'
 *   - notify super-admins via the shared fanout helper
 *   - re-route open social/instagram bug_reports keyed by ig_user_id
 * The hook lives in lib/instagram/auto-route-on-ownership-flip.ts and is
 * cron-only — the POST UI sync deliberately does NOT trigger it.
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
import {
  snapshotOwnership,
  routeOwnershipFlips,
} from '@/lib/instagram/auto-route-on-ownership-flip';

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
  const client = svc();

  // Pre-sync snapshot — institution_id + metrics_source per ig_user_id.
  // Runs BEFORE the sync so we can diff afterwards. A snapshot read
  // failure degrades to an empty Map; every post-sync row is then treated
  // as "new_account" and surfaces in the auto-route log/notify, which is
  // a safe-loud failure mode rather than silent drift.
  const preSnapshot = await snapshotOwnership(client);

  // Auto-discovery: no institutionId, no igUserIds → enumerate every
  // Page-linked + extra-portfolio account and (re)classify. Newly
  // Page-connected department accounts flip business_discovery → graph here.
  const outcome = await runIgAccountsSync(client, {});

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

  // Auto-route hook — best-effort. Per-flip failures are absorbed inside
  // the helper and reported in `errors[]`. We do NOT fail the cron if
  // the hook errors out: the sync itself succeeded, the route results
  // should still surface that.
  let autoRoute: Awaited<ReturnType<typeof routeOwnershipFlips>> | null = null;
  try {
    autoRoute = await routeOwnershipFlips(client, preSnapshot);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn('[ig-accounts-sync] auto-route hook failed:', message);
    autoRoute = {
      flips: [],
      notified: 0,
      bug_reports_rerouted: 0,
      log_writes: 0,
      errors: [`hook crashed: ${message}`],
    };
  }

  return NextResponse.json({
    success: true,
    data: {
      ...outcome.data,
      auto_route: autoRoute,
      duration_ms: Date.now() - start,
    },
  });
}
