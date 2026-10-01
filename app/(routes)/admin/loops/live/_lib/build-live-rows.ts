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

/**
 * loop_registry.gates — the four loop gates, each 'on' | 'half' | 'off'.
 * Populated on every one of the 43 active rows (read 2026-09-19). `m` is the
 * Measure gate, the only one this page reads.
 */
export interface LoopGates {
  g?: string | null;
  a?: string | null;
  m?: string | null;
  f?: string | null;
}

/** The bar columns of a loop_registry row (migration 20261225070000). */
export interface LoopRegistryBarRow {
  loop_key: string;
  name: string | null;
  bar: string | null;
  bar_kind: string | null;
  bar_set_at: string | null;
  bar_set_by: string | null;
  bar_miss_streak: number | null;
  /** The four gates. Required so the page's select cannot quietly drop it. */
  gates: LoopGates | null;
  /** The dispatcher routine wired to this loop, when it has one. */
  routine_id: string | null;
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
  /**
   * Why there is no settled number — NULL whenever there IS one, so the page
   * never explains an absence that is not on screen.
   */
  why: string | null;
}

/** Wording used wherever a loop has never been measured. */
export const NO_MEASUREMENT_YET = 'no measurement recorded yet';
/** Wording for a loop whose only readings are still in progress. */
export const NO_FINAL_YET = 'no settled measurement yet';

// ---------------------------------------------------------------------------
// WHY THERE IS NO NUMBER
// ---------------------------------------------------------------------------
// 41 of 43 active loops show "no measurement recorded yet", and the sentence
// alone cannot tell "nobody has built a measurer for this loop" apart from
// "the measurer exists and tonight's run has not landed". Those need opposite
// responses, so each empty row carries its own reason.
//
// ORDER MATTERS, and not the way it first looks. The obvious rule — read the
// Measure gate, then look for a measurer — is wrong against the live registry
// (read 2026-09-19): the only two loops that HAVE a measurer are the two whose
// gate is not 'on'. attendance-intervention is m='off' with
// attendance-intervention-measure running daily, and counselor-briefing-effect
// is m='half' with counselor-briefing-measure. Gate-first wording would print
// "no measurer is wired for this loop yet" on the one loop whose measurer has
// been running for months — the first row a reviewer would check. So the
// measurer is checked FIRST and the gate only answers for loops that have none.

/**
 * Dispatcher routines that actually run a measurement today, checked against
 * loop_registry.routine_id. Two, live. PR #3888 (open) adds the consultants
 * measurer; it joins this list when that PR merges.
 */
export const MEASURER_ROUTINE_IDS: readonly string[] = [
  'attendance-intervention-measure',
  'counselor-briefing-measure',
];

export const WHY_MEASURER_SCHEDULED = 'measurer scheduled — no run recorded yet';
export const WHY_GATE_OFF =
  'Measure gate off — no measurer is wired for this loop yet';
export const WHY_GATE_ON_NO_MEASURER =
  'Measure gate on, but no scheduled run records a measurement yet';
export const WHY_GATE_HALF_NO_MEASURER =
  'Measure gate half-closed, and no scheduled run records a measurement yet';
/** gates is jsonb; a row that does not say gets a sentence that claims nothing. */
export const WHY_GATE_UNKNOWN =
  'no Measure gate recorded for this loop, and no run records a measurement yet';

function measureGate(gates: LoopGates | null | undefined): string {
  const m = gates && typeof gates === 'object' ? gates.m : null;
  return typeof m === 'string' ? m.trim().toLowerCase() : '';
}

function hasMeasurer(routineId: string | null | undefined): boolean {
  const id = typeof routineId === 'string' ? routineId.trim() : '';
  return id !== '' && MEASURER_ROUTINE_IDS.includes(id);
}

/** The reason a loop has no settled number. Measurer first, then the gate. */
function whyNoMeasurement(loop: LoopRegistryBarRow): string {
  if (hasMeasurer(loop.routine_id)) return WHY_MEASURER_SCHEDULED;
  switch (measureGate(loop.gates)) {
    case 'off':
      return WHY_GATE_OFF;
    case 'on':
      return WHY_GATE_ON_NO_MEASURER;
    case 'half':
      return WHY_GATE_HALF_NO_MEASURER;
    default:
      return WHY_GATE_UNKNOWN;
  }
}

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
  const lastFinal = newestFinal ? toLive(newestFinal) : null;

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
    lastFinal,
    inProgress: newest && newest.status === 'in_progress' ? toLive(newest) : null,
    hasAnyMeasurement: sorted.length > 0,
    why: lastFinal === null ? whyNoMeasurement(loop) : null,
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
