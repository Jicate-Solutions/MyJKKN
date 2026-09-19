// ============================================================================
// Admission-counselor loop — the briefing → action → conversion measurement
// ============================================================================
// Loop-program Wave 2, the last loop family. Built per the Director's five
// tap-answers (2026-09-06, .claude/admission-counselor-thrash-2026-08-26.md):
//   1. an action is briefing-driven ONLY when it is on a lead the briefing
//      NAMED — read back from the structured action items the nightly
//      generator persists in admission_daily_briefings.content
//      (id = 'hot-<admission_leads.id>');
//   2. each counselor's delta is against their OWN trailing 8 weeks;
//   3. a win = ANY forward funnel_stage move of the lead (canonical source:
//      admission_lead_stage_history, written by the admission_leads trigger);
//   4. COUNTER-METRIC: a counselor who ignored the last N named briefings yet
//      moves leads forward at/above their own baseline is flagged
//      briefing_changed_nothing — the loop's safety gauge. Director
//      2026-09-13: super-admin ONLY (super-admin RLS + a super-admin /
//      service_role gate on the read fn; surfaced on /admin/loops — itself
//      super-admin-gated — by _components/counselor-briefing-panel.tsx) —
//      never sent to admission team members or the counselor, no
//      notification of any kind;
//   5. independent of the weekly intake-readiness alarm; the ONE hook the
//      alarm may feed from is fn_counselor_briefing_effect_by_college.
//
// All measurement lives in the DB fn fn_counselor_briefing_measure
// (migration 20261210071700) so the weekly known-delta regress
// (fn_loops_regress_counselor_briefing_effect via /api/cron/loops-regress)
// proves the SAME measurer the daily cron runs — never a re-implementation.
// This module is the service-side face: it decides the run shape, calls the
// fn, and summarises what came back for the dispatcher's last_status.
//
// RECOMMENDATION-ONLY: the fn writes only counselor_briefing_effects rows.
// Nothing here touches counselor or lead records, notifications, or money.
// ============================================================================

import type { createServiceRoleClient } from '@/lib/supabase/server';
import { recordLoopMeasurement } from './loop-bar-measurement';

type Admin = ReturnType<typeof createServiceRoleClient>;

/** loop_registry key for the family. */
export const COUNSELOR_BRIEFING_LOOP_KEY = 'counselor-briefing-effect';

/** Registry id — must match the ai_routine_schedules seed + lib/ai-routines. */
export const COUNSELOR_BRIEFING_MEASURE_ROUTINE_ID = 'counselor-briefing-measure';

/**
 * Defaults mirrored from the platform_policies rows the fn reads
 * (admission.briefing_loop.*). The fn's own fallbacks are the same numbers;
 * these constants exist only so the route can describe the run honestly.
 */
export const COUNSELOR_BRIEFING_DEFAULTS = {
  actionWindowDays: 7,
  ignoreBriefingsN: 5,
  minNK: 3,
  /** Current week + this many previous weeks are re-measured on every run. */
  weeksBack: 2,
} as const;

/** One (counselor, week) measurement, as returned by fn_counselor_briefing_measure. */
export interface CounselorBriefingEffectRow {
  institution_id: string;
  counselor_id: string;
  week_start: string;
  week_end: string;
  briefings_n: number;
  named_leads_n: number;
  named_leads_current_year_n: number;
  named_leads_actioned_n: number;
  /**
   * % of the week's named leads this counselor acted on; NULL when none were
   * named. The denominator is INSTITUTION-wide (the briefing is one
   * per-institution row every counselor reads), the numerator is this
   * counselor's own — with N active counselors sharing one list, ~100/N% is
   * the practical ceiling, so a low value is not "ignored most of the briefing".
   */
  named_action_rate: number | null;
  named_forward_n: number;
  /** % of actioned named leads that moved forward; NULL below the de-noise floor. */
  named_forward_rate: number | null;
  baseline_acted_n: number;
  baseline_forward_n: number;
  /** The counselor's OWN trailing-8-week forward-move rate; NULL below the floor. */
  baseline_forward_rate: number | null;
  /**
   * Percentage points (named − baseline); NULL when either side is NULL.
   * Same estimator both sides, NOT the same population: named leads are the
   * generator's top-3 hot leads, the baseline is every lead touched — so this
   * carries hot-lead selection and is not a causal lift.
   */
  forward_delta: number | null;
  week_acted_all_n: number;
  week_forward_all_n: number;
  week_forward_all_rate: number | null;
  ignored_briefings_n: number;
  /** COUNTER-METRIC (Director answer 4): the briefing cost money and changed nothing. */
  briefing_changed_nothing: boolean;
}

