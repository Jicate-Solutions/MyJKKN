import { useQuery, UseQueryResult } from '@tanstack/react-query';
import type { StudentEngagementDetail } from '@/types/analytics';

interface UseStudentEngagementParams {
  studentId: string;
  enabled?: boolean;
}

interface StudentEngagementResponse {
  success: boolean;
  data: StudentEngagementDetail;
}

/**
 * Hook to fetch detailed engagement information for a specific student
 *
 * @example
 * const { data, isLoading, error } = useStudentEngagement({
 *   studentId: 'user-uuid'
 * });
 */
export function useStudentEngagement({
  studentId,
  enabled = true
}: UseStudentEngagementParams): UseQueryResult<
  StudentEngagementDetail,
  Error
> {
  return useQuery({
    queryKey: ['student-engagement', studentId],
    queryFn: async () => {
      const response = await fetch(
        `/api/analytics/engagement/student/${studentId}`
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(
          error.error || 'Failed to fetch student engagement details'
        );
      }

      const result: StudentEngagementResponse = await response.json();
      return result.data;
    },
    enabled: enabled && !!studentId,
    staleTime: 10 * 60 * 1000, // 10 minutes
    refetchOnWindowFocus: false // Don't refetch on window focus for detailed view
  });
}
