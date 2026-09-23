import { useQuery } from '@tanstack/react-query';
import { BillingAuditService } from '@/lib/services/campus-living/billing-audit-service';
import type { BillingAuditFilters } from '@/types/campus-living-billing-audit';

// Query keys — local to the module (same convention as hooks/billing/use-bill-coverage.ts).
export const billingAuditKeys = {
  all: ['cl-billing-audit'] as const,
  summary: (f: BillingAuditFilters) => [...billingAuditKeys.all, 'summary', f] as const,
  learners: (f: BillingAuditFilters) => [...billingAuditKeys.all, 'learners', f] as const
};

const STALE = 2 * 60 * 1000; // 2 minutes

/** The summary sweeps every hostel learner against every live hostel bill —
 *  callers pass `enabled` so a page that does not display it never runs it. */
export function useBillingAuditSummary(filters: BillingAuditFilters, enabled = true) {
  return useQuery({
    queryKey: billingAuditKeys.summary(filters),
    queryFn: () => BillingAuditService.getSummary(filters),
    enabled,
    staleTime: STALE,
    placeholderData: (prev) => prev
  });
}

export function useBillingAuditLearners(filters: BillingAuditFilters, enabled = true) {
  return useQuery({
    queryKey: billingAuditKeys.learners(filters),
    queryFn: () => BillingAuditService.getLearners(filters),
    enabled,
    staleTime: STALE,
    placeholderData: (prev) => prev
  });
}
