import { useQuery } from '@tanstack/react-query';
import { Semester, SemesterFilters } from '@/types/organizations';
import { SemesterService } from '@/lib/services/organization/semester-service';

export function useSemesters(filters: SemesterFilters) {
  return useQuery({
    queryKey: ['semesters', filters],
    queryFn: async () => {
      const { data, metadata } = await SemesterService.getSemesters(filters);
      return { data, metadata };
    },
    placeholderData: (previousData) => previousData,
    retry: false
  });
}