export interface CounselorBriefingRunResult {
  as_of: string;
  weeks_back: number;
  /** Rows written/refreshed by this run. */
  rows: CounselorBriefingEffectRow[];
  measured: number;
  /** Rows whose forward_delta is a number (both sides cleared the floor). */
  with_delta: number;
  /** Counter-metric hits — a count only; the rows themselves are super-admin-only (read by the /admin/loops block). */
  flagged_changed_nothing: number;
  /** Whether this run's headline was recorded against the loop's bar (never throws; false + bar_error when it could not). */
  bar_recorded: boolean;
  /** true/false when a numeric bar exists; null when the bar is prose or absent. */
  bar_met: boolean | null;
  bar_error?: string;
  /**
   * The loop's headline number for this run: the mean forward_delta (in
   * percentage points) across the rows that HAVE a delta, or null when none
   * cleared the de-noise floor. This is the number the loop's bar judges —
   * it is read off the rows the fn already wrote, and changes nothing about
   * what is measured.
   */
  headline: number | null;
}

/** 'YYYY-MM-DD' for today in IST — briefing_date is an IST calendar date. */
export function istToday(now: Date = new Date()): string {
  return new Date(now.getTime() + 19_800_000).toISOString().slice(0, 10);
}

/**
 * Run the measurement for the current IST week and `weeksBack` previous
 * weeks. Idempotent: the fn upserts on (counselor_id, week_start), so a
 * re-run on the same day refreshes the same rows instead of minting more.
 */
export async function runCounselorBriefingMeasurement(
  admin: Admin,
  opts: { asOf?: string; weeksBack?: number } = {}
): Promise<CounselorBriefingRunResult> {
  const as_of = opts.asOf ?? istToday();
  const weeks_back = opts.weeksBack ?? COUNSELOR_BRIEFING_DEFAULTS.weeksBack;

  const { data, error } = await admin.rpc('fn_counselor_briefing_measure', {
    p_as_of: as_of,
    p_weeks_back: weeks_back,
  });
  if (error) {
    throw new Error(`fn_counselor_briefing_measure failed: ${error.message}`);
  }

  const rows = (Array.isArray(data) ? data : []) as CounselorBriefingEffectRow[];
  const deltas = rows
    .map((r) => r.forward_delta)
    .filter((d): d is number => typeof d === 'number' && Number.isFinite(d));
  const headline =
    deltas.length > 0 ? deltas.reduce((a, b) => a + b, 0) / deltas.length : null;

  // Loop bars (Director rulings 2026-09-16, G3): every run records where this
  // loop landed against its bar. Recording can never fail the measurement —
  // recordLoopMeasurement reports instead of throwing.
  // Its outcome is carried on the result (rule #27: a refused or unapplied
  // recording must be visible, never a silent no-op).
  const barRun = await recordLoopMeasurement(admin, {
    loopKey: COUNSELOR_BRIEFING_LOOP_KEY,
    value: headline,
    runId: `${COUNSELOR_BRIEFING_MEASURE_ROUTINE_ID}:${as_of}`,
  });

  return {
    as_of,
    weeks_back,
    rows,
    measured: rows.length,
    with_delta: rows.filter((r) => r.forward_delta !== null && r.forward_delta !== undefined).length,
    flagged_changed_nothing: rows.filter((r) => r.briefing_changed_nothing === true).length,
    headline,
    bar_recorded: barRun.recorded,
    bar_met: barRun.met,
    ...(barRun.error ? { bar_error: barRun.error } : {}),
  };
}
