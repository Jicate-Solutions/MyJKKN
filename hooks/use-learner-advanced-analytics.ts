import { useQuery } from '@tanstack/react-query';
import type { LearnerDashboardFilters, AdvancedLearnerAnalytics } from '@/types/learner-analytics';

/**
 * Query keys for learner advanced analytics
 * Follows React Query best practices for hierarchical keys
 */
export const learnerAdvancedAnalyticsKeys = {
  all: ['learner-advanced-analytics'] as const,
  filtered: (filters: LearnerDashboardFilters) =>
    [...learnerAdvancedAnalyticsKeys.all, 'filtered', filters] as const,
};

/**
 * Hook for fetching advanced learner analytics
 *
 * Returns 4 analytics categories:
 * 1. Intake & Capacity - Seat utilization, over-intake alerts, waitlist conversion
 * 2. Geography - District/Taluk contributions, hostel ratios, transport usage
 * 3. Trends - Gender ratio, category mix, first-generation, income distribution
 * 4. School Feeders - Feeder institution tracking, school type classification
 *
 * @param filters - Dashboard filters for analytics
 * @param options - React Query options
 *
 * @example
 * ```tsx
 * const { data, isLoading, error } = useLearnerAdvancedAnalytics({
 *   institutionId: 'xxx',
 *   programId: 'yyy',
 * });
 *
 * if (isLoading) return <Spinner />;
 * if (error) return <Error message={error.message} />;
 *
 * return (
 *   <>
 *     <IntakeCapacityTab data={data.intakeCapacity} />
 *     <GeographyTab data={data.geography} />
 *   </>
 * );
 * ```
 */
export function useLearnerAdvancedAnalytics(
  filters: LearnerDashboardFilters,
  options?: {
    enabled?: boolean;
    refetchInterval?: number;
  }
) {
  return useQuery({
    queryKey: learnerAdvancedAnalyticsKeys.filtered(filters),
    queryFn: async () => {
      const params = new URLSearchParams();

      // Add all filters to URL params
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          if (Array.isArray(value)) {
            // Handle array values (like lifecycleStatus)
            value.forEach(v => params.append(key, v));
          } else {
            params.set(key, String(value));
          }
        }
      });

      const response = await fetch(`/api/learners/analytics/advanced?${params}`);

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(
          errorData?.message || `Failed to fetch advanced analytics: ${response.statusText}`
        );
      }

      return response.json() as Promise<AdvancedLearnerAnalytics>;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes - analytics data doesn't change frequently
    gcTime: 10 * 60 * 1000, // 10 minutes - keep in cache for longer
    enabled: options?.enabled !== false, // Allow disabling query
    refetchInterval: options?.refetchInterval, // Allow custom refetch interval
  });
}
