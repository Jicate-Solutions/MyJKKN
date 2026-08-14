// app/(routes)/accreditation/cac/brief/_lib/use-ownership-rollup.ts
// ============================================================================
// "How many metrics have somebody's name against them" — for the whole cluster.
//
// The owner desk (/accreditation/manage/owners) answers this ONE COLLEGE AT A
// TIME, because that is the question an IQAC coordinator has. The Council's
// question is the sum across every college. This module supplies only the
// summing: every rule about WHICH row owns a metric — body-level inheritance,
// an explicit row overriding it, a decline that must not fall back — is reused
// verbatim from that desk's own pure helpers. Re-deriving them here would give
// the Council a second, quietly different answer to the same question.
//
// WHY THE DENOMINATOR IS PAIRS AND NOT METRICS. Ownership is recorded per
// (college, metric): the same NAAC metric is somebody's job in Dental and
// somebody else's in Nursing. Counting "107 metrics" would hide thirteen
// colleges' worth of unowned work behind one number.
//
// WHY THE INSTITUTION LIST COMES FROM AN RPC AND NOT FROM `institutions`.
// `institutions` carries a blanket `USING (true)` policy, so reading it offers
// every campus to everyone — while `accreditation_metric_owners` is correctly
// scoped. Mixing the two produces a denominator covering colleges whose owner
// rows the viewer cannot see, and the brief would report them as unowned. A
// denied read must never be printed as a finding. `_user_accessible_institutions()`
// is the existing helper: STABLE SECURITY DEFINER, no caller-supplied id.
//
// Read-only. Nothing here writes, and the brief has no control that could.
// ============================================================================

import { useQuery } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import {
  resolveMetricOwners,
  tallyOwnership,
  type FrameworkMetric,
  type OwnerRow,
  type OwnershipTally,
} from '../../../manage/owners/_lib/owner-inheritance';

export const ownershipRollupKeys = {
  all: ['accreditation', 'cac-brief', 'ownership'] as const,
};

/** The cluster-wide roll-up the brief prints. */
export interface OwnershipRollup extends OwnershipTally {
  /** How many colleges the viewer may read owner rows for. */
  institutions: number;
  /** Metrics in the active framework — the per-college multiplicand. */
  metrics: number;
}

/**
 * Sum one tally into another.
 *
 * Exported and pure so the arithmetic can be exercised without a database — the
 * page cannot be imported under vitest (module-scope Supabase client), the same
 * reason `cluster-scope.ts` and `cac-metric-catalog.ts` sit apart from theirs.
 */
export function addTally(a: OwnershipTally, b: OwnershipTally): OwnershipTally {
  return {
    total: a.total + b.total,
    assigned: a.assigned + b.assigned,
    confirmed: a.confirmed + b.confirmed,
    pending: a.pending + b.pending,
    declined: a.declined + b.declined,
    unassigned: a.unassigned + b.unassigned,
    explicit: a.explicit + b.explicit,
    inherited: a.inherited + b.inherited,
  };
}

export const EMPTY_TALLY: OwnershipTally = {
  total: 0,
  assigned: 0,
  confirmed: 0,
  pending: 0,
  declined: 0,
  unassigned: 0,
  explicit: 0,
  inherited: 0,
};

/**
 * Roll every accessible college's ownership up into one figure.
 *
 * Exported separately from the query so the shaping is testable: hand it a
 * framework, some owner rows and a list of college ids, and the result is the
 * same one the brief prints.
 */
export function rollUpOwnership(
  metrics: readonly FrameworkMetric[],
  ownerRows: readonly OwnerRow[],
  institutionIds: readonly string[],
): OwnershipRollup {
  const summed = institutionIds.reduce<OwnershipTally>(
    (acc, id) => addTally(acc, tallyOwnership(resolveMetricOwners(metrics, ownerRows, id))),
    EMPTY_TALLY,
  );
  return { ...summed, institutions: institutionIds.length, metrics: metrics.length };
}

/**
 * The three reads, in one query so the brief makes one request rather than
 * three that can disagree with each other halfway through a render.
 *
 * Throws on any of them failing. That is deliberate: the caller renders "this
 * could not be read" rather than a zero, because zero is a claim about the
 * cluster and a failed read is not.
 */
export function useOwnershipRollup(enabled: boolean) {
  return useQuery({
    queryKey: ownershipRollupKeys.all,
    enabled,
    queryFn: async (): Promise<OwnershipRollup> => {
      const sb = createClientSupabaseClient() as any;

      const { data: allowedIds, error: allowedError } = await sb.rpc(
        '_user_accessible_institutions',
      );
      if (allowedError) throw allowedError;
      const institutionIds = ((allowedIds ?? []) as string[]).filter(Boolean);
      if (institutionIds.length === 0) {
        return { ...EMPTY_TALLY, institutions: 0, metrics: 0 };
      }

      const { data: metricRows, error: metricError } = await sb
        .from('sh_accreditation_metrics')
        .select('metric_code, metric_type, category, metric_name')
        .eq('is_active', true);
      if (metricError) throw metricError;

      // No institution filter: RLS on accreditation_metric_owners already
      // returns exactly the rows this viewer may see, and filtering to a list
      // of ids would only re-state that less reliably.
      const { data: ownerRowData, error: ownerError } = await sb
        .from('accreditation_metric_owners')
        .select(
          'id, institution_id, body_code, metric_code, programme_id, owner_user_id, assignment_status, acknowledged_at, previous_owner_user_id, owner_changed_at',
        );
      if (ownerError) throw ownerError;

      return rollUpOwnership(
        (metricRows ?? []) as FrameworkMetric[],
        (ownerRowData ?? []) as OwnerRow[],
        institutionIds,
      );
    },
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: false,
  });
}
