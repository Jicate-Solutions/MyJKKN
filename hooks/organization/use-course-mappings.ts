import { useQuery } from '@tanstack/react-query';
import { CourseMappingService } from '@/lib/services/organization/course-mapping-service';
import type { CourseMappingFilters } from '@/types/organizations';

export function useCourseMappings(filters: CourseMappingFilters) {
  return useQuery({
    queryKey: ['course-mappings', filters],
    queryFn: async () => {
      const { data, metadata } = await CourseMappingService.getCourseMappings(
        filters
      );
      return { data, metadata };
    },
    placeholderData: (previousData) => previousData,
    retry: false,
    select: (data) => {
      if (!filters.search) {
        return data;
      }
      const filteredData = data.data.filter((mapping) => {
        const searchValue = filters.search!.toLowerCase();
        const courseCode = (mapping.course?.course_code || '').toLowerCase();
        const courseName = (mapping.course?.course_name || '').toLowerCase();
        return (
          courseCode.includes(searchValue) || courseName.includes(searchValue)
        );
      });
      return { ...data, data: filteredData };
    }
  });
}
