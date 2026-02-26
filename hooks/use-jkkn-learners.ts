'use client';

import { useQuery } from '@tanstack/react-query';
import { JkknLearnersService } from '@/lib/services/jkkn-api/learners-service';
import type { JkknLearnerFilters } from '@/types/jkkn-api/learners';

export function useJkknLearners(filters: JkknLearnerFilters = {}) {
  return useQuery({
    // Include all filter params in the key so React Query re-fetches on any change
    queryKey: ['jkkn-learners', filters],
    queryFn: () => JkknLearnersService.getLearners(filters),
    // Keep previous page data visible while the next page loads (no layout flash)
    placeholderData: (prev) => prev,
    staleTime: 1000 * 60, // 1 minute — matches the server-side revalidate window
    retry: 2,
  });
}
