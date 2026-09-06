// =====================================================================
// CAC attendance rollup (nightly)
// =====================================================================
// The Cluster Academic Council dashboard shows attendance as a presence rate
// over a labelled trailing window rather than over all history. That is not a
// reporting choice — it is a timeout dodge. fn_cac_measured_metrics computes
// attendance by expanding JSONB per row (jsonb_each -> jsonb_array_elements),
// so cost scales with MARKS, not rows: 1,121,890 marks across 10 institutions
// on 2026-07-31, ~4s warm as `postgres`. The `authenticated` role carries an 8s
// statement_timeout and the page runs several such queries, so all-history
// cannot be computed inside a page request.
//
// This routine computes it once a night as `postgres` — where there is no 8s
// ceiling — into cac_attendance_rollup, one row per institution. Reading it
// afterwards is a 10-row seq scan.
//
// NOTHING READS THE ROLLUP YET, deliberately. Repointing a live dashboard at a
// table that has never been populated is how a metric silently becomes zero,
// and the CAC's second locked decision is that a metric must never render a
// bare zero — it renders a diagnosable reason instead. The rewire is a
// follow-up, after these numbers are compared against a manual all-history
// computation. Until then this routine is additive and inert.
//
// Fired by the AI routine dispatcher (ai_routine_schedules row
// 'cac-attendance-rollup', daily 02:40 IST), NOT by a vercel.json cron —
// `crons` is already at 100 entries, the plan cap, and a 101st fails the build
// for everyone. Auth is the same CRON_SECRET contract either way.
//
// Query params:
//   ?dryRun=1  reports what the rollup currently holds and writes nothing.
// =====================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ ok: false, error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  const authHeader = request.headers.get('authorization');
  const querySecret = request.nextUrl.searchParams.get('secret');
  if (authHeader !== `Bearer ${cronSecret}` && querySecret !== cronSecret) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const dryRun = request.nextUrl.searchParams.get('dryRun') === '1';
  const started = Date.now();
  const supabase = createServiceRoleClient();

  // A dry run reports the CURRENT contents so a caller can see staleness
  // without paying for — or committing — a recompute.
  if (dryRun) {
    const { data, error } = await supabase
      .from('cac_attendance_rollup')
      .select('institution_id, marks, present, presence_rate, sessions, earliest_date, latest_date, computed_at')
      .order('marks', { ascending: false });

    if (error) {
      return NextResponse.json(
        { ok: false, dry_run: true, error: error.message, elapsed_ms: Date.now() - started },
        { status: 503 },
      );
    }
    return NextResponse.json({
      ok: true,
      dry_run: true,
      wrote_nothing: true,
      institutions: data?.length ?? 0,
      total_marks: (data ?? []).reduce((n, r) => n + Number(r.marks ?? 0), 0),
      rows: data ?? [],
      elapsed_ms: Date.now() - started,
    });
  }

  const { data, error } = await supabase.rpc('fn_cac_refresh_attendance_rollup');

  // Fail closed and loudly. A rollup that quietly returns ok:true while having
  // written nothing is worse than one that reports 503 — the dashboard would
  // keep serving a stale number with no signal that it stopped updating.
  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message, elapsed_ms: Date.now() - started },
      { status: 503 },
    );
  }

  const row = Array.isArray(data) ? data[0] : data;
  const institutionsUpdated = Number(row?.institutions_updated ?? 0);

  if (institutionsUpdated === 0) {
    return NextResponse.json(
      {
        ok: false,
        error: 'refresh wrote 0 institutions — attendance data missing or the aggregate matched nothing',
        elapsed_ms: Date.now() - started,
      },
      { status: 503 },
    );
  }

  return NextResponse.json({
    ok: true,
    dry_run: false,
    institutions_updated: institutionsUpdated,
    total_marks: Number(row?.total_marks ?? 0),
    sql_elapsed_ms: Number(row?.elapsed_ms ?? 0),
    elapsed_ms: Date.now() - started,
  });
}
