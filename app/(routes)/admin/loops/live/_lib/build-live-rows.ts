// ============================================================================
// LIVE LOOPS — turning registry rows + measurements into what the page shows
// ============================================================================
// Director rank-2 item (G4, 2026-09-16), behind the loop-bars lane: one page
// that shows, per loop, the LAST measurement, the BAR it was judged against,
// and the GAP between them — with an in-progress reading greyed and labelled
// so a partial number is never mistaken for a settled one.
//
// This module is the whole decision surface, kept pure so every rule below is
// testable without a database or a browser:
//
//   * The last FINAL measurement is the verdict. An `in_progress` row NEVER
//     replaces it — it is carried separately and rendered greyed.
//   * `met` is read, never recomputed. fn_loop_record_measurement already
//     decided it against the loop's bar at run time (migration 20261225070000);
//     re-deriving it here could disagree with the row that moved the miss
//     streak, and the page would then be lying about what the machine did.
//   * Which WAY the bar faces is display-only: a 'threshold' bar is a CEILING
//     (cleared at or below), every other kind a FLOOR (cleared at or above).
//     That wording mirrors the bar generator's own sentence ("stays at or
//     below its agreed limit") so the page and the proposal read alike.
//   * A loop with no rows says "no measurement recorded yet" — not a zero,
//     not a dash that could be read as a miss. On the day this ships
//     loop_measurements is empty for all 43 active loops, so the empty state
//     is the state the Director will actually see first.
// ============================================================================

/** The bar columns of a loop_registry row (migration 20261225070000). */
export interface LoopRegistryBarRow {
  loop_key: string;
  name: string | null;
  bar: string | null;
  bar_kind: string | null;
  bar_set_at: string | null;
  bar_set_by: string | null;
  bar_miss_streak: number | null;
}

/** One loop_measurements row. */
export interface LoopMeasurementRow {
  measured_at: string;
  value: number | null;
  bar_value: number | null;
  met: boolean | null;
  gap: string | null;
  run_id: string | null;
  status: string;
}

export type BarDirection = 'ceiling' | 'floor';

/** How the page words a verdict — symbol and label kept together. */
export type Verdict = 'cleared' | 'missed' | 'not-comparable';

export interface LiveMeasurement {
  measuredAt: string;
  value: number | null;
  barValue: number | null;
  met: boolean | null;
  verdict: Verdict;
  gap: string | null;
  runId: string | null;
}

export interface LiveLoopRow {
  loopKey: string;
  name: string;
  /** The bar in the Director's own words; NULL when no bar is approved yet. */
  bar: string | null;
  barKind: string | null;
  /** Display-only: which side of the bar clears it. NULL when there is no bar. */
  barDirection: BarDirection | null;
  /** A plain sentence for the bar, e.g. "cleared at or below 85". */
  barReadsAs: string | null;
  barSetAt: string | null;
  barSetBy: string | null;
  missStreak: number;
  /** The newest status='final' row — the loop's actual verdict. */
  lastFinal: LiveMeasurement | null;
  /** The newest row, when it is still in progress. Rendered greyed. */
  inProgress: LiveMeasurement | null;
  /** False when the loop has no measurement rows at all. */
  hasAnyMeasurement: boolean;
}

/** Wording used wherever a loop has never been measured. */
export const NO_MEASUREMENT_YET = 'no measurement recorded yet';
/** Wording for a loop whose only readings are still in progress. */
export const NO_FINAL_YET = 'no settled measurement yet';

/**
 * A bar is only a number when it IS a plain number — "85", "-2.5". Prose such
 * as "forward-move rate vs own trailing 8 weeks" is the Director's sentence and
 * is never parsed into a threshold (his 2026-09-17 answer). Same rule the
 * recorder applies, restated here because this module must stay free of the
 * Supabase-typed service it would otherwise import.
 */
function plainNumericBar(bar: string | null): number | null {
  if (typeof bar !== 'string') return null;
  const trimmed = bar.trim();
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

function verdictOf(met: boolean | null): Verdict {
  if (met === true) return 'cleared';
  if (met === false) return 'missed';
  return 'not-comparable';
}

function toLive(row: LoopMeasurementRow): LiveMeasurement {
  return {
    measuredAt: row.measured_at,
    value: row.value ?? null,
    barValue: row.bar_value ?? null,
    met: row.met ?? null,
    verdict: verdictOf(row.met ?? null),
    gap: row.gap ?? null,
    runId: row.run_id ?? null,
  };
}

/**
 * Build the display row for ONE loop from whatever measurement rows were read
 * for it. Order of `measurements` does not matter — they are sorted here — so a
 * caller can hand over the newest-any and newest-final reads in either order.
 */
export function buildLiveLoopRow(
  loop: LoopRegistryBarRow,
  measurements: LoopMeasurementRow[]
): LiveLoopRow {
  const sorted = [...measurements].sort(
    (a, b) => new Date(b.measured_at).getTime() - new Date(a.measured_at).getTime()
  );
  const newest = sorted[0] ?? null;
  const newestFinal = sorted.find((m) => m.status === 'final') ?? null;

  const bar = loop.bar && loop.bar.trim() !== '' ? loop.bar.trim() : null;
  const barDirection: BarDirection | null =
    bar === null ? null : loop.bar_kind === 'threshold' ? 'ceiling' : 'floor';
  const side = barDirection === 'ceiling' ? 'at or below' : 'at or above';
  const numericBar = plainNumericBar(bar);
  const barReadsAs =
    bar === null
      ? null
      : numericBar !== null
        ? `cleared ${side} ${numericBar}`
        : `read as a ${barDirection} — cleared ${side} the bar`;

  return {
    loopKey: loop.loop_key,
    name: loop.name && loop.name.trim() !== '' ? loop.name.trim() : loop.loop_key,
    bar,
    barKind: bar === null ? null : (loop.bar_kind ?? null),
    barDirection,
    barReadsAs,
    barSetAt: loop.bar_set_at ?? null,
    barSetBy: loop.bar_set_by ?? null,
    missStreak: Number.isFinite(Number(loop.bar_miss_streak))
      ? Number(loop.bar_miss_streak)
      : 0,
    lastFinal: newestFinal ? toLive(newestFinal) : null,
    inProgress: newest && newest.status === 'in_progress' ? toLive(newest) : null,
    hasAnyMeasurement: sorted.length > 0,
  };
}

/**
 * Build every row, worst first: a loop carrying consecutive misses sorts above a
 * healthy one, and ties fall back to the loop's name so the order is stable
 * between refreshes.
 */
export function buildLiveLoopRows(
  loops: LoopRegistryBarRow[],
  measurementsByKey: Record<string, LoopMeasurementRow[]>
): LiveLoopRow[] {
  return loops
    .map((l) => buildLiveLoopRow(l, measurementsByKey[l.loop_key] ?? []))
    .sort((a, b) =>
      b.missStreak !== a.missStreak
        ? b.missStreak - a.missStreak
        : a.name.localeCompare(b.name)
    );
}
