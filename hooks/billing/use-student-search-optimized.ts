import { useQuery, useQueryClient } from '@tanstack/react-query';
import { StudentSearchServiceOptimized } from '@/lib/services/billing/schedule/student-search-service-optimized';
import type {
  StudentForBillingListResponse,
  StudentSearchFilters as StudentSearchFiltersType,
  StudentBillingSummary,
  StudentForBilling
} from '@/types/billing-schedule';

// Optimized query keys with better cache segmentation
export const studentSearchKeysOptimized = {
  all: ['studentSearch'] as const,
  lists: () => [...studentSearchKeysOptimized.all, 'list'] as const,
  list: (filters: StudentSearchFiltersType) =>
    [...studentSearchKeysOptimized.lists(), filters] as const,
  details: () => [...studentSearchKeysOptimized.all, 'detail'] as const,
  detail: (id: string) =>
    [...studentSearchKeysOptimized.details(), id] as const,
  summaries: () => [...studentSearchKeysOptimized.all, 'summary'] as const,
  summary: (id: string) =>
    [...studentSearchKeysOptimized.summaries(), id] as const,
  // Separate cache keys for different data types to avoid over-invalidation
  summaryCore: (id: string) =>
    [...studentSearchKeysOptimized.summaries(), id, 'core'] as const,
  summaryBills: (id: string) =>
    [...studentSearchKeysOptimized.summaries(), id, 'bills'] as const,
  summaryReceipts: (id: string) =>
    [...studentSearchKeysOptimized.summaries(), id, 'receipts'] as const,
  count: (filters: StudentSearchFiltersType) =>
    [...studentSearchKeysOptimized.all, 'count', filters] as const,
  searchByQuery: (query: string, institutionId?: string, limit?: number) =>
    [
      ...studentSearchKeysOptimized.all,
      'searchByQuery',
      query,
      institutionId,
      limit
    ] as const,
  forBulkOperations: (
    institutionId?: string,
    departmentId?: string,
    semesterId?: string
  ) =>
    [
      ...studentSearchKeysOptimized.all,
      'forBulk',
      institutionId,
      departmentId,
      semesterId
    ] as const
};

// Smart retry configuration based on error type
const getRetryConfig = (failureCount: number, error: any) => {
  // Don't retry for certain error types
  if (error?.message?.includes('not found') || error?.status === 404) {
    return false;
  }

  // Don't retry for authentication errors
  if (error?.status === 401 || error?.status === 403) {
    return false;
  }

  // Retry up to 3 times for network/timeout errors with exponential backoff
  if (failureCount < 3) {
    return true;
  }

  return false;
};

// Enhanced error logging
const logQueryError = (queryKey: string, error: any) => {
  console.error(`Query ${queryKey} failed:`, {
    message: error?.message,
    status: error?.status,
    timestamp: new Date().toISOString()
  });
};

// Define which filter keys are considered search-worthy
const SEARCH_WORTHY_FILTER_KEYS: ReadonlyArray<
  keyof Omit<StudentSearchFiltersType, 'page' | 'limit'>
> = [
  'institution_id',
  'academic_year_id',
  'semester_id',
  'department_id',
  'first_name',
  'last_name',
  'roll_number',
  'mobile_number',
  'is_profile_complete'
];

// Helper function to check for active search criteria
function hasActiveSearchCriteria(filters: StudentSearchFiltersType): boolean {
  return SEARCH_WORTHY_FILTER_KEYS.some((key) => {
    const value = filters[key as keyof StudentSearchFiltersType];
    if (typeof value === 'boolean') {
      return value !== undefined;
    }
    return value !== undefined && value !== null && value !== '';
  });
}

// OPTIMIZED: Hook to search students for billing with enhanced error handling
export function useStudentsForBillingOptimized(
  filters: StudentSearchFiltersType
) {
  const queryClient = useQueryClient();
  const hasSearchCriteria = hasActiveSearchCriteria(filters);

  const queryResult = useQuery<StudentForBillingListResponse, Error>({
    queryKey: studentSearchKeysOptimized.list(filters),
    queryFn: async () => {
      if (!hasSearchCriteria) {
        return {
          data: [],
          metadata: {
            total: 0,
            page: 1,
            limit: filters.limit || 20,
            totalPages: 0
          }
        };
      }
      return StudentSearchServiceOptimized.searchStudentsForBilling(filters);
    },
    retry: getRetryConfig,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000, // Keep in cache longer
    refetchOnWindowFocus: false // Reduce unnecessary refetches
  });

  const isLoading = hasSearchCriteria && queryResult.isLoading;
  const hasPerformedSearch = hasSearchCriteria;

  return {
    ...queryResult,
    isLoading,
    hasPerformedSearch,
    refetch: () =>
      queryClient.invalidateQueries({
        queryKey: studentSearchKeysOptimized.list(filters)
      })
  };
}

// OPTIMIZED: Hook to get a single student for billing details page
export function useStudentForBillingOptimized(studentId: string | null) {
  return useQuery<StudentForBilling, Error>({
    queryKey: studentSearchKeysOptimized.detail(studentId || ''),
    queryFn: async () => {
      if (!studentId) {
        throw new Error('Student ID is required');
      }
      return StudentSearchServiceOptimized.getStudentForBilling(studentId);
    },
    enabled: !!studentId,
    retry: getRetryConfig,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false
  });
}

