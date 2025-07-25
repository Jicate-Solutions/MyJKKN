// hooks/use-institutions.ts

import { useQuery } from '@tanstack/react-query';
import { Institution, InstitutionFilters } from '@/types/organizations';
import { OrganizationService } from '@/lib/services/organization/organization-service';

// Query key factory for better cache management
export const institutionKeys = {
  all: ['institutions'] as const,
  lists: () => [...institutionKeys.all, 'list'] as const,
  list: (filters: InstitutionFilters) =>
    [...institutionKeys.lists(), filters] as const,
  details: () => [...institutionKeys.all, 'detail'] as const,
  detail: (id: string) => [...institutionKeys.details(), id] as const,
  names: () => [...institutionKeys.all, 'names'] as const,
  stats: () => [...institutionKeys.all, 'stats'] as const
} as const;

export function useInstitutions(filters: InstitutionFilters) {
  return useQuery({
    queryKey: institutionKeys.list(filters),
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

export function useInstitutionNames(isActive?: boolean, userId?: string) {
  return useQuery({
    queryKey: institutionKeys.names(),
    queryFn: () => OrganizationService.getInstitutionNames(isActive, userId),
    retry: false,
    staleTime: 5 * 60 * 1000 // Consider fresh for 5 minutes
  });
}
