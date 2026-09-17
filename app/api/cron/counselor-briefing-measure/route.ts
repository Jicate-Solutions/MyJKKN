// =============================================================================
// COUNSELOR BRIEFING MEASURE — the admission-counselor loop's measurement edge
// =============================================================================
// Daily (dispatcher row 'counselor-briefing-measure', 07:17 IST — seeded by
// 20261210071700, after the 06:00 IST briefing routine): one RPC to
// fn_counselor_briefing_measure, which for the current IST week and the two
// before it computes, per counselor:
//   * named-lead action rate — actions (activities + call logs) within 7 days
//     on the leads the institution's briefings NAMED that week;
//   * forward-move rate on those named leads vs the counselor's OWN trailing
//     8-week forward-move rate (same estimator both sides), and the delta;
//   * the COUNTER-METRIC flag briefing_changed_nothing — ignored the last 5
//     named briefings yet converts at/above own baseline. Director
//     2026-09-13: visible ONLY on /admin/loops (super-admin) — this route
//     notifies nobody and returns only a COUNT of flagged rows.
// All logic lives in the DB fn so the weekly known-delta regress
// (fn_loops_regress_counselor_briefing_effect, /api/cron/loops-regress)
// proves the SAME measurer this route runs, never a re-implementation.
//
// RECOMMENDATION-ONLY: writes only counselor_briefing_effects rows. Never
// touches admission_leads, admission_counselors, briefings, or money.
//
// Auth: CRON_SECRET Bearer only — the dispatcher and the AI Routines manual
// trigger both send the header; secrets never sit in URLs.
// Created: 2026-09-13 (Loop Program Wave 2 — "Counselor briefing effect").

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { runCounselorBriefingMeasurement } from '@/lib/services/loops/counselor-briefing-effect';

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ ok: false, error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const admin = createServiceRoleClient();
  try {
    const result = await runCounselorBriefingMeasurement(admin);
    return NextResponse.json({
      ok: true,
      as_of: result.as_of,
      weeks_back: result.weeks_back,
      measured: result.measured,
      with_delta: result.with_delta,
      flagged_changed_nothing: result.flagged_changed_nothing,
      // The number this loop's bar judges (mean forward_delta, pp) — recorded
      // against the bar by the service, surfaced here for the dispatcher log.
      headline: result.headline,
    });
  } catch (e) {
    // A failed measure must land as a non-2xx so the dispatcher's last_status
    // (and the daily watchdog) can see it — never a silent 200.
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
