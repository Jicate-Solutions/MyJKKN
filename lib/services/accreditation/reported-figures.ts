// lib/services/accreditation/reported-figures.ts
// ============================================================================
// The reserved `reported_metrics` / `reported_at` shape inside
// `accreditation_submissions.metadata`, expressed once in TypeScript.
//
// Director decision 7 (2026-08-01): the numbers move after a submission is
// filed, so both the figure that was REPORTED and the figure that is ACTUAL
// today must stay retrievable.
//
// The DATABASE is authoritative. `fn_accreditation_freeze_reported_figures`
// (migration 20260809100400) performs the real write under a lock, and
// `fn_accreditation_reported_vs_actual` (20260809100000) performs the real
// read. Nothing here re-derives either of them.
//
// What lives here is the part the SQL cannot do: parsing a metadata blob that
// arrived over the wire as `unknown`, deciding whether a submission is already
// frozen without a round trip, projecting the freeze onto the row a screen is
// already holding, and turning a (reported, actual) pair into the sentence a
// person reads.
//
// No imports on purpose — this module must load under vitest, and anything in
// `lib/services` that touches `@/lib/supabase/client` pulls a browser client in
// at module scope.
// ============================================================================

/** The two keys reserved inside `accreditation_submissions.metadata`. */
export const REPORTED_METRICS_KEY = 'reported_metrics';
export const REPORTED_AT_KEY = 'reported_at';

export type SubmissionMetadata = Record<string, unknown>;

export interface ReportedSnapshot {
  /** metric_code -> the figure filed with the awarding body. */
  metrics: Record<string, number>;
  /** ISO 8601 instant the figures were frozen, or null if the row predates it. */
  reportedAt: string | null;
  /** How many metrics carried a figure at filing time. */
  metricCount: number;
  /** Sum of those figures — the total evidence rows the filing claimed. */
  evidenceRows: number;
}

export interface MergeResult {
  /** The metadata to store. Identical to the input when `frozen` is false. */
  merged: SubmissionMetadata;
  /** True only when this call is what introduced the snapshot. */
  frozen: boolean;
  reason: 'frozen' | 'already-frozen';
}

function asObject(value: unknown): SubmissionMetadata | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  return value as SubmissionMetadata;
}

/**
 * True when this submission has already had its filed figures frozen.
 *
 * Tests key EXISTENCE, matching the `metadata ? 'reported_metrics'` guard in
 * the RPC: a filing that legitimately captured zero metrics is still a filing,
 * and `{}` must not read as "never frozen" and invite a re-freeze.
 */
export function isFrozen(metadata: unknown): boolean {
  const obj = asObject(metadata);
  return obj !== null && Object.prototype.hasOwnProperty.call(obj, REPORTED_METRICS_KEY);
}

/**
 * Read the frozen snapshot out of a metadata blob, or null when there is none.
 *
 * Tolerant on the way in because jsonb round-trips loosely: a number may arrive
 * as a string, and a malformed entry should be dropped rather than poison the
 * whole snapshot. Strict on the way out — every returned figure is a finite
 * number.
 */
export function readReportedSnapshot(metadata: unknown): ReportedSnapshot | null {
  const obj = asObject(metadata);
  if (obj === null || !Object.prototype.hasOwnProperty.call(obj, REPORTED_METRICS_KEY)) {
    return null;
  }

  const rawMetrics = asObject(obj[REPORTED_METRICS_KEY]) ?? {};
  const metrics: Record<string, number> = {};
  for (const [code, raw] of Object.entries(rawMetrics)) {
    const n = typeof raw === 'string' ? Number(raw) : raw;
    if (typeof n === 'number' && Number.isFinite(n)) {
      metrics[code] = n;
    }
  }

  const rawAt = obj[REPORTED_AT_KEY];
  const reportedAt = typeof rawAt === 'string' && rawAt.length > 0 ? rawAt : null;

  const codes = Object.keys(metrics);
  return {
    metrics,
    reportedAt,
    metricCount: codes.length,
    evidenceRows: codes.reduce((sum, code) => sum + metrics[code], 0),
  };
}

/**
 * Project a completed freeze onto the metadata a screen is already holding, so
 * it can render the frozen state without refetching the row.
 *
 * Two rules, both of which the RPC enforces server-side and this mirrors so the
 * client can never render a state the database would have refused:
 *
 *  1. MERGE, never replace. Every other key in `metadata` survives untouched —
 *     the export page writes `filename`, `metrics_seeded`, `evidence_rows`,
 *     `exported_at` and `note` into that same object.
 *  2. WRITE-ONCE. An already-frozen submission is returned unchanged. A filed
 *     figure is a historical fact; overwriting it would rewrite history to
 *     match the present and destroy the drift the feature exists to show.
 */
export function mergeReportedMetrics(
  metadata: unknown,
  metrics: Record<string, number>,
  reportedAt: string,
): MergeResult {
  const base = asObject(metadata) ?? {};

  if (isFrozen(base)) {
    return { merged: base, frozen: false, reason: 'already-frozen' };
  }

  return {
    merged: {
      ...base,
      [REPORTED_METRICS_KEY]: { ...metrics },
      [REPORTED_AT_KEY]: reportedAt,
    },
    frozen: true,
    reason: 'frozen',
  };
}

/**
 * The sentence a person reads: "Reported 61; 84 today (23 more since filing)".
 *
 * `reported` is null for a metric that was not part of the filing at all —
 * evidence gathered after the fact. Saying "0 reported" there would be a lie
 * about what was filed.
 */
export function describeDrift(reported: number | null, actual: number): string {
  if (reported === null) {
    return `Not part of the filing; ${actual} today`;
  }

  const delta = actual - reported;
  if (delta === 0) {
    return `Reported ${reported}; ${actual} today (unchanged since filing)`;
  }

  const size = Math.abs(delta);
  const direction = delta > 0 ? 'more' : 'fewer';
  const noun = size === 1 ? 'row' : 'rows';
  return `Reported ${reported}; ${actual} today (${size} ${noun} ${direction} since filing)`;
}
