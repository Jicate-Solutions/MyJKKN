/**
 * What a cluster-level evidence count actually means, stated so the number and
 * the sentence beside it agree.
 *
 * A paper co-authored by JKKN Pharmacy and JKKN Dental is two rows in
 * `quality_evidence_mappings` — one per institution — because each college
 * genuinely holds it and each will report it in its own return. Summing those
 * rows for the cluster counts the paper twice.
 *
 * `fn_accreditation_evidence_scope()` returns both numbers rather than picking
 * one, and this module turns them into the line the page prints. That is the
 * same choice the cluster roster card settled on (PR #2487): when two defensible
 * numbers disagree, show the gap instead of quietly resolving it, because a
 * reader who later finds the other number has no way to tell which was wrong.
 *
 * Director decision 10, 2026-08-01: both colleges see it; the cluster counts it
 * once.
 *
 * Pure, and in its own module, because importing a page pulls the Supabase
 * client in at module scope and that cannot load under vitest.
 */

export interface EvidenceScopeRow {
  metric_code: string;
  /** Sum of what every college would report for itself. Shared rows counted per college. */
  college_total: number;
  /** Distinct source rows. A shared paper counts once. */
  cluster_total: number;
  /** Source rows claimed by more than one institution. */
  shared_count: number;
}

export interface EvidenceScope {
  metricCode: string;
  collegeTotal: number;
  clusterTotal: number;
  sharedCount: number;
  /** True when the two totals differ, i.e. the distinction is worth printing. */
  isShared: boolean;
  /** The line the page shows beneath the count. Never empty. */
  sentence: string;
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/**
 * Normalises one row from `fn_accreditation_evidence_scope`.
 *
 * Defensive about the numbers rather than trusting them: the RPC returns
 * bigint, which arrives over PostgREST as a string often enough that a bare
 * `+` would silently concatenate. Negative or missing values are floored at
 * zero — a count is never negative, and rendering "-1 papers" to an assessor is
 * worse than rendering zero.
 */
export function summariseEvidenceScope(row: EvidenceScopeRow): EvidenceScope {
  const toCount = (v: unknown): number => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  };

  const collegeTotal = toCount(row.college_total);
  const clusterTotal = toCount(row.cluster_total);
  const sharedCount = toCount(row.shared_count);

  // The cluster figure can never exceed the college figure — a shared row adds
  // to the college sum and not to the distinct count. If it does, the RPC and
  // this module disagree, and saying so is better than rendering nonsense.
  const isShared = sharedCount > 0 && clusterTotal !== collegeTotal;

  let sentence: string;
  if (clusterTotal === 0) {
    sentence = 'Not captured yet.';
  } else if (!isShared) {
    sentence = `${clusterTotal} across the cluster, none shared between colleges.`;
  } else {
    const duplicated = collegeTotal - clusterTotal;
    sentence =
      `${clusterTotal} across the cluster. ` +
      `Colleges report ${collegeTotal} between them because ${sharedCount} ` +
      `${plural(sharedCount, 'item is', 'items are')} held by more than one ` +
      `college; the cluster counts ${plural(duplicated, 'it', 'them')} once.`;
  }

  return { metricCode: row.metric_code, collegeTotal, clusterTotal, sharedCount, isShared, sentence };
}

/**
 * Cluster-level roll-up across metrics.
 *
 * Deliberately returns no grade, total score or ranking — only counts. The CAC
 * dashboard made the same call: a single number on an accreditation screen
 * reads as a rating, and no body has awarded JKKN anything here.
 */
export function summariseEvidenceScopes(rows: EvidenceScopeRow[]): {
  metrics: EvidenceScope[];
  metricsWithEvidence: number;
  metricsNotCaptured: number;
  sharedItems: number;
} {
  const metrics = rows.map(summariseEvidenceScope);
  return {
    metrics,
    metricsWithEvidence: metrics.filter((m) => m.clusterTotal > 0).length,
    metricsNotCaptured: metrics.filter((m) => m.clusterTotal === 0).length,
    sharedItems: metrics.reduce((sum, m) => sum + m.sharedCount, 0),
  };
}

// ---------------------------------------------------------------------------
// Reported vs actual (Director decision 7)
// ---------------------------------------------------------------------------

export interface ReportedVsActualRow {
  metric_code: string;
  /** null when this metric was never part of the filed submission. */
  reported: number | string | null;
  actual: number | string;
  drift: number | string | null;
}

export interface ReportedVsActual {
  metricCode: string;
  reported: number | null;
  actual: number;
  drift: number | null;
  /** 'unreported' when the body was never given a figure for this metric. */
  status: 'unreported' | 'unchanged' | 'grown' | 'fallen';
  sentence: string;
}

/**
 * A figure filed with an awarding body is a historical fact and does not become
 * wrong when the underlying data moves. So this never calls a drift an error —
 * it states both numbers and leaves the judgement to the IQAC.
 */
export function summariseReportedVsActual(row: ReportedVsActualRow): ReportedVsActual {
  const num = (v: unknown): number | null => {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  const reported = num(row.reported);
  const actual = num(row.actual) ?? 0;
  const drift = reported === null ? null : actual - reported;

  let status: ReportedVsActual['status'];
  let sentence: string;

  if (reported === null) {
    status = 'unreported';
    sentence = `Not part of the filed submission. ${actual} held today.`;
  } else if (drift === 0) {
    status = 'unchanged';
    sentence = `Reported ${reported}, and still ${actual} today.`;
  } else if ((drift ?? 0) > 0) {
    status = 'grown';
    sentence = `Reported ${reported}; ${actual} today (${drift} more since filing).`;
  } else {
    status = 'fallen';
    sentence = `Reported ${reported}; ${actual} today (${Math.abs(drift ?? 0)} fewer since filing).`;
  }

  return { metricCode: row.metric_code, reported, actual, drift, status, sentence };
}
