// lib/services/accreditation/naac-marks.ts
// ============================================================================
// NAAC marks rollup — pure functions, no I/O.
//
// WHY THIS FILE EXISTS
//   /accreditation/naac used to report COUNTS (metrics seeded, evidence rows)
//   against a header that promised a 900 ceiling, while the catalog's
//   max_score column summed to 380 with 25 of 51 rows NULL or 0. Migration
//   20260727090000 digitizes the NAAC Reforms 2024 Binary deck so the ceiling
//   is real (900.00 exactly). This module turns that catalog plus the live
//   evidence counts into marks earned / marks possible.
//
// THE ONE TRAP THIS FILE EXISTS TO AVOID
//   Some catalog rows are FACETS of a Binary metric: they legitimately hold no
//   marks of their own, and evidence landing on them earns the parent row's
//   marks. On prod (2026-07-26) 53 of the 148 live NAAC evidence rows sit on
//   facet rows — 7.3.d alone holds 47. A naive per-row rollup ("earned =
//   sum of max_score where evidence exists") silently zeroes 36% of the
//   platform's NAAC evidence. Hence the explicit parent map below.
//
//   The map is DATA, not derivation, precisely because the codes lie: 8.2.2
//   LOOKS like a facet of 8.2.1 and is not (see NAAC_UNCREDITED_ZERO).
//   Review it row by row, never pattern-match it.
//
// SCORING RULE (Binary framework — yes/no, never partial)
//   A marks-carrying row earns its FULL max_score once verified evidence
//   exists against it or against one of its declared facets, and 0 otherwise.
//   There is no partial credit inside a Binary metric.
// ============================================================================

/** The Binary-deck ceiling per college. Asserted in migration 20260727090000. */
export const NAAC_TOTAL_MARKS = 900;

/**
 * Facet rows → the row that holds the Binary metric's marks.
 * Evidence on the child credits the parent.
 *
 * DELIBERATELY ABSENT (do not "complete the pattern"):
 *   8.2.2  — affiliated-only pass percentage. The NAAC deck numbers it 8.2,
 *            colliding with Graduate Progression 8.2 (source-deck bug, see
 *            migration 20260709030000). Its evidence must NEVER mint 8.2.1's
 *            30 marks.
 *   9.1.1  — superseded starter row; publications marks live on 9.2. A
 *            publication must not mint 9.1's grant marks.
 *   10.1.1 — superseded starter row; green-audit marks live on 10.4. A
 *            green-campus record must not mint 10.1's community marks.
 */
export const NAAC_FACET_PARENTS: Readonly<Record<string, string>> = {
  '1.1.2': '1.1.1',
  '4.4.2': '4.4.1',
  '6.3.2': '6.3.1',
  '7.3.d': '7.3.1',
  '7.3.e': '7.3.1',
  '7.3.f': '7.3.1',
};

export type NaacZeroReason =
  /** Shares a canonical sibling's marks — evidence here credits the parent. */
  | 'facet'
  /** Not applicable in the deck's Autonomous column; affiliated colleges score it. */
  | 'affiliated_only'
  /** Superseded starter row — evidence here earns nothing and should be re-pointed. */
  | 'superseded'
  /** The deck attaches no college marks to this metric in either column. */
  | 'no_college_marks';

/**
 * Zero-mark rows whose evidence credits NOTHING. Kept separate from the facet
 * map so the dashboard can flag them instead of hiding them.
 */
export const NAAC_UNCREDITED_ZERO: Readonly<
  Record<string, { reason: NaacZeroReason; label: string }>
> = {
  '8.2.2': {
    reason: 'affiliated_only',
    label:
      'Affiliated-only — not scored against the Autonomous ceiling (10 marks in the Affiliated column). Its evidence is real and is shown, but earns nothing here.',
  },
  '9.1.1': {
    reason: 'superseded',
    label: 'Superseded starter row — publications marks are held on 9.2. Re-point any evidence here to 9.2.',
  },
  '10.1.1': {
    reason: 'superseded',
    label: 'Superseded starter row — green-audit marks are held on 10.4. Re-point any evidence here to 10.4.',
  },
};

export interface NaacMetricLike {
  metric_code: string;
  max_score: number | null;
}

/** One row of the marks rollup. */
export interface NaacMetricMarks {
  code: string;
  /** Marks this row can earn (0 for facets, affiliated-only and superseded rows). */
  marksPossible: number;
  /** Full marksPossible once credited evidence exists, else 0. Never partial. */
  marksEarned: number;
  /** Evidence rows filed against this code itself. */
  evidenceRows: number;
  /** Evidence rows that credit this code — its own plus its facets'. */
  creditedEvidenceRows: number;
  /** Why this row holds no marks, or null when it does hold marks. */
  zeroReason: NaacZeroReason | null;
  /** Human-readable explanation of a zero, or null when the row holds marks. */
  zeroLabel: string | null;
  /** For a facet, the row holding the marks this evidence credits. */
  facetOf: string | null;
}

