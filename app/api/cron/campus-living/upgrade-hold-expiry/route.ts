export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

/**
 * Upgrade-hold payment-window cron (20260611150000, inverted by 20260815020000).
 *
 * A category upgrade records a hold on hostel_waitlist (hold_expires_at,
 * default 5 days per hostel_categories.upgrade_hold_days) — a PAYMENT window
 * only. Director's rule (2026-08-07): a reservation IS the move-in, so when
 * the window lapses this cron calls fn_cl_expire_upgrade_holds() which
 * CONFIRMS the move ('waiting' → 'allocated') — the bed is kept, the upgrade
 * bill is kept (unpaid it simply joins the learner's fee dues), the category
 * is kept. Nobody is moved out for non-payment. Idempotent: the status
 * transition itself is the stamp.
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
        { confirmed: 0, error: error.message, duration_ms },
        { status: 500 }
      );
    }

    const confirmed = typeof data === 'number' ? data : 0;
    console.log(`[cron/upgrade-hold-expiry] Confirmed ${confirmed} lapsed holds as move-ins, ${duration_ms}ms`);
    return NextResponse.json({ confirmed, duration_ms });
  } catch (e) {
    const duration_ms = Date.now() - startTime;
    const message = e instanceof Error ? e.message : String(e);
    console.error(`[cron/upgrade-hold-expiry] Fatal: ${message}`);
    return NextResponse.json({ confirmed: 0, error: message, duration_ms }, { status: 500 });
  }
}
