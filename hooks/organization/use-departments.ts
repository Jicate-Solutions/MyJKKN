// hooks/use-departments.ts

import { useQuery } from '@tanstack/react-query';
import { Department, DepartmentFilters } from '@/types/organizations';
import { DepartmentService } from '@/lib/services/organization/department-service';
import { QUERY_CONFIG } from '@/lib/config/query-config';

export function useDepartments(filters: DepartmentFilters, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['departments', filters],
    enabled: options?.enabled ?? true,
    queryFn: async () => {
      const { data, metadata } = await DepartmentService.getDepartments(
        filters
      );
      return { data, metadata };
    },
    placeholderData: (previousData) => previousData,
    ...QUERY_CONFIG.STABLE_DATA // Departments rarely change - use stable caching
  });
}