export interface NaacMarksRollup {
  byCode: Record<string, NaacMetricMarks>;
  marksPossible: number;
  marksEarned: number;
  /** Marks-carrying metrics (max_score > 0). */
  metricsWithMarks: number;
  /** Marks-carrying metrics that have credited evidence. */
  metricsEarning: number;
  /** Every evidence row counted, including rows on zero-mark metrics. */
  evidenceRows: number;
}

function zeroInfo(code: string): { reason: NaacZeroReason; label: string; facetOf: string | null } {
  const parent = NAAC_FACET_PARENTS[code];
  if (parent) {
    return {
      reason: 'facet',
      label: `Shares metric ${parent}'s marks — evidence here credits ${parent}, so zero does not mean worthless.`,
      facetOf: parent,
    };
  }
  const uncredited = NAAC_UNCREDITED_ZERO[code];
  if (uncredited) {
    return { reason: uncredited.reason, label: uncredited.label, facetOf: null };
  }
  return {
    reason: 'no_college_marks',
    label: 'The Binary deck attaches no college marks to this metric in either column — informational.',
    facetOf: null,
  };
}

/**
 * Roll catalog rows + per-code evidence counts into marks earned / possible.
 *
 * @param metrics        active NAAC catalog rows (metric_code + max_score)
 * @param evidenceCounts evidence row count per metric_code, already scoped by
 *                       whatever institution filter the caller applied
 */
export function rollupNaacMarks(
  metrics: readonly NaacMetricLike[],
  evidenceCounts: Readonly<Record<string, number>>,
): NaacMarksRollup {
  // Evidence on a facet credits its parent. Build the credited tally first so
  // a parent with no evidence of its own still earns from its facets.
  const credited: Record<string, number> = {};
  for (const [code, n] of Object.entries(evidenceCounts)) {
    if (!n) continue;
    const target = NAAC_FACET_PARENTS[code] ?? code;
    credited[target] = (credited[target] ?? 0) + n;
  }

  const byCode: Record<string, NaacMetricMarks> = {};
  let marksPossible = 0;
  let marksEarned = 0;
  let metricsWithMarks = 0;
  let metricsEarning = 0;
  let evidenceRows = 0;

  for (const m of metrics) {
    const code = m.metric_code;
    const possible = m.max_score ?? 0;
    const own = evidenceCounts[code] ?? 0;
    // A facet's own evidence is credited to its parent, never to itself.
    const creditedHere = NAAC_FACET_PARENTS[code] ? 0 : (credited[code] ?? 0);
    const earned = possible > 0 && creditedHere > 0 ? possible : 0;

    const zero = possible > 0 ? null : zeroInfo(code);

    byCode[code] = {
      code,
      marksPossible: possible,
      marksEarned: earned,
      evidenceRows: own,
      creditedEvidenceRows: creditedHere,
      zeroReason: zero?.reason ?? null,
      zeroLabel: zero?.label ?? null,
      facetOf: zero?.facetOf ?? null,
    };

    marksPossible += possible;
    marksEarned += earned;
    evidenceRows += own;
    if (possible > 0) {
      metricsWithMarks += 1;
      if (earned > 0) metricsEarning += 1;
    }
  }

  return {
    byCode,
    // numeric(5,2) values summed in float — round to 2dp so 900 reads as 900.
    marksPossible: Math.round(marksPossible * 100) / 100,
    marksEarned: Math.round(marksEarned * 100) / 100,
    metricsWithMarks,
    metricsEarning,
    evidenceRows,
  };
}

/** Sum a subset of a rollup (e.g. one attribute's metric codes). */
export function sumNaacMarks(
  rollup: NaacMarksRollup,
  codes: readonly string[],
): { marksPossible: number; marksEarned: number; evidenceRows: number } {
  let marksPossible = 0;
  let marksEarned = 0;
  let evidenceRows = 0;
  for (const code of codes) {
    const row = rollup.byCode[code];
    if (!row) continue;
    marksPossible += row.marksPossible;
    marksEarned += row.marksEarned;
    evidenceRows += row.evidenceRows;
  }
  return {
    marksPossible: Math.round(marksPossible * 100) / 100,
    marksEarned: Math.round(marksEarned * 100) / 100,
    evidenceRows,
  };
}

/** Marks as a whole-tenth percentage of the marks possible. 0 when none possible. */
export function marksPct(earned: number, possible: number): number {
  if (!possible) return 0;
  return Math.round((earned / possible) * 1000) / 10;
}

/** Trim trailing zeros so 15.00 reads "15" and 14.71 stays "14.71". */
export function formatMarks(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
}
