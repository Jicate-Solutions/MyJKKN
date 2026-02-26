'use client';

import { useQuery } from '@tanstack/react-query';
import { JkknSemestersService } from '@/lib/services/jkkn-api/semesters-service';
import type { JkknSemesterFilters } from '@/types/jkkn-api/semesters';

export function useJkknSemesters(filters: JkknSemesterFilters = {}) {
  return useQuery({
    queryKey: ['jkkn-semesters', filters],
    queryFn: () => JkknSemestersService.getSemesters(filters),
    placeholderData: (prev) => prev,
    staleTime: 1000 * 60,
    retry: 2,
  });
}
