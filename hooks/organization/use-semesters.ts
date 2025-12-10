import { useQuery } from '@tanstack/react-query';
import { Semester, SemesterFilters } from '@/types/organizations';
import { SemesterService } from '@/lib/services/organization/semester-service';
import { QUERY_CONFIG } from '@/lib/config/query-config';

export function useSemesters(filters: SemesterFilters) {
  return useQuery({
    queryKey: ['semesters', filters],
    queryFn: async () => {
      const { data, metadata } = await SemesterService.getSemesters(filters);
      return { data, metadata };
    },
    placeholderData: (previousData) => previousData,
    ...QUERY_CONFIG.STABLE_DATA // Semesters rarely change - use stable caching
  });
}
