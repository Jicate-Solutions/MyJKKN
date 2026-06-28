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

  // Session verifier: measure suggestions at least N days old (a "next session"
  // has had a chance to happen). ?min_age_days= overrides for manual/backfill.
  const ageParam = request.nextUrl.searchParams.get('min_age_days');
  const minAge = ageParam && /^\d+$/.test(ageParam) ? parseInt(ageParam, 10) : 1;

  // Induction verifier matures on a MUCH longer horizon — a cohort's admission
  // cycle runs ~a full year — so it defaults to 300 days (gated on the induction's
  // window_to) so the single terminal measurement captures essentially all JOINs.
  // ?induction_min_age_days= overrides for backfill.
  const indAgeParam = request.nextUrl.searchParams.get('induction_min_age_days');
  const indMinAge = indAgeParam && /^\d+$/.test(indAgeParam) ? parseInt(indAgeParam, 10) : 300;

  // RETURNS int → supabase-js usually surfaces the scalar directly, but older
  // shapes wrap it in an array; normalize so each count is always the number.
  const normalize = (d: unknown) => (Array.isArray(d) ? (d[0] ?? 0) : (d ?? 0));

  // One loop, multi-scope: measure BOTH verifiers in this single job, but report
  // each independently so a failure in one never drops the other's result.
  const sessionRes = await supabase.rpc('fn_scf_measure_suggestion_outcomes', { p_min_age_days: minAge });
  if (sessionRes.error) {
    // Session is the primary path; surface its failure as 5xx (but still attempt induction).
    console.error('[cron/scf-measure-outcomes] session RPC failed:', sessionRes.error);
  }

  const inductionRes = await supabase.rpc('fn_induction_measure_loop_outcomes', { p_min_age_days: indMinAge });
  if (inductionRes.error) {
    console.error('[cron/scf-measure-outcomes] induction RPC failed:', inductionRes.error);
  }

  return NextResponse.json(
    {
      ok: !sessionRes.error && !inductionRes.error,
      measured: sessionRes.error ? null : normalize(sessionRes.data),
      measured_induction: inductionRes.error ? null : normalize(inductionRes.data),
      session_error: sessionRes.error?.message ?? null,
      induction_error: inductionRes.error?.message ?? null,
      elapsed_ms: Date.now() - started,
    },
    // 5xx only on the SESSION (daily, critical) failure — that's what should alert +
    // retry. The induction verifier runs effectively once per cohort/year and is
    // idempotent, so a transient failure self-heals on the next daily run; surface it
    // in `induction_error` (monitor that field) rather than 500-ing the whole job daily.
    { status: sessionRes.error ? 500 : 200 },
  );
}
