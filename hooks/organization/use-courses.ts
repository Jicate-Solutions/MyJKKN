import { Course, CourseFilters } from '@/types/organizations';
import { CourseService } from '@/lib/services/organization/course-service';
import { useQuery } from '@tanstack/react-query';

export function useCourses(filters: CourseFilters) {
  return useQuery({
    queryKey: ['courses', filters],
    queryFn: async () => {
      const { data, metadata } = await CourseService.getCourses(filters);
      return { data, metadata };
    },
    placeholderData: (previousData) => previousData,
    retry: false
  });
}
