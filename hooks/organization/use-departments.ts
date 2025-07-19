// hooks/use-departments.ts

import { useQuery } from '@tanstack/react-query';
import { Department, DepartmentFilters } from '@/types/organizations';
import { DepartmentService } from '@/lib/services/organization/department-service';

export function useDepartments(filters: DepartmentFilters) {
  return useQuery({
    queryKey: ['departments', filters],
    queryFn: async () => {
      const { data, metadata } = await DepartmentService.getDepartments(
        filters
      );
      return { data, metadata };
    },
    placeholderData: (previousData) => previousData,
    retry: false
  });
}
