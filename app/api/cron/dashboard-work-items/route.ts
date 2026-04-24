// =====================================================================
// Dashboard Work Item Generator — hourly cron
// =====================================================================
// Closes the "OHS is red but queue is empty" architectural gap. Runs the
// 4 SQL generators that convert business signals (overdue invoices,
// stale leads, pending leaves, unmarked attendance) into queue items
// (category='dashboard:*' notifications + user_notifications rows).
//
// Each generator is idempotency-keyed per entity+day so this cron can
// run as often as needed without creating duplicates.
//
// Auth: CRON_SECRET via `Authorization: Bearer <secret>` header (Vercel cron
// invoker sends this automatically) OR `?secret=` query param (manual runs).
// Vercel does NOT substitute ${CRON_SECRET} in vercel.json URL paths, so the
// Bearer header is the only thing scheduled invocations can actually match.
// Created: 2026-04-21 as follow-up to PR #285 silent-failure surfacing.

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ ok: false, error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  const authHeader = request.headers.get('authorization');
  const querySecret = request.nextUrl.searchParams.get('secret');
  if (authHeader !== `Bearer ${cronSecret}` && querySecret !== cronSecret) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const started = Date.now();
  const supabase = createServiceRoleClient();

  const { data, error } = await supabase.rpc('fn_generate_all_dashboard_work_items');

  if (error) {
    console.error('[cron/dashboard-work-items] RPC failed:', error);
    return NextResponse.json(
      { ok: false, error: error.message, elapsed_ms: Date.now() - started },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    elapsed_ms: Date.now() - started,
    result: data
  });
}
