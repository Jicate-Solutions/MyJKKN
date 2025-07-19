// hooks/use-degrees.ts

import { useQuery } from '@tanstack/react-query';
import { Degree, DegreeFilters } from '@/types/organizations';
import { DegreeService } from '@/lib/services/organization/degree-service';

export function useDegrees(filters: DegreeFilters) {
  return useQuery({
    queryKey: ['degrees', filters],
    queryFn: async () => {
      const { data, metadata } = await DegreeService.getDegrees(filters);
      return { data, metadata };
    },
    placeholderData: (previousData) => previousData,
    retry: false
  });
}
