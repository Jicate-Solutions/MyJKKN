'use client';

import { useQuery } from '@tanstack/react-query';
import { JkknProgramsService } from '@/lib/services/jkkn-api/programs-service';
import type { JkknProgramFilters } from '@/types/jkkn-api/programs';

export function useJkknPrograms(filters: JkknProgramFilters = {}) {
  return useQuery({
    queryKey: ['jkkn-programs', filters],
    queryFn: () => JkknProgramsService.getPrograms(filters),
    placeholderData: (prev) => prev,
    staleTime: 1000 * 60,
    retry: 2,
  });
}
