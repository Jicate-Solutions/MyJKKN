import { useQuery } from '@tanstack/react-query';
import { BillCoverageService } from '@/lib/services/billing/coverage/bill-coverage-service';
import type { BillCoverageFilters } from '@/types/billing-coverage';

// Query keys — local to the module (same convention as use-billing-analytics.ts).
export const billCoverageKeys = {
  all: ['bill-coverage'] as const,
  summary: (f: BillCoverageFilters) =>
    [...billCoverageKeys.all, 'summary', f] as const,
  learners: (f: BillCoverageFilters) =>
    [...billCoverageKeys.all, 'learners', f] as const
};

const STALE = 2 * 60 * 1000; // 2 minutes

/** `enabled` is held by the page's tab state. The summary sweeps every in-scope
 *  learner against every live bill, and the hook is hoisted above the Tabs so
 *  the filter object can be shared — without this it would keep running while
 *  the user is on the Audit tab, which does not display it. */
export function useBillCoverageSummary(
  filters: BillCoverageFilters,
  enabled = true
) {
  return useQuery({
    queryKey: billCoverageKeys.summary(filters),
    queryFn: () => BillCoverageService.getSummary(filters),
    enabled,
    staleTime: STALE,
    placeholderData: (prev) => prev
  });
}

export function useBillCoverageLearners(filters: BillCoverageFilters) {
  return useQuery({
    queryKey: billCoverageKeys.learners(filters),
    queryFn: () => BillCoverageService.getLearners(filters),
    staleTime: STALE,
    placeholderData: (prev) => prev
  });
}
