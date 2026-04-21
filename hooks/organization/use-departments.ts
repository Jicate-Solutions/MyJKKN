// hooks/use-departments.ts

import { useQuery } from '@tanstack/react-query';
import { Department, DepartmentFilters } from '@/types/organizations';
import { DepartmentService } from '@/lib/services/organization/department-service';
import { QUERY_CONFIG } from '@/lib/config/query-config';

export function useDepartments(filters: DepartmentFilters) {
  return useQuery({
    queryKey: ['departments', filters],
    queryFn: async () => {
      const { data, metadata } = await DepartmentService.getDepartments(
        filters
      );
      return { data, metadata };
    },
    // Previously gated on `!!filters.institution_id`, which silently disabled
    // the query for super-admins and any caller that intentionally passes no
    // institution filter (e.g. staff-template bulk fetch, /ims/indents/new when
    // the active IMS store has no institution_id). DepartmentService already
    // treats a missing institution_id as "fetch all", so the gate only hid bugs.
    placeholderData: (previousData) => previousData,
    ...QUERY_CONFIG.STABLE_DATA // Departments rarely change - use stable caching
  });
}
