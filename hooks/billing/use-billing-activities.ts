import { useQuery } from '@tanstack/react-query';
import { BillingActivityService } from '@/lib/services/billing/billing-activity-service';
import type { BillingActivityFilters } from '@/types/billing-activity';

export const billingActivityKeys = {
  all: ['billing-activities'] as const,
  lists: () => [...billingActivityKeys.all, 'list'] as const,
  list: (filters: BillingActivityFilters) =>
    [...billingActivityKeys.lists(), filters] as const,
  metrics: (dateRange: { from: string; to: string }) =>
    [...billingActivityKeys.all, 'metrics', dateRange] as const
};

export function useBillingActivities(filters: BillingActivityFilters = {}) {
  return useQuery({
    queryKey: billingActivityKeys.list(filters),
    queryFn: () => BillingActivityService.getActivities(filters),
    staleTime: 2 * 60 * 1000
  });
}

export function useBillingActivityMetrics(dateRange: {
  from: string;
  to: string;
}) {
  return useQuery({
    queryKey: billingActivityKeys.metrics(dateRange),
    queryFn: () => BillingActivityService.getMetrics(dateRange),
    staleTime: 2 * 60 * 1000,
    enabled: !!dateRange.from && !!dateRange.to
  });
}
