'use client';

import { useQuery } from '@tanstack/react-query';
import { JkknInstitutionsService } from '@/lib/services/jkkn-api/institutions-service';
import type { JkknInstitutionFilters } from '@/types/jkkn-api/institutions';

export function useJkknInstitutions(filters: JkknInstitutionFilters = {}) {
  return useQuery({
    // Include all filter params in the key so React Query re-fetches on any change
    queryKey: ['jkkn-institutions', filters],
    queryFn: () => JkknInstitutionsService.getInstitutions(filters),
    // Keep previous page data visible while the next page loads (no layout flash)
    placeholderData: (prev) => prev,
    staleTime: 1000 * 60, // 1 minute — matches the server-side revalidate window
    retry: 2,
  });
}
