import { useQuery } from '@tanstack/react-query';
import { StudentSearchService } from '@/lib/services/billing/schedule/student-search-service';
import type {
  StudentForBilling,
  StudentSearchFilters,
  StudentBillingSummary
} from '@/types/billing-schedule';

// Query Keys
export const studentSearchKeys = {
  all: ['student-search'] as const,
  lists: () => [...studentSearchKeys.all, 'list'] as const,
  list: (filters: StudentSearchFilters) =>
    [...studentSearchKeys.lists(), filters] as const,
  details: () => [...studentSearchKeys.all, 'detail'] as const,
  detail: (id: string) => [...studentSearchKeys.details(), id] as const,
  summary: (id: string) => [...studentSearchKeys.all, 'summary', id] as const,
  byInstitution: (institutionId: string, limit?: number) =>
    [...studentSearchKeys.all, 'by-institution', institutionId, limit] as const,
  withOutstanding: (institutionId?: string, limit?: number) =>
    [
      ...studentSearchKeys.all,
      'with-outstanding',
      institutionId,
      limit
    ] as const,
  search: (query: string, institutionId?: string, limit?: number) =>
    [...studentSearchKeys.all, 'search', query, institutionId, limit] as const
};

// Hook to search students for billing with filters
export function useStudentsForBilling(filters: StudentSearchFilters = {}) {
  return useQuery({
    queryKey: studentSearchKeys.list(filters),
    queryFn: () => StudentSearchService.searchStudentsForBilling(filters),
    staleTime: 5 * 60 * 1000 // 5 minutes
  });
}

// Hook to get a single student for billing
export function useStudentForBilling(studentId: string) {
  return useQuery({
    queryKey: studentSearchKeys.detail(studentId),
    queryFn: () => StudentSearchService.getStudentForBilling(studentId),
    enabled: !!studentId,
    staleTime: 5 * 60 * 1000
  });
}

// Hook to get student billing summary
export function useStudentBillingSummary(studentId: string) {
  return useQuery({
    queryKey: studentSearchKeys.summary(studentId),
    queryFn: () => StudentSearchService.getStudentBillingSummary(studentId),
    enabled: !!studentId,
    staleTime: 2 * 60 * 1000 // 2 minutes for more frequent updates
  });
}

// Hook to get students by institution
export function useStudentsByInstitution(
  institutionId: string,
  limit: number = 50
) {
  return useQuery({
    queryKey: studentSearchKeys.byInstitution(institutionId, limit),
    queryFn: () =>
      StudentSearchService.getStudentsByInstitution(institutionId, limit),
    enabled: !!institutionId,
    staleTime: 10 * 60 * 1000 // 10 minutes
  });
}

// Hook to get students with outstanding bills
export function useStudentsWithOutstandingBills(
  institutionId?: string,
  limit: number = 50
) {
  return useQuery({
    queryKey: studentSearchKeys.withOutstanding(institutionId, limit),
    queryFn: () =>
      StudentSearchService.getStudentsWithOutstandingBills(
        institutionId,
        limit
      ),
    staleTime: 5 * 60 * 1000
  });
}

// Hook to search students by query
export function useSearchStudentsByQuery(
  searchQuery: string,
  institutionId?: string,
  limit: number = 20
) {
  return useQuery({
    queryKey: studentSearchKeys.search(searchQuery, institutionId, limit),
    queryFn: () =>
      StudentSearchService.searchStudentsByQuery(
        searchQuery,
        institutionId,
        limit
      ),
    enabled: !!searchQuery && searchQuery.length >= 2, // Only search if query is at least 2 characters
    staleTime: 2 * 60 * 1000
  });
}

// Hook for real-time student search with debouncing
export function useStudentSearchWithDebounce(
  searchQuery: string,
  institutionId?: string,
  enabled: boolean = true
) {
  return useQuery({
    queryKey: studentSearchKeys.search(searchQuery, institutionId, 20),
    queryFn: () =>
      StudentSearchService.searchStudentsByQuery(
        searchQuery,
        institutionId,
        20
      ),
    enabled: enabled && !!searchQuery && searchQuery.length >= 2,
    staleTime: 30 * 1000, // 30 seconds for search results
    gcTime: 5 * 60 * 1000 // Keep in cache for 5 minutes
  });
}

// Hook to get students for bulk operations
export function useStudentsForBulkOperations(
  institutionId?: string,
  departmentId?: string,
  semesterId?: string
) {
  const filters: StudentSearchFilters = {
    institution_id: institutionId,
    department_id: departmentId,
    semester_id: semesterId,
    limit: 100 // Higher limit for bulk operations
  };

  return useQuery({
    queryKey: studentSearchKeys.list(filters),
    queryFn: () => StudentSearchService.searchStudentsForBilling(filters),
    enabled: !!institutionId, // At least institution should be selected
    staleTime: 10 * 60 * 1000
  });
}

// Hook to get student quick info for autocomplete
export function useStudentQuickSearch(
  searchQuery: string,
  institutionId?: string
) {
  return useQuery({
    queryKey: [
      ...studentSearchKeys.all,
      'quick-search',
      searchQuery,
      institutionId
    ],
    queryFn: async () => {
      if (!searchQuery || searchQuery.length < 2) return [];

      const students = await StudentSearchService.searchStudentsByQuery(
        searchQuery,
        institutionId,
        10 // Limit to 10 for quick search
      );

      // Return simplified data for autocomplete
      return students.map((student) => ({
        id: student.id,
        label: `${student.student_name} (${student.roll_number})`,
        value: student.id,
        student_name: student.student_name,
        roll_number: student.roll_number,
        outstanding_amount: student.outstanding_amount,
        department: student.department?.department_name,
        program: student.program?.program_name
      }));
    },
    enabled: !!searchQuery && searchQuery.length >= 2,
    staleTime: 30 * 1000
  });
}

// Hook to get students with filters for dropdown selection
export function useStudentsForSelection(
  institutionId?: string,
  departmentId?: string,
  limit: number = 50
) {
  const filters: StudentSearchFilters = {
    institution_id: institutionId,
    department_id: departmentId,
    limit
  };

  return useQuery({
    queryKey: [...studentSearchKeys.all, 'for-selection', filters],
    queryFn: async () => {
      const result = await StudentSearchService.searchStudentsForBilling(
        filters
      );

      // Return simplified data for selection
      return result.data.map((student) => ({
        id: student.id,
        label: `${student.student_name} (${student.roll_number})`,
        value: student.id,
        student_name: student.student_name,
        roll_number: student.roll_number,
        outstanding_amount: student.outstanding_amount,
        department: student.department?.department_name,
        program: student.program?.program_name
      }));
    },
    enabled: !!institutionId,
    staleTime: 10 * 60 * 1000
  });
}

// Hook to get student count by filters
export function useStudentCountForBilling(filters: StudentSearchFilters = {}) {
  return useQuery({
    queryKey: [...studentSearchKeys.all, 'count', filters],
    queryFn: async () => {
      const result = await StudentSearchService.searchStudentsForBilling({
        ...filters,
        limit: 1 // We only need the count
      });
      return result.metadata.total;
    },
    staleTime: 5 * 60 * 1000
  });
}
