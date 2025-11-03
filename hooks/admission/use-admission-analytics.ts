import { useQuery } from '@tanstack/react-query';
import {
  AdmissionAnalyticsFilters,
  AdmissionDashboardAnalytics,
  AdmissionAIInsights
} from '@/types/admission';
import { AdmissionService } from '@/lib/services/admission/admission-service';

/**
 * React Query key factory for admission analytics
 */
export const admissionAnalyticsKeys = {
  all: ['admission-analytics'] as const,
  analytics: (filters: AdmissionAnalyticsFilters) =>
    [...admissionAnalyticsKeys.all, 'dashboard', filters] as const,
  aiInsights: (filters: AdmissionAnalyticsFilters) =>
    [...admissionAnalyticsKeys.all, 'ai-insights', filters] as const
};

/**
 * Hook to fetch admission dashboard analytics
 *
 * Features:
 * - Automatic refetch on window focus
 * - 5-minute stale time for performance
 * - Retry on failure
 * - Institution-based filtering handled by service
 *
 * @param filters - Analytics filters (institution, degree, department, program, status, dateRange)
 * @param options - Additional React Query options
 * @returns Query result with analytics data
 *
 * @example
 * ```tsx
 * const { data, isLoading, error } = useAdmissionAnalytics({
 *   institution_id: 'inst-123',
 *   dateRange: {
 *     from: new Date('2024-01-01'),
 *     to: new Date('2024-12-31')
 *   }
 * });
 * ```
 */
export function useAdmissionAnalytics(
  filters: AdmissionAnalyticsFilters = {},
  options?: {
    enabled?: boolean;
    refetchInterval?: number;
    staleTime?: number;
  }
) {
  return useQuery<AdmissionDashboardAnalytics, Error>({
    queryKey: admissionAnalyticsKeys.analytics(filters),
    queryFn: async () => {
      return await AdmissionService.getDashboardAnalytics(filters);
    },
    staleTime: options?.staleTime ?? 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: true,
    retry: 2,
    enabled: options?.enabled ?? true,
    refetchInterval: options?.refetchInterval
  });
}

/**
 * Hook to fetch AI-generated insights
 *
 * This hook calls the API route which generates insights server-side
 * to keep the Claude API key secure.
 *
 * Features:
 * - Server-side AI generation for security
 * - Longer stale time (10 minutes) since insights are expensive
 * - Manual refetch capability
 * - Disabled by default - must be explicitly enabled
 *
 * @param filters - Same filters used for analytics (for consistency)
 * @param options - Additional options including enable flag
 * @returns Query result with AI insights
 *
 * @example
 * ```tsx
 * const [generateInsights, setGenerateInsights] = useState(false);
 *
 * const { data, isLoading, refetch } = useAdmissionAIInsights(filters, {
 *   enabled: generateInsights
 * });
 *
 * // Trigger insights generation
 * <button onClick={() => setGenerateInsights(true)}>Generate Insights</button>
 * ```
 */
export function useAdmissionAIInsights(
  filters: AdmissionAnalyticsFilters = {},
  options?: {
    enabled?: boolean;
    staleTime?: number;
  }
) {
  return useQuery<AdmissionAIInsights, Error>({
    queryKey: admissionAnalyticsKeys.aiInsights(filters),
    queryFn: async () => {
      // Call API route instead of direct service to keep API key secure
      const queryParams = new URLSearchParams();

      if (filters.institution_id) {
        queryParams.append('institution_id', filters.institution_id);
      }
      if (filters.degree_id) {
        queryParams.append('degree_id', filters.degree_id);
      }
      if (filters.department_id) {
        queryParams.append('department_id', filters.department_id);
      }
      if (filters.program_id) {
        queryParams.append('program_id', filters.program_id);
      }
      if (filters.status) {
        queryParams.append('status', filters.status);
      }
      if (filters.state) {
        queryParams.append('state', filters.state);
      }
      if (filters.district) {
        queryParams.append('district', filters.district);
      }
      if (filters.dateRange) {
        queryParams.append('from', filters.dateRange.from.toISOString());
        queryParams.append('to', filters.dateRange.to.toISOString());
      }

      const url = `/api/admissions/ai-insights${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({
          error: 'Failed to generate AI insights'
        }));
        throw new Error(error.error || 'Failed to generate AI insights');
      }

      return await response.json();
    },
    staleTime: options?.staleTime ?? 10 * 60 * 1000, // 10 minutes (AI insights are expensive)
    refetchOnWindowFocus: false, // Don't auto-refetch on focus (expensive operation)
    retry: 1, // Only retry once (AI calls are expensive)
    enabled: options?.enabled ?? false // Disabled by default - must be explicitly enabled
  });
}

/**
 * Hook to prefetch analytics data
 *
 * Useful for preloading data before navigation or when filters change.
 *
 * @example
 * ```tsx
 * const prefetchAnalytics = usePrefetchAdmissionAnalytics();
 *
 * // Prefetch on hover
 * <Link
 *   href="/admissions/analytics"
 *   onMouseEnter={() => prefetchAnalytics(filters)}
 * >
 *   View Analytics
 * </Link>
 * ```
 */
export function usePrefetchAdmissionAnalytics() {
  const queryClient = useQueryClient();

  return async (filters: AdmissionAnalyticsFilters = {}) => {
    await queryClient.prefetchQuery({
      queryKey: admissionAnalyticsKeys.analytics(filters),
      queryFn: async () => {
        return await AdmissionService.getDashboardAnalytics(filters);
      },
      staleTime: 5 * 60 * 1000
    });
  };
}

// Re-export for convenience
import { useQueryClient } from '@tanstack/react-query';

/**
 * Hook to invalidate and refetch analytics
 *
 * Useful after creating/updating/deleting admissions to refresh analytics.
 *
 * @example
 * ```tsx
 * const { invalidateAnalytics } = useInvalidateAdmissionAnalytics();
 *
 * const handleAdmissionUpdate = async () => {
 *   await updateAdmission(data);
 *   await invalidateAnalytics(); // Refresh analytics
 * };
 * ```
 */
export function useInvalidateAdmissionAnalytics() {
  const queryClient = useQueryClient();

  return {
    invalidateAnalytics: async () => {
      await queryClient.invalidateQueries({
        queryKey: admissionAnalyticsKeys.all
      });
    },
    invalidateAIInsights: async () => {
      await queryClient.invalidateQueries({
        queryKey: [...admissionAnalyticsKeys.all, 'ai-insights']
      });
    }
  };
}
