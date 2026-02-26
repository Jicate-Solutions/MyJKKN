'use client';

import { useQuery } from '@tanstack/react-query';
import { JkknDepartmentsService } from '@/lib/services/jkkn-api/departments-service';
import type { JkknDepartmentFilters } from '@/types/jkkn-api/departments';

export function useJkknDepartments(filters: JkknDepartmentFilters = {}) {
  return useQuery({
    queryKey: ['jkkn-departments', filters],
    queryFn: () => JkknDepartmentsService.getDepartments(filters),
    // Keep the previous page visible while the next one loads — no layout flash
    placeholderData: (prev) => prev,
    staleTime: 1000 * 60, // 1 minute — matches the route handler revalidate window
    retry: 2,
  });
}
