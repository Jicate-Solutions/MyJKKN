// ============================================================================
// LOOP BARS — recording one measurement against a loop's bar
// ============================================================================
// Director rulings 2026-09-16 (G3): every operational loop carries ONE concrete
// bar its verdict is judged against. A loop's own run computes its headline
// number; this module is the ONE place that turns that number into a verdict
// against the loop's approved bar and records it (fn_loop_record_measurement,
// migration 20261225070000).
//
// It deliberately does almost nothing:
//   * It NEVER changes what a loop measures. The caller passes the number the
//     loop already computed.
//   * It NEVER guesses what a prose bar means. loop_registry.bar holds the
//     Director's own words — "forward-move rate vs own trailing 8 weeks" is
//     not a number and must not be turned into one by a regex. Only a bar that
//     IS a plain number is compared against; everything else records
//     met = NULL with the honest gap "no numeric bar yet", which never counts
//     as a miss and never moves the miss streak.
//   * It NEVER throws into its caller. A loop's own measurement must not fail
//     because the bar bookkeeping did — the recording is reported, not raised.
// ============================================================================

import type { createServiceRoleClient } from '@/lib/supabase/server';

type Admin = ReturnType<typeof createServiceRoleClient>;

/** Gap text used whenever there is nothing numeric to compare against. */
export const NO_NUMERIC_BAR_GAP = 'no numeric bar yet';

export interface RecordLoopMeasurementInput {
  /** loop_registry.loop_key of the loop this run belongs to. */
  loopKey: string;
  /** The loop's headline number for this run; NULL when it produced none. */
  value: number | null;
  /** Free-text run identifier, so a measurement can be traced back to its run. */
  runId?: string | null;
}

export interface RecordLoopMeasurementResult {
  recorded: boolean;
  /** The loop's bar as a number, when the bar IS a plain number. */
  barValue: number | null;
  /** true/false only when both sides are numbers; NULL otherwise. */
  met: boolean | null;
  gap: string | null;
  /** Populated when the recording could not be made — never thrown. */
  error?: string;
}

/**
 * A bar is only comparable when it is a plain number, e.g. "85" or "-2.5".
 * Prose such as "forward-move rate vs own trailing 8 weeks" is the Director's
 * sentence, not a threshold, and is left alone (his 2026-09-17 answer: do not
 * parse a text bar into a number — record met NULL until a numeric bar exists).
 */
export function parsePlainNumericBar(bar: string | null | undefined): number | null {
  if (typeof bar !== 'string') return null;
  const trimmed = bar.trim();
  if (trimmed === '') return null;
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

/**
 * Record one measurement for `loopKey` against whatever bar the Director has
 * approved for it. Returns what was recorded; never throws.
 */
export async function recordLoopMeasurement(
  admin: Admin,
  input: RecordLoopMeasurementInput
): Promise<RecordLoopMeasurementResult> {
  const { loopKey, value, runId = null } = input;

  let bar: string | null = null;
  try {
    const { data, error } = await admin
      .from('loop_registry')
      .select('bar')
      .eq('loop_key', loopKey)
      .maybeSingle();
    if (error) {
      // The column does not exist yet (migration unapplied) or the row is
      // gone. Say so; do not pretend a verdict.
      return {
        recorded: false,
        barValue: null,
        met: null,
        gap: null,
        error: `could not read the bar for ${loopKey}: ${error.message}`,
      };
    }
    bar = ((data ?? {}) as { bar?: string | null }).bar ?? null;
  } catch (e) {
    return {
      recorded: false,
      barValue: null,
      met: null,
      gap: null,
      error: e instanceof Error ? e.message : String(e),
    };
  }

  const barValue = parsePlainNumericBar(bar);
  const comparable = barValue !== null && typeof value === 'number' && Number.isFinite(value);
  // A plain-number bar is read as a FLOOR: the loop clears it by being at or
  // above it. Loops whose bar is "stay below X" carry that as prose today, so
  // they land in the NULL branch and never get a wrong verdict here.
  const met = comparable ? (value as number) >= (barValue as number) : null;
  const gap = comparable
    ? `${((value as number) - (barValue as number)).toFixed(2)} vs the bar`
    : NO_NUMERIC_BAR_GAP;

  try {
    const { error } = await admin.rpc('fn_loop_record_measurement', {
      p_loop_key: loopKey,
      p_value: value,
      p_bar_value: barValue,
      p_met: met,
      p_gap: gap,
      p_run_id: runId,
    });
    if (error) {
      return { recorded: false, barValue, met, gap, error: error.message };
    }
  } catch (e) {
    return {
      recorded: false,
      barValue,
      met,
      gap,
      error: e instanceof Error ? e.message : String(e),
    };
  }

  return { recorded: true, barValue, met, gap };
}
