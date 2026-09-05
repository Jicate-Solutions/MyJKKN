// =============================================================================
// ATTENDANCE INTERVENTION MEASURE — the attendance loop's return edge
// =============================================================================
// Daily (dispatcher row 'attendance-intervention-measure', 10:07 IST — seeded
// by 20261018010000; see the activation note below): one RPC to
// fn_attendance_measure_intervention_effect, which
//   1. ENROLLS every unseen intervention as a pending measurement row —
//      staff-logged learner_interventions AND automated risk nudges from
//      learner_risk_notification_log (who, when, which nudge) — deduped by
//      UNIQUE(source, source_id), 120-day lookback;
//   2. MEASURES pending rows whose after-window has elapsed: the learner's
//      mark-level attendance % in (t, t+14d] vs their OWN baseline
//      [t−14d, t), writing net_effect (percentage points) into
//      attendance_intervention_effects — the row the Tower/audits read.
// All logic lives in the DB fn so the weekly known-delta regress
// (fn_loops_regress_attendance, /api/cron/loops-regress) proves the SAME
// measurer this route runs, never a re-implementation.
//
// ACTIVATION: 20260929010000 deliberately seeded NO schedule row (the
// dispatcher resolves routines via the code registry, a shared collision-zone
// file that PR could not touch). The follow-up ships both together: the
// 'attendance-intervention-measure' entry in lib/ai-routines/loop-governance.ts
// and the enabled+managed seed in 20261018010000 (day/time editable on
// /admin/ai-routines, no deploy). Until that migration is applied, no clock
// fires this route; the manual trigger via CRON_SECRET still works.
//
// Auth: CRON_SECRET Bearer only — the dispatcher and the AI Routines manual
// trigger both send the header; secrets never sit in URLs.
// Created: 2026-08-26 (Loop Program Wave 2 — "Attendance → intervention").

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

type MeasureRow = {
  enrolled: number;
  measured: number;
  insufficient: number;
};

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ ok: false, error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const admin = createServiceRoleClient();
  const { data, error } = await admin.rpc('fn_attendance_measure_intervention_effect');
  if (error) {
    return NextResponse.json(
      { ok: false, error: `measure rpc failed: ${error.message}` },
      { status: 500 }
    );
  }

  // RETURNS TABLE → an array with one row; an empty result is itself a failure
  // worth surfacing (the dispatcher records last_status from the HTTP code).
  const row = (Array.isArray(data) ? data[0] : data) as MeasureRow | undefined;
  if (!row) {
    return NextResponse.json(
      { ok: false, error: 'measure rpc returned no row' },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    enrolled: row.enrolled,
    measured: row.measured,
    insufficient: row.insufficient,
  });
}
