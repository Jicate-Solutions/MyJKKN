import { useQuery } from '@tanstack/react-query';
import { BillCoverageAuditService } from '@/lib/services/billing/coverage/bill-coverage-audit-service';
import type { BillCoverageFilters } from '@/types/billing-coverage';

// Query keys — local to the module, same convention as use-bill-coverage.ts.
// Kept under their own root rather than nested inside billCoverageKeys so a
// coverage invalidation never blows away the audit caches and vice versa.
export const billAuditKeys = {
  all: ['bill-coverage-audit'] as const,
  missingYearsSummary: (f: BillCoverageFilters) =>
    [...billAuditKeys.all, 'missing-years', 'summary', f] as const,
  missingYears: (f: BillCoverageFilters) =>
    [...billAuditKeys.all, 'missing-years', 'list', f] as const,
  duplicateYearsSummary: (f: BillCoverageFilters) =>
    [...billAuditKeys.all, 'duplicate-years', 'summary', f] as const,
  duplicateYears: (f: BillCoverageFilters) =>
    [...billAuditKeys.all, 'duplicate-years', 'list', f] as const
};

const STALE = 2 * 60 * 1000; // 2 minutes, matching the Coverage tab.

export function useMissingYearAuditSummary(
  filters: BillCoverageFilters,
  enabled = true
) {
  return useQuery({
    queryKey: billAuditKeys.missingYearsSummary(filters),
    queryFn: () => BillCoverageAuditService.getMissingYearsSummary(filters),
    // Both audits sweep every learner and every tuition bill, so the sub-tab
    // that is not on screen must not run. Without this, opening the Audit tab
    // would fire both sweeps at once.
    enabled,
    staleTime: STALE,
    placeholderData: (prev) => prev
  });
}

export function useDuplicateYearAuditSummary(
  filters: BillCoverageFilters,
  enabled = true
) {
  return useQuery({
    queryKey: billAuditKeys.duplicateYearsSummary(filters),
    queryFn: () => BillCoverageAuditService.getDuplicateYearsSummary(filters),
    enabled,
    staleTime: STALE,
    placeholderData: (prev) => prev
  });
}
