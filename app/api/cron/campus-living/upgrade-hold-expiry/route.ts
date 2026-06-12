export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

/**
 * Upgrade-hold expiry cron (20260611150000).
 *
 * A below-payment-threshold room category upgrade hard-reserves the chosen bed
 * and records the hold on hostel_waitlist (held_bed_id / hold_expires_at,
 * default 5 days per hostel_categories.upgrade_hold_days). This cron calls
 * fn_cl_expire_upgrade_holds() which flips stale 'waiting' holds to 'expired'
 * and releases their reserved beds back to 'available'. Idempotent: the
 * status transition itself is the stamp.
 *
 * Schedule in vercel.json: hourly (day-granularity holds tolerate this easily).
 * Auth: CRON_SECRET via `Authorization: Bearer <secret>` header (Vercel cron)
 * OR `?secret=` query param (manual runs).
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.warn('[cron/upgrade-hold-expiry] CRON_SECRET not configured');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const authHeader = request.headers.get('authorization');
  const querySecret = request.nextUrl.searchParams.get('secret');
  if (authHeader !== `Bearer ${cronSecret}` && querySecret !== cronSecret) {
    console.warn('[cron/upgrade-hold-expiry] Unauthorized attempt');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const serviceClient = createServiceRoleClient();

  try {
    const { data, error } = await serviceClient.rpc('fn_cl_expire_upgrade_holds');
    const duration_ms = Date.now() - startTime;

    if (error) {
      console.error(`[cron/upgrade-hold-expiry] RPC failed: ${error.message}`);
      return NextResponse.json(
        { expired: 0, error: error.message, duration_ms },
        { status: 500 }
      );
    }

    const expired = typeof data === 'number' ? data : 0;
    console.log(`[cron/upgrade-hold-expiry] Expired ${expired} holds, ${duration_ms}ms`);
    return NextResponse.json({ expired, duration_ms });
  } catch (e) {
    const duration_ms = Date.now() - startTime;
    const message = e instanceof Error ? e.message : String(e);
    console.error(`[cron/upgrade-hold-expiry] Fatal: ${message}`);
    return NextResponse.json({ expired: 0, error: message, duration_ms }, { status: 500 });
  }
}
