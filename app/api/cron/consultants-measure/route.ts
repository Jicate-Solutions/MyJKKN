// =============================================================================
// CONSULTANTS MEASURE — the consultant-effectiveness loop's scheduled run
// =============================================================================
// The consultants loop has had a measurer since 2026-08-26
// (fn_consultants_measure_conversion, migration 20261003010000) and a weekly
// known-delta regress that proves it (20261003030000) — but NO clock. Nothing
// ever called it, so consultant_conversion_measurements has stayed empty and
// the loop has never produced a reading of its own. This route is that clock.
//
// Weekly (dispatcher row 'consultants-measure', Mondays 11:23 IST — seeded by
// 20261226020000): one RPC to fn_consultants_measure_conversion, which
//   1. reads the consultant attribution ledger once, splitting each
//      consultant's attributions into the 30-day WINDOW and everything BEFORE
//      it (the consultant's own baseline);
//   2. rates both sides with the SAME estimator, NULLing either side that sits
//      below the de-noise floor consultants.loop.min_attributions_k;
//   3. upserts one row per (consultant, window) into
//      consultant_conversion_measurements and RETURNS those rows.
// All logic lives in the DB fn, so the weekly regress (fn_loops_regress_
// consultants via /api/cron/loops-regress) proves the SAME measurer this route
// runs, never a re-implementation. This route adds no estimator of its own.
//
// MEASUREMENT ONLY. The loop's feed-forward leg is deliberately off (gates
// f:"off" on the loop_registry row): nothing here allocates a lead, credits a
// referral, or touches the commission pipeline.
//
// Loop bars (Director rulings 2026-09-16, G3): every run records where the
// loop landed against its approved bar. The headline number is the MEAN window
// conversion rate across the consultants that cleared the de-noise floor —
// read off the rows the fn just wrote, so nothing about WHAT this loop
// measures changes. A failure in the bar bookkeeping is reported alongside the
// run, never raised over it.
//
// Auth: CRON_SECRET Bearer only — the dispatcher and the AI Routines manual
// trigger both send the header; secrets never sit in URLs.
// Created: 2026-09-18 (Loop bars lane follow-up — "the consultants loop had no
// scheduled run to hook").

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { recordLoopMeasurement } from '@/lib/services/loops/loop-bar-measurement';

/** One row of fn_consultants_measure_conversion's RETURNS TABLE. */
type MeasureRow = {
  consultant_id: string;
  window_start: string;
  window_end: string;
  window_attributions: number | null;
  window_conversions: number | null;
  window_conversion_rate: number | string | null;
  baseline_attributions: number | null;
  baseline_conversions: number | null;
  baseline_conversion_rate: number | string | null;
  conversion_delta: number | string | null;
};

/** loop_registry.loop_key for the consultant effectiveness loop. */
const CONSULTANTS_LOOP_KEY = 'consultants';

/**
 * The de-noise floor is a CONFIG ROW, not a literal here (config-table
 * pattern). It is the same row fn_consultants_measure_conversion reads, so the
 * route's headline and the fn's own NULLing agree by construction.
 */
const MIN_ATTRIBUTIONS_POLICY_KEY = 'consultants.loop.min_attributions_k';

function asFiniteNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * Mean window conversion rate across the consultants that cleared the floor.
 *
 * `floor` is null when the policy row could not be read. In that case the fn's
 * OWN floor is still in force — it has already NULLed the rate of every
 * consultant below it — so a non-null rate is itself the evidence that the row
 * cleared the floor, and no invented constant is needed.
 *
 * Returns null when nobody cleared the floor: an honest "no reading", never a
 * zero that would read like a real rate of 0%.
 */
export function meanWindowConversionRate(
  rows: MeasureRow[],
  floor: number | null
): { headline: number | null; aboveFloor: number } {
  const values: number[] = [];
  for (const row of rows) {
    const rate = asFiniteNumber(row.window_conversion_rate);
    if (rate === null) continue;
    if (floor !== null) {
      const n = asFiniteNumber(row.window_attributions);
      if (n === null || n < floor) continue;
    }
    values.push(rate);
  }
  if (values.length === 0) return { headline: null, aboveFloor: 0 };
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return { headline: Math.round(mean * 100) / 100, aboveFloor: values.length };
}

