// =====================================================================
// Session Feedback (SCF) — Self-improving loop: outcome measurement cron
// =====================================================================
// Closes the self-improving loop's verifier. Daily, for every AI suggestion
// whose next same-course+faculty session has since happened, it sets the
// outcome = that next session's avg understanding and lift = outcome - input.
// That measured lift is what the NEXT suggestion reads back (via
// fn_scf_prior_suggestion) so the model learns whether its last advice worked.
//
// All work is in fn_scf_measure_suggestion_outcomes (service-role). Idempotent:
// only rows with outcome_lift IS NULL are measured, so re-runs are no-ops.
// Auth: CRON_SECRET Bearer (Vercel cron) OR ?secret= (manual). Mould of
// /api/cron/session-feedback-nudge. Created: 2026-06-25.

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

  // Default: only measure suggestions at least 1 day old (a "next session" has
  // had a chance to happen). ?min_age_days= overrides for manual/backfill runs.
  const ageParam = request.nextUrl.searchParams.get('min_age_days');
  const minAge = ageParam && /^\d+$/.test(ageParam) ? parseInt(ageParam, 10) : 1;

  const { data, error } = await supabase.rpc('fn_scf_measure_suggestion_outcomes', {
    p_min_age_days: minAge,
  });

  if (error) {
    console.error('[cron/scf-measure-outcomes] RPC failed:', error);
    return NextResponse.json(
      { ok: false, error: error.message, elapsed_ms: Date.now() - started },
      { status: 500 }
    );
  }

  // RETURNS int → supabase-js usually surfaces the scalar directly, but older
  // shapes wrap it in an array; normalize so `measured` is always the number.
  const measured = Array.isArray(data) ? (data[0] ?? 0) : data;

  return NextResponse.json({
    ok: true,
    measured,
    elapsed_ms: Date.now() - started,
  });
}
