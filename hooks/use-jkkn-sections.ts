'use client';

import { useQuery } from '@tanstack/react-query';
import { JkknSectionsService } from '@/lib/services/jkkn-api/sections-service';
import type { JkknSectionFilters } from '@/types/jkkn-api/sections';

export function useJkknSections(filters: JkknSectionFilters = {}) {
  return useQuery({
    queryKey: ['jkkn-sections', filters],
    queryFn: () => JkknSectionsService.getSections(filters),
    placeholderData: (prev) => prev,
    staleTime: 1000 * 60,
    retry: 2,
  });
}