/**
 * Why the headline reads 0.00 (Director ruling 2026-09-19, "Keep 'enrolled',
 * show zero").
 *
 * The estimator counts a conversion only at current_stage IN
 * ('enrolled','confirmed'). Live, no attributed lead has ever reached that
 * stage — the ledger stops at lead_registered / application_started — so the
 * mean window rate is 0.00 on every run. The ruling is to KEEP that rule and
 * record the 0.00 honestly rather than relabel the estimator to a stage that
 * leads do reach, which would move the number without moving the outcome.
 *
 * A bare 0.00 on a screen reads as "these consultants convert nobody". It is
 * more nearly "nobody has been moved to the stage that counts yet", so the run
 * carries that sentence with it.
 */
export const ZERO_CONVERSION_NOTE =
  "0.00 — no attributed lead has reached the 'enrolled'/'confirmed' stage in the system " +
  '(Director ruling 2026-09-19: keep the enrolled rule, show zero)';

/**
 * The note, when this run is one of those 0.00 runs; null otherwise.
 *
 * Two ways in, both requiring a real reading (a numeric headline) over real
 * attributions — never over an empty ledger, and never in place of the honest
 * NULL that means nobody cleared the de-noise floor:
 *   * every measured consultant converted nobody in the window, or
 *   * the headline itself came out 0 while attributions were counted.
 */
export function zeroConversionNote(rows: MeasureRow[], headline: number | null): string | null {
  if (typeof headline !== 'number' || !Number.isFinite(headline)) return null;
  const attributions = rows.reduce(
    (sum, r) => sum + (asFiniteNumber(r.window_attributions) ?? 0),
    0
  );
  if (attributions <= 0) return null;
  const noneConverted = rows.every((r) => (asFiniteNumber(r.window_conversions) ?? 0) === 0);
  return noneConverted || headline === 0 ? ZERO_CONVERSION_NOTE : null;
}

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ ok: false, error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const admin = createServiceRoleClient();

  // The floor first: read it before the measure so the run reports the value
  // that was in force. A missing/unreadable row is NOT fatal — see
  // meanWindowConversionRate.
  let floor: number | null = null;
  const { data: policy } = await admin
    .from('platform_policies')
    .select('value')
    .eq('policy_key', MIN_ATTRIBUTIONS_POLICY_KEY)
    .eq('scope_type', 'global')
    .eq('is_active', true)
    .maybeSingle();
  if (policy) {
    floor = asFiniteNumber((policy as { value?: unknown }).value);
  }

  const { data, error } = await admin.rpc('fn_consultants_measure_conversion');
  if (error) {
    return NextResponse.json(
      { ok: false, error: `measure rpc failed: ${error.message}` },
      { status: 500 }
    );
  }
  // RETURNS TABLE → an array. An EMPTY array is a legitimate reading (no
  // consultant has an attribution in the ledger yet); a non-array/absent
  // payload is not, and is surfaced so the dispatcher records the failure
  // rather than logging a silent success.
  if (!Array.isArray(data)) {
    return NextResponse.json(
      { ok: false, error: 'measure rpc returned no rows payload' },
      { status: 500 }
    );
  }
  const rows = data as MeasureRow[];

  const { headline, aboveFloor } = meanWindowConversionRate(rows, floor);
  const note = zeroConversionNote(rows, headline);

  // The measurement is recorded AS-IS: value = the headline the estimator
  // produced (0 on every run until a lead reaches enrolled/confirmed).
  // recordLoopMeasurement takes no caller-supplied reason — it derives `gap`
  // itself from the loop's own bar — and that module ships in #3883, not here,
  // so it is not changed to carry one. Nor is the note smuggled into `runId`:
  // that field traces a measurement back to its run and is not a comment box.
  // The sentence therefore rides on this route's response, where the
  // dispatcher's run log keeps it.
  const barRun = await recordLoopMeasurement(admin, {
    loopKey: CONSULTANTS_LOOP_KEY,
    value: headline,
    runId: `consultants-measure:${new Date().toISOString().slice(0, 10)}`,
  });

  return NextResponse.json({
    ok: true,
    measured: rows.length,
    above_floor: aboveFloor,
    min_attributions_k: floor,
    headline,
    note,
    bar_recorded: barRun.recorded,
    bar_met: barRun.met,
    bar_error: barRun.error ?? null,
  });
}
