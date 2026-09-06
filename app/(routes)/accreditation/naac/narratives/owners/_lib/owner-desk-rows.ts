// app/(routes)/accreditation/naac/narratives/owners/_lib/owner-desk-rows.ts
// ============================================================================
// Ordering and labelling for the NAAC owner-assignment desk.
//
// WHY THIS IS A SEPARATE FILE
// The desk crashed in production on 2026-08-14 with
//   "Cannot read properties of null (reading 'localeCompare')"
// because it sorted rows on accreditation_metric_owners.metric_code, which is
// NULLABLE in production, with a bare `a.metric_code.localeCompare(...)`. The
// logic lived inside a component useMemo, so nothing could test it. It lives
// here now for the same reason ../../../manage/owners/_lib/owner-inheritance.ts
// exists: ordering rules that carry meaning deserve their own tests.
//
// WHAT A NULL metric_code MEANS
// NULL is not missing data. It is the WHOLE-BODY assignment: one row, no metric
// code, and every metric of that body at that institution inherits its owner.
// See app/(routes)/accreditation/my-gaps/_lib/worklist.ts and
// lib/services/accreditation/owner-digest.ts, which both model it that way.
//
// All 14 owner rows live on 2026-08-13 are body-level, which is the Director's
// chosen granularity — so this is the NORMAL case here, not an edge case.
// ============================================================================

/** One assignable (institution × metric) pair, with where it came from. */
export interface MetricPair {
  institution_id: string;
  /** NULL = a whole-body assignment covering every NAAC metric at this campus. */
  metric_code: string | null;
  hasNarrative: boolean;
  hasEvidence: boolean;
}

export interface OwnerDeskGroup {
  institutionId: string;
  institutionName: string;
  rows: MetricPair[];
}

export type OwnerDeskFilter = 'all' | 'unassigned' | 'assigned';

/**
 * The map key for one (institution × metric) pair.
 *
 * A NULL metric_code interpolates to the literal "null", which is exactly what
 * the page has always produced. That is deliberate and must not change: the
 * owner lookup, the saving-row flag and the per-campus assigned count are all
 * keyed this way, so a body-level row would read as unassigned the moment one
 * caller disagreed with another about how NULL is spelled. Everything that
 * builds this key goes through this function so they cannot drift apart.
 */
export const pairKey = (
  institutionId: string,
  metricCode: string | null,
): string => `${institutionId}::${metricCode}`;

/** True when this pair is the whole-body umbrella rather than one metric. */
export const isBodyLevelPair = (pair: MetricPair): boolean =>
  pair.metric_code === null || pair.metric_code === undefined;

/** What to show in the metric-code column for a whole-body assignment. */
export const BODY_LEVEL_CODE_LABEL = 'Whole body';

/** What to show in the metric-name column for a whole-body assignment. */
export const BODY_LEVEL_NAME_LABEL = 'Every NAAC metric for this campus';

/**
 * Order two metric codes, whole-body first.
 *
 * A whole-body assignment is the umbrella over every row beneath it, so it
 * belongs at the TOP of its campus. Two rejected alternatives, for the record:
 *   · `a.metric_code ?? ''` would sort it first by accident, then render an
 *     empty metric cell that reads as broken data.
 *   · Filtering NULL rows out would hide the only assignment this desk has,
 *     and hide it from the "assigned" counts that IQAC reads.
 */
export function compareMetricCode(
  a: string | null | undefined,
  b: string | null | undefined,
): number {
  const aBody = a === null || a === undefined;
  const bBody = b === null || b === undefined;
  if (aBody && bBody) return 0;
  if (aBody) return -1;
  if (bBody) return 1;
  return a.localeCompare(b);
}

/**
 * Bucket the visible pairs by campus, each campus's rows metric-code sorted
 * with its whole-body row first, and the campuses themselves alphabetical.
 *
 * `institutionNames` may not have loaded yet or may omit a campus the reader
 * cannot see by name; the 'Unknown campus' fallback keeps that sort total.
 */
export function groupPairsByInstitution(
  pairs: readonly MetricPair[],
  ownerByKey: ReadonlyMap<string, string>,
  filter: OwnerDeskFilter,
  institutionNames: Record<string, string> | undefined,
): OwnerDeskGroup[] {
  const visible = pairs.filter((p) => {
    const assigned = ownerByKey.has(pairKey(p.institution_id, p.metric_code));
    if (filter === 'unassigned') return !assigned;
    if (filter === 'assigned') return assigned;
    return true;
  });

  const byInstitution = new Map<string, MetricPair[]>();
  for (const p of visible) {
    const bucket = byInstitution.get(p.institution_id) ?? [];
    bucket.push(p);
    byInstitution.set(p.institution_id, bucket);
  }

  return [...byInstitution.entries()]
    .map(([institutionId, rows]) => ({
      institutionId,
      institutionName: institutionNames?.[institutionId] ?? 'Unknown campus',
      rows: rows.sort((a, b) => compareMetricCode(a.metric_code, b.metric_code)),
    }))
    .sort((a, b) => a.institutionName.localeCompare(b.institutionName));
}
