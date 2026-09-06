// =====================================================================
// Session Feedback (SCF) Adoption Nudge — daily cron
// =====================================================================
// Drives adoption of the 10-second post-class feedback feature
// (/learners/class-feedback). For every learner who was marked Present
// in a session in the last 14 days but has NOT yet confirmed feedback
// (their attendance is "present-pending"), this drops ONE in-app bell
// notification "You have N class(es) to confirm" linking to the
// feedback page. In-app only — no email / WhatsApp.
//
// All the work is in the SECURITY DEFINER RPC fn_scf_nudge_pending_learners
// (service_role only). It creates notifications + user_notifications rows
// directly (mirroring fn_create_dashboard_work_item — there is no fan-out
// trigger on `notifications`), and is idempotency-keyed per learner per day
// so this cron can run repeatedly without creating duplicates.
//
// Auth: CRON_SECRET via `Authorization: Bearer <secret>` header (Vercel cron
// invoker sends this automatically) OR `?secret=` query param (manual runs).
// Vercel does NOT substitute ${CRON_SECRET} in vercel.json URL paths, so the
// Bearer header is the only thing scheduled invocations can actually match.
// Created: 2026-06-23 (mould of /api/cron/dashboard-work-items).

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

  const { data, error } = await supabase.rpc('fn_scf_nudge_pending_learners', {
    p_lookback_days: 14
  });

  if (error) {
    console.error('[cron/session-feedback-nudge] RPC failed:', error);
    return NextResponse.json(
      { ok: false, error: error.message, elapsed_ms: Date.now() - started },
      { status: 500 }
    );
  }

  // The RPC RETURNS TABLE(...) → supabase-js returns an array of one row.
  const summary = Array.isArray(data) ? data[0] : data;

  return NextResponse.json({
    ok: true,
    elapsed_ms: Date.now() - started,
    result: summary
  });
}
