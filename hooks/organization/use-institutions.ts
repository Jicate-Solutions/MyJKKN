// hooks/use-institutions.ts

import { useQuery } from '@tanstack/react-query';
import { Institution, InstitutionFilters } from '@/types/organizations';
import { OrganizationService } from '@/lib/services/organization/organization-service';

export function useInstitutions(filters: InstitutionFilters) {
  return useQuery({
    queryKey: ['institutions', filters],
    queryFn: async () => {
      const { data, metadata } = await OrganizationService.getInstitutions(
        filters
      );
      return { data, metadata };
    },
    placeholderData: (previousData) => previousData,
    retry: false
  });
}
