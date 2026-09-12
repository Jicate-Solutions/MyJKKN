// lib/services/accreditation/coverage-measure.ts
// ============================================================================
// Accreditation coverage — the one pure function that turns catalogue size and
// evidence presence into a percentage. No I/O, so it can be tested against the
// exact production numbers that made it necessary.
//
// WHY THIS FILE EXISTS
//   /accreditation and /accreditation/coverage computed coverage as
//   `evidence_rows / metrics_seeded`, which is a category error: the numerator
//   counted ROWS of evidence and the denominator counted METRICS. On prod
//   (2026-09-07) NIRF held 11,396 evidence rows against a 17-metric catalogue,
//   so the ratio came out at 67,035% and the `Math.min(100, ...)` clamp turned
//   that into a full green bar reading 100%. The truth is that only 4 of those
//   17 NIRF metrics carry any evidence at all. NAAC read 100% on 21 of 69, and
//   NBA read 100% on 1 of 9.
//
//   The same clamp is why nobody noticed: a formula that overshoots by three
//   orders of magnitude and a formula that is finished both render as 100%.
//
// THE MEASURE
//   How much of the framework the platform can currently answer:
//     distinct catalogue metrics carrying at least one evidence row
//     ÷ active metrics in that body's catalogue.
//   One metric with a thousand rows against it is still one metric answered.
//   This is the same shape /accreditation/iqac already uses (summariseCoverage
//   in app/(routes)/accreditation/iqac/_lib/metric-framework.ts) and the same
//   shape the NAAC dashboard moved to when it retired the row-count formula.
//
// WHAT IT IS STILL NOT
//   Not a grade and not a weighted score. A metric with one thin file counts
//   the same as a metric with a complete dossier. Weighted coverage per body
//   rubric lands with each body's own dashboard; NAAC already has marks
//   (lib/services/accreditation/naac-marks.ts).
// ============================================================================

export interface CoverageMeasure {
  /**
   * Active metrics for this body in the platform's framework catalogue.
   * The denominator, and the only honest one — the alternative (metrics that
   * happen to have evidence) makes the number rise as the question narrows.
   */
  catalogueSize: number;
  /** Distinct catalogue metrics with at least one evidence row. */
  metricsWithEvidence: number;
  /** metricsWithEvidence / catalogueSize as a whole percent, 0–100. */
  coveragePct: number;
}

/**
 * Coverage for one body, or one (body × college) cell.
 *
 * An empty catalogue reports 0%, not 100%. Dividing zero answered by zero
 * asked is undefined, and of the two readings a reader could take from it,
 * "nothing is measured here yet" is the one that cannot mislead an owner.
 */
export function measureCoverage(
  catalogueSize: number,
  metricsWithEvidence: number,
): CoverageMeasure {
  const size = Math.max(0, Math.trunc(catalogueSize));
  // Clamped to the catalogue rather than trusted. Callers filter evidence down
  // to codes that exist in the active catalogue, so this cannot fire today —
  // it is here so that a future caller that forgets the filter produces a
  // wrong-looking 100% instead of a nonsense 380%, which is the failure this
  // whole file exists to stop repeating.
  const measured = Math.min(size, Math.max(0, Math.trunc(metricsWithEvidence)));
  return {
    catalogueSize: size,
    metricsWithEvidence: measured,
    coveragePct: size === 0 ? 0 : Math.round((measured / size) * 100),
  };
}

/**
 * The sentence that has to travel with the percentage.
 *
 * Load-bearing because the catalogue is not uniformly populated: NAAC holds 69
 * active metrics and NIRF 17, but AICTE and NCTE hold 1 each, and DCI, PCI,
 * INC, QS and UGC hold 2 each. "1 of 2 metrics" for PCI is the truth about
 * this platform's catalogue and something false-sounding about PCI, whose real
 * inspection schedule is nothing like two items long.
 *
 * Never conditional on the catalogue being thin. A caveat that appears only on
 * small bodies teaches its reader that its absence is an all-clear, which is a
 * second way of being misleading. Same rule, same wording, as the owner digest
 * preview (lib/services/accreditation/owner-digest.ts).
 */
/**
 * The active framework catalogue: body code → the metric codes it holds.
 * Both halves matter — `.size` is the denominator and `.has()` is what keeps a
 * retired or mistyped metric code out of the numerator.
 */
export type CatalogueIndex = Readonly<Record<string, ReadonlySet<string>>>;

/** One evidence mapping, reduced to what coverage is measured from. */
export interface EvidenceRef {
  body_code: string;
  metric_code: string;
  institution_id: string;
}

export interface EvidenceTally {
  /** Which body this bucket belongs to — the caller's key may be compound. */
  bodyCode: string;
  /** Raw mappings on file. Material filed, not framework answered. */
  evidenceRows: number;
  /** Distinct catalogue metrics answered in this bucket. */
  metricsWithEvidence: number;
}

/**
 * Bucket evidence rows and count the DISTINCT catalogue metrics each bucket
 * answers. `keyOf` decides the grain: body alone for the landing scoreboard,
 * body × institution for the coverage matrix. One function rather than two
 * because the two grains disagreeing about what "answered" means is precisely
 * the class of bug this file was written after.
 *
 * Evidence pointing at a code the active catalogue does not hold still counts
 * as a row — it is real material — but answers nothing measurable, so it never
 * reaches the numerator.
 */
export function tallyEvidence(
  evidence: readonly EvidenceRef[],
  catalogue: CatalogueIndex,
  keyOf: (row: EvidenceRef) => string,
): Record<string, EvidenceTally> {
  const rows: Record<string, number> = {};
  const answered: Record<string, Set<string>> = {};
  const bodyOf: Record<string, string> = {};

  for (const row of evidence) {
    const key = keyOf(row);
    rows[key] = (rows[key] ?? 0) + 1;
    bodyOf[key] = row.body_code;
    if (catalogue[row.body_code]?.has(row.metric_code)) {
      (answered[key] ??= new Set<string>()).add(row.metric_code);
    }
  }

  const out: Record<string, EvidenceTally> = {};
  for (const [key, evidenceRows] of Object.entries(rows)) {
    out[key] = {
      bodyCode: bodyOf[key]!,
      evidenceRows,
      metricsWithEvidence: answered[key]?.size ?? 0,
    };
  }
  return out;
}

export function coverageBasisNote(): string {
  return (
    'Coverage is the share of a body’s metrics that carry any evidence — ' +
    'distinct metrics with evidence ÷ active metrics in this platform’s ' +
    'framework catalogue. The catalogue is not the same thing as a body’s ' +
    'full published requirements, and several bodies are still placeholder ' +
    'entries of one or two metrics.'
  );
}
