'use client';

import { useQuery } from '@tanstack/react-query';
import { ImsDepartmentService } from '@/lib/services/ims/department-service';

/**
 * Departments for IMS dropdowns, sourced from the local Supabase `departments`
 * table (not the JKKN proxy). Pass an institution id to scope the list; pass
 * null/undefined to load every active department the caller can read.
 */
export function useImsDepartmentsForSelect(
  institutionId?: string | null
) {
  return useQuery({
    queryKey: ['ims-departments-select', institutionId ?? ''],
    queryFn: () =>
      ImsDepartmentService.getDepartmentsForSelect(institutionId),
    staleTime: 10 * 60 * 1000,
  });
}