// OPTIMIZED: Hook to get student billing summary with enhanced performance
export function useStudentBillingSummaryOptimized(studentId: string | null) {
  return useQuery<StudentBillingSummary, Error>({
    queryKey: studentSearchKeysOptimized.summary(studentId || ''),
    queryFn: async () => {
      if (!studentId) {
        throw new Error('Student ID is required');
      }
      return StudentSearchServiceOptimized.getStudentBillingSummary(studentId);
    },
    enabled: !!studentId,
    retry: (failureCount, error) => {
      // Special retry logic for complex billing summary
      if (error?.message?.includes('timeout')) {
        return failureCount < 2; // Retry timeouts only twice
      }
      return getRetryConfig(failureCount, error);
    },
    staleTime: 60 * 1000, // 1 minute - more frequent updates for billing data
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: true, // Important for billing accuracy
    refetchOnMount: true
  });
}

// OPTIMIZED: Hook for student count with smart caching
export function useStudentCountForBillingOptimized(
  filters: StudentSearchFiltersType = {}
) {
  const hasSearchCriteria = hasActiveSearchCriteria(filters);

  return useQuery<number, Error>({
    queryKey: studentSearchKeysOptimized.count(filters),
    queryFn: async () => {
      if (!hasSearchCriteria) return 0;
      const response =
        await StudentSearchServiceOptimized.searchStudentsForBilling(filters);
      return response.metadata.total;
    },
    retry: getRetryConfig,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000, // Keep count data longer
    refetchOnWindowFocus: false
  });
}

// OPTIMIZED: Hook for student search by query with debouncing support
export function useSearchStudentsByQueryOptimized(
  searchQuery: string,
  institutionId?: string,
  limit: number = 10
) {
  return useQuery<StudentForBilling[], Error>({
    queryKey: studentSearchKeysOptimized.searchByQuery(
      searchQuery,
      institutionId,
      limit
    ),
    queryFn: () =>
      StudentSearchServiceOptimized.searchStudentsByQuery(
        searchQuery,
        institutionId,
        limit
      ),
    enabled: !!searchQuery && searchQuery.length >= 2 && !!institutionId,
    retry: getRetryConfig,
    staleTime: 30 * 1000,
    gcTime: 2 * 60 * 1000, // Shorter cache for search results
    refetchOnWindowFocus: false
  });
}

// OPTIMIZED: Hook for bulk operations with better performance
export function useStudentsForBulkOperationsOptimized(
  institutionId?: string,
  departmentId?: string,
  semesterId?: string
) {
  const filters: StudentSearchFiltersType = {
    institution_id: institutionId,
    department_id: departmentId,
    semester_id: semesterId,
    limit: 500,
    page: 1
  };

  return useQuery<StudentForBillingListResponse, Error>({
    queryKey: studentSearchKeysOptimized.forBulkOperations(
      institutionId,
      departmentId,
      semesterId
    ),
    queryFn: () =>
      StudentSearchServiceOptimized.searchStudentsForBilling(filters),
    enabled: !!institutionId,
    retry: getRetryConfig,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false
  });
}

// OPTIMIZED: Hook for outstanding calculation with fallback
export function useStudentOutstandingOptimized(studentId: string | null) {
  return useQuery<number, Error>({
    queryKey: [
      ...studentSearchKeysOptimized.summaries(),
      studentId,
      'outstanding'
    ],
    queryFn: async () => {
      if (!studentId) {
        throw new Error('Student ID is required');
      }
      return StudentSearchServiceOptimized.calculateStudentOutstandingOptimized(
        studentId
      );
    },
    enabled: !!studentId,
    retry: (failureCount, error) => {
      // Special handling for outstanding calculation timeouts
      if (error?.message?.includes('timeout')) {
        return failureCount < 1; // Only retry once for timeouts
      }
      return getRetryConfig(failureCount, error);
    },
    staleTime: 2 * 60 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: true
  });
}

// OPTIMIZED: Smart cache invalidation utilities
export const useSmartBillingCacheInvalidation = () => {
  const queryClient = useQueryClient();

  return {
    // Invalidate only specific student data (more efficient)
    invalidateStudent: (studentId: string) => {
      const keys = [
        studentSearchKeysOptimized.detail(studentId),
        studentSearchKeysOptimized.summary(studentId),
        [...studentSearchKeysOptimized.summaries(), studentId, 'outstanding']
      ];

      keys.forEach((key) => queryClient.invalidateQueries({ queryKey: key }));
    },

    // Invalidate only summary data (for receipt/payment updates)
    invalidateStudentSummary: (studentId: string) => {
      queryClient.invalidateQueries({
        queryKey: studentSearchKeysOptimized.summary(studentId)
      });
      queryClient.invalidateQueries({
        queryKey: [
          ...studentSearchKeysOptimized.summaries(),
          studentId,
          'outstanding'
        ]
      });
    },

    // Invalidate lists only (for new student additions)
    invalidateStudentLists: () => {
      queryClient.invalidateQueries({
        queryKey: studentSearchKeysOptimized.lists()
      });
    },

    // Full invalidation (use sparingly)
    invalidateAll: () => {
      queryClient.invalidateQueries({
        queryKey: studentSearchKeysOptimized.all
      });
    }
  };
};

// Performance monitoring hook
export const useBillingPerformanceMonitor = () => {
  const queryClient = useQueryClient();

  return {
    getQueryStats: () => {
      const cache = queryClient.getQueryCache();
      const queries = cache.getAll();

      const billingQueries = queries.filter(
        (query) => query.queryKey[0] === 'studentSearch'
      );

      return {
        total: billingQueries.length,
        loading: billingQueries.filter(
          (q) => q.state.fetchStatus === 'fetching'
        ).length,
        error: billingQueries.filter((q) => q.state.status === 'error').length,
        success: billingQueries.filter((q) => q.state.status === 'success')
          .length,
        stale: billingQueries.filter((q) => q.isStale()).length
      };
    },

    clearStaleQueries: () => {
      queryClient.removeQueries({
        queryKey: studentSearchKeysOptimized.all,
        stale: true
      });
    }
  };
};
