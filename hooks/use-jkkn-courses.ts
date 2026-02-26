'use client';

import { useQuery } from '@tanstack/react-query';
import { JkknCoursesService } from '@/lib/services/jkkn-api/courses-service';
import type { JkknCourseFilters } from '@/types/jkkn-api/courses';

export function useJkknCourses(filters: JkknCourseFilters = {}) {
  return useQuery({
    queryKey: ['jkkn-courses', filters],
    queryFn: () => JkknCoursesService.getCourses(filters),
    placeholderData: (prev) => prev,
    staleTime: 1000 * 60,
    retry: 2,
  });
}
