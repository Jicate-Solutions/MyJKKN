'use client';

import { useQuery } from '@tanstack/react-query';
import { JkknDegreesService } from '@/lib/services/jkkn-api/degrees-service';
import type { JkknDegreeFilters } from '@/types/jkkn-api/degrees';

export function useJkknDegrees(filters: JkknDegreeFilters = {}) {
  return useQuery({
    queryKey: ['jkkn-degrees', filters],
    queryFn: () => JkknDegreesService.getDegrees(filters),
    placeholderData: (prev) => prev,
    staleTime: 1000 * 60,
    retry: 2,
  });
}
