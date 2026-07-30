// =====================================================================
// MBA Data-Gap loop — Phase 3: outcome measurement cron
// =====================================================================
// Closes the self-improving loop's verifier for the MBA data-gap intake.
// For EVERY filed gap, it recomputes gap_outcome from the gap's own status and
// its linked improvement_ideas row's status (produced_applied_improvement /
// accepted_pending_improvement / improvement_dropped / not_accepted / pending)
// and stamps outcome_measured_at. That measured outcome is what powers each
// Associate's track record and the per-area hit-rate signal the ranking will
// later weight on.
//
// All work is in fn_mba_measure_gap_outcomes() (service-role only). Pure SQL —
// NO AI, NO ai-jobs-lane. Idempotent: it recomputes every row, so re-runs
// converge. Auth: CRON_SECRET Bearer (Vercel cron) OR ?secret= (manual).
// Mould of /api/cron/scf-measure-outcomes. Created: 2026-07-26.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

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

  // RETURNS int → supabase-js usually surfaces the scalar directly, but older
  // shapes wrap it in an array; normalize so `measured` is always the number.
  const normalize = (d: unknown) => (Array.isArray(d) ? (d[0] ?? 0) : (d ?? 0));

  const res = await supabase.rpc('fn_mba_measure_gap_outcomes');
  if (res.error) {
    console.error('[cron/measure-gap-outcomes] RPC failed:', res.error);
    return NextResponse.json(
      { ok: false, error: res.error.message, elapsed_ms: Date.now() - started },
      { status: 500 },
    );
  }

  // Best-effort follow-ups (v2). A failure here must NOT fail the measurement
  // run, so each is logged and its count defaults to 0.
  //   notify   — ping that college's board managers + the owner about gaps that
  //              are now/still stuck (once, then weekly; guarded in-RPC).
  //   resurface — flip 'parked' someday-gaps back to 'triaged' after 3 months.
  let notified = 0;
  let resurfaced = 0;

  const notifyRes = await supabase.rpc('fn_mba_notify_stalled_gaps');
  if (notifyRes.error) {
    console.error('[cron/measure-gap-outcomes] stalled-notify failed:', notifyRes.error);
  } else {
    notified = Number(normalize(notifyRes.data)) || 0;
  }

  const resurfaceRes = await supabase.rpc('fn_mba_resurface_parked_gaps');
  if (resurfaceRes.error) {
    console.error('[cron/measure-gap-outcomes] parked-resurface failed:', resurfaceRes.error);
  } else {
    resurfaced = Number(normalize(resurfaceRes.data)) || 0;
  }

  return NextResponse.json({
    ok: true,
    measured: normalize(res.data),
    notified,
    resurfaced,
    elapsed_ms: Date.now() - started,
  });
}
