import { useQuery } from '@tanstack/react-query';
import { BillingAnalyticsService } from '@/lib/services/billing/analytics/billing-analytics-service';
import type {
  BillingAnalyticsFilters,
  TrendGranularity,
} from '@/types/billing-analytics';

// Query keys — local to the module (same convention as use-onboarding.ts).
export const billingAnalyticsKeys = {
  all: ['billing-analytics'] as const,
  overview: (f: BillingAnalyticsFilters) =>
    [...billingAnalyticsKeys.all, 'overview', f] as const,
  today: (institutionIds?: string[]) =>
    [...billingAnalyticsKeys.all, 'today', institutionIds ?? null] as const,
  trend: (f: BillingAnalyticsFilters & { granularity?: TrendGranularity }) =>
    [...billingAnalyticsKeys.all, 'trend', f] as const,
  byInstitution: (f: BillingAnalyticsFilters) =>
    [...billingAnalyticsKeys.all, 'by-institution', f] as const,
  aging: (institutionIds?: string[]) =>
    [...billingAnalyticsKeys.all, 'aging', institutionIds ?? null] as const,
  byCategory: (institutionIds?: string[]) =>
    [...billingAnalyticsKeys.all, 'by-category', institutionIds ?? null] as const,
  collectionSplit: (f: BillingAnalyticsFilters) =>
    [...billingAnalyticsKeys.all, 'collection-split', f] as const,
  userActivity: (f: BillingAnalyticsFilters) =>
    [...billingAnalyticsKeys.all, 'user-activity', f] as const,
  dailyActivity: (f: BillingAnalyticsFilters) =>
    [...billingAnalyticsKeys.all, 'daily-activity', f] as const,
};

const STALE = 2 * 60 * 1000; // 2 minutes

export function useBillingOverview(filters: BillingAnalyticsFilters) {
  return useQuery({
    queryKey: billingAnalyticsKeys.overview(filters),
    queryFn: () => BillingAnalyticsService.getOverview(filters),
    staleTime: STALE,
    placeholderData: (prev) => prev,
  });
}

/** Live "Today's Collections" — polls every 60s so the cash counter stays current. */
export function useTodayCollections(filters: BillingAnalyticsFilters) {
  return useQuery({
    queryKey: billingAnalyticsKeys.today(filters.institution_ids),
    queryFn: () => BillingAnalyticsService.getTodayCollections(filters),
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
    refetchIntervalInBackground: false,
  });
}

export function useCollectionTrend(
  filters: BillingAnalyticsFilters & { granularity?: TrendGranularity }
) {
  return useQuery({
    queryKey: billingAnalyticsKeys.trend(filters),
    queryFn: () => BillingAnalyticsService.getCollectionTrend(filters),
    staleTime: STALE,
    placeholderData: (prev) => prev,
  });
}

export function useInstitutionAnalytics(filters: BillingAnalyticsFilters) {
  return useQuery({
    queryKey: billingAnalyticsKeys.byInstitution(filters),
    queryFn: () => BillingAnalyticsService.getByInstitution(filters),
    staleTime: STALE,
    placeholderData: (prev) => prev,
  });
}

export function useAgingBuckets(filters: BillingAnalyticsFilters) {
  return useQuery({
    queryKey: billingAnalyticsKeys.aging(filters.institution_ids),
    queryFn: () => BillingAnalyticsService.getAging(filters),
    staleTime: STALE,
    placeholderData: (prev) => prev,
  });
}

/** Management vs Government vs Unallocated collection. */
export function useCollectionSplit(filters: BillingAnalyticsFilters) {
  return useQuery({
    queryKey: billingAnalyticsKeys.collectionSplit(filters),
    queryFn: () => BillingAnalyticsService.getCollectionSplit(filters),
    staleTime: STALE,
    placeholderData: (prev) => prev,
  });
}

export function useCategoryBreakdown(filters: BillingAnalyticsFilters) {
  return useQuery({
    queryKey: billingAnalyticsKeys.byCategory(filters.institution_ids),
    queryFn: () => BillingAnalyticsService.getByCategory(filters),
    staleTime: STALE,
    placeholderData: (prev) => prev,
  });
}

export function useUserActivity(filters: BillingAnalyticsFilters) {
  return useQuery({
    queryKey: billingAnalyticsKeys.userActivity(filters),
    queryFn: () => BillingAnalyticsService.getUserActivity(filters),
    staleTime: STALE,
    placeholderData: (prev) => prev,
  });
}

export function useDailyActivity(filters: BillingAnalyticsFilters) {
  return useQuery({
    queryKey: billingAnalyticsKeys.dailyActivity(filters),
    queryFn: () => BillingAnalyticsService.getDailyActivity(filters),
    staleTime: STALE,
    placeholderData: (prev) => prev,
  });
}
