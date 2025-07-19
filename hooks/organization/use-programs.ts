// hooks/use-programs.ts
import { useQuery } from '@tanstack/react-query';
import { Program, ProgramFilters } from '@/types/organizations';
import { ProgramService } from '@/lib/services/organization/program-service';

export function usePrograms(filters: ProgramFilters) {
  return useQuery({
    queryKey: ['programs', filters],
    queryFn: async () => {
      const { data, metadata } = await ProgramService.getPrograms(filters);
      return { data, metadata };
    },
    placeholderData: (previousData) => previousData,
    retry: false
  });
}
