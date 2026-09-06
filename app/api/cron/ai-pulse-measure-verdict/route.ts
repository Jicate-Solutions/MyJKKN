// ---------------------------------------------------------------------------
// AI Pulse — Measure + Verdict (closes gate 3 of the four-gate loop test)
//
// The weekly cycle used to Generate and Act but never JUDGE: no measure fn, no
// verdict. So /admin/loops reviewed AI Pulse with eyes, not outcomes, and the
// Director allocated blind.
//
// This job grades every MATURED cycle, per department plus one lossless
// program-level row, across the whole four-stage funnel:
//     learn (live session) -> apply in your domain (event_submissions)
//     -> AI Lab / Gold -> publish on department Instagram
// and writes:
//   * goal_status   -- goal_met / goal_missed vs the target dials (the
//                      "goal met / goal missed" emission tier 3 never made)
//   * stage_reached -- WHERE the funnel died (no_domain_sync, no_gold, ...)
//   * net_effect    -- engagement lift, RTM-corrected against the untreated
//                      departments, so regression-to-the-mean is never credited
//                      to an intervention. NULL when there is no control group.
//
// It never fabricates a baseline: a cycle with no prior comparable cycle is
// written as measure_status='insufficient_baseline' with NULL lift.
//
// The HUMAN verdict (intervened / partial / not_intervened) is NOT set here.
// A cron must never invent a human judgement -- that goes through
// fn_ai_pulse_set_verdict from the UI.
//
// Scheduling: AI Pulse crons are NOT in vercel.json. This route is fired by
// /api/cron/ai-routine-dispatcher from the ai_routine_schedules row seeded in
// 20260709093100_ai_pulse_measure_verdict_seed.sql (daily, 10:15 IST).
//
// Response shape: `measured` / `skipped` / `recorded` are deliberately TOP-LEVEL.
// The dispatcher's summarize() only reads top-level numeric keys from a fixed
// allowlist, so nesting them under `summary` (as the five older AI Pulse crons
// do) makes the Control Tower show a bare "HTTP 200" that says nothing.
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const JOB_NAME = 'ai-pulse-measure-verdict';

type MeasureRow = {
  rows_written: number | null;
  measured: number | null;
  insufficient: number | null;
};

export async function GET(req: NextRequest) {
  // -- Auth: CRON_SECRET (copied verbatim from ai-pulse-tick) ------------
  const authHeader = req.headers.get('authorization') || '';
  const querySecret = req.nextUrl.searchParams.get('secret') || '';
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    return NextResponse.json(
      { error: 'CRON_SECRET not configured' },
      { status: 500 },
    );
  }
  const headerOk = authHeader === `Bearer ${cronSecret}`;
  const queryOk = querySecret === cronSecret;
  if (!headerOk && !queryOk) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceRoleClient() as any;
  const startedAt = Date.now();

  // `?min_age_days=` overrides the measure_min_age_days dial for a manual
  // backfill. null => the RPC reads the dial itself.
  const rawMinAge = req.nextUrl.searchParams.get('min_age_days');
  const minAgeDays =
    rawMinAge !== null && rawMinAge !== '' && Number.isFinite(Number(rawMinAge))
      ? Number(rawMinAge)
      : null;

  try {
    const { data, error } = await supabase.rpc(
      'fn_ai_pulse_measure_cycle_outcomes',
      { p_min_age_days: minAgeDays },
    );

    if (error) {
      // Fail loud. A silent 200 here is exactly the blindness this job exists
      // to remove.
      return NextResponse.json(
        { ok: false, job: JOB_NAME, error: error.message },
        { status: 500 },
      );
    }

    // supabase-js returns a RETURNS TABLE row set; a single-row composite may
    // arrive as an array or as the bare object depending on the client version.
    const row: MeasureRow = (Array.isArray(data) ? data[0] : data) ?? {
      rows_written: 0,
      measured: 0,
      insufficient: 0,
    };

    const recorded = Number(row.rows_written ?? 0);
    const measured = Number(row.measured ?? 0);
    const skipped = Number(row.insufficient ?? 0);

    return NextResponse.json({
      ok: true,
      job: JOB_NAME,
      ran_at: new Date().toISOString(),
      // TOP-LEVEL so ai-routine-dispatcher's summarize() surfaces real numbers
      // instead of a bare "HTTP 200".
      measured,
      skipped,
      recorded,
      summary: { rows_written: recorded, measured, insufficient: skipped },
      elapsed_ms: Date.now() - startedAt,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, job: JOB_NAME, error: e?.message ?? String(e) },
      { status: 500 },
    );
  }
}
