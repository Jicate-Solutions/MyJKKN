import { useQuery, useQueryClient } from '@tanstack/react-query';
import { StudentSearchService } from '@/lib/services/billing/schedule/student-search-service';
import type {
  StudentForBillingListResponse,
  StudentSearchFilters as StudentSearchFiltersType,
  StudentBillingSummary,
  StudentForBilling
} from '@/types/billing-schedule';

export const studentSearchKeys = {
  all: ['studentSearch'] as const,
  lists: () => [...studentSearchKeys.all, 'list'] as const,
  list: (filters: StudentSearchFiltersType) =>
    [...studentSearchKeys.lists(), filters] as const,
  details: () => [...studentSearchKeys.all, 'detail'] as const,
  detail: (id: string) => [...studentSearchKeys.details(), id] as const,
  summaries: () => [...studentSearchKeys.all, 'summary'] as const,
  summary: (id: string) => [...studentSearchKeys.summaries(), id] as const,
  count: (filters: StudentSearchFiltersType) =>
    [...studentSearchKeys.all, 'count', filters] as const,
  // Key for useSearchStudentsByQuery
  searchByQuery: (query: string, institutionId?: string, limit?: number) =>
    [
      ...studentSearchKeys.all,
      'searchByQuery',
      query,
      institutionId,
      limit
    ] as const,
  // Key for useStudentsForBulkOperations - can reuse list or be specific
  forBulkOperations: (
    institutionId?: string,
    departmentId?: string,
    semesterId?: string
  ) =>
    [
      ...studentSearchKeys.all,
      'forBulk',
      institutionId,
      departmentId,
      semesterId
    ] as const
};

// Define which filter keys are considered search-worthy for useStudentsForBilling
const SEARCH_WORTHY_FILTER_KEYS: ReadonlyArray<
  keyof Omit<StudentSearchFiltersType, 'page' | 'limit'>
> = [
  'institution_id',
  'academic_year_id',
  'semester_id',
  'department_id',
  'student_name',
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

// Hook to search students for billing with filters (main list page)
export function useStudentsForBilling(filters: StudentSearchFiltersType) {
  const queryClient = useQueryClient();
  const hasSearchCriteria = hasActiveSearchCriteria(filters);

  const queryResult = useQuery<StudentForBillingListResponse, Error>({
    queryKey: studentSearchKeys.list(filters),
    queryFn: () => {
      if (!hasSearchCriteria) {
        return Promise.resolve({
          data: [],
          metadata: {
            total: 0,
            page: 1,
            limit: filters.limit || 20,
            totalPages: 0
          }
        });
      }
      return StudentSearchService.searchStudentsForBilling(filters);
    },
    staleTime: 5 * 60 * 1000
  });

  const isLoading = hasSearchCriteria && queryResult.isLoading;
  const hasPerformedSearch = hasSearchCriteria;

  return {
    ...queryResult,
    isLoading,
    hasPerformedSearch,
    refetch: () =>
      queryClient.invalidateQueries({
        queryKey: studentSearchKeys.list(filters)
      })
  };
}

// Hook to get a single student for billing details page
export function useStudentForBilling(studentId: string | null) {
  return useQuery<StudentForBilling, Error>({
    queryKey: studentSearchKeys.detail(studentId || ''),
    queryFn: () => {
      if (!studentId) {
        return Promise.reject(new Error('Student ID is required.'));
      }
      return StudentSearchService.getStudentForBilling(studentId);
    },
    enabled: !!studentId,
    staleTime: 5 * 60 * 1000
  });
}

// Hook to get student billing summary for details page
export function useStudentBillingSummary(studentId: string | null) {
  return useQuery<StudentBillingSummary, Error>({
    queryKey: studentSearchKeys.summary(studentId || ''),
    queryFn: () => {
      if (!studentId) {
        return Promise.reject(new Error('Student ID is required.'));
      }
      return StudentSearchService.getStudentBillingSummary(studentId);
    },
    enabled: !!studentId,
    staleTime: 30 * 1000,
    refetchOnWindowFocus: true,
    refetchOnMount: true
  });
}

// Hook to get student count by filters
export function useStudentCountForBilling(
  filters: StudentSearchFiltersType = {}
) {
  const hasSearchCriteria = hasActiveSearchCriteria(filters);
  return useQuery<number, Error>({
    queryKey: studentSearchKeys.count(filters),
    queryFn: async () => {
      if (!hasSearchCriteria) return 0;
      const response = await StudentSearchService.searchStudentsForBilling(
        filters
      );
      return response.metadata.total;
    },
    staleTime: 5 * 60 * 1000
  });
}

// Hook for student search by query (e.g., for autocomplete in StudentBillForm)
export function useSearchStudentsByQuery(
  searchQuery: string,
  institutionId?: string,
  limit: number = 10
) {
  return useQuery<StudentForBilling[], Error>({
    queryKey: studentSearchKeys.searchByQuery(
      searchQuery,
      institutionId,
      limit
    ),
    queryFn: () =>
      StudentSearchService.searchStudentsByQuery(
        searchQuery,
        institutionId,
        limit
      ),
    enabled: !!searchQuery && searchQuery.length >= 2 && !!institutionId, // Ensure institutionId is also present
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000
  });
}

// Hook to get students for bulk operations page
export function useStudentsForBulkOperations(
  institutionId?: string,
  departmentId?: string,
  semesterId?: string
) {
  // For bulk operations, we typically want a larger, less paginated list based on broad criteria.
  // We can reuse the searchStudentsForBilling service method with appropriate filters.
  const filters: StudentSearchFiltersType = {
    institution_id: institutionId,
    department_id: departmentId,
    semester_id: semesterId,
    limit: 500, // Fetch a larger set for bulk selection, adjust as needed
    page: 1
  };

  return useQuery<StudentForBillingListResponse, Error>({
    queryKey: studentSearchKeys.forBulkOperations(
      institutionId,
      departmentId,
      semesterId
    ),
    queryFn: () => StudentSearchService.searchStudentsForBilling(filters),
    enabled: !!institutionId, // Fetch only if institutionId is present
    staleTime: 5 * 60 * 1000
  });
}
