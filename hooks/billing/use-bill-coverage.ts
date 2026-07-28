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

export function useBillCoverageSummary(filters: BillCoverageFilters) {
  return useQuery({
    queryKey: billCoverageKeys.summary(filters),
    queryFn: () => BillCoverageService.getSummary(filters),
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
