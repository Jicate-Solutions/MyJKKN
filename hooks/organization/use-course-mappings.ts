import { useQuery } from '@tanstack/react-query';
import { CourseMappingService } from '@/lib/services/organization/course-mapping-service';
import type { CourseMappingFilters } from '@/types/organizations';
import { useMemo } from 'react';

export function useCourseMappings(filters: CourseMappingFilters) {
  const memoizedFilters = useMemo(() => filters, [filters]);

  return useQuery({
    queryKey: ['course-mappings', memoizedFilters],
    queryFn: async () => {
      const { data, metadata } =
        await CourseMappingService.getCourseMappings(memoizedFilters);
      return { data, metadata };
    },
    placeholderData: (previousData) => previousData,
    retry: false
  });
}
