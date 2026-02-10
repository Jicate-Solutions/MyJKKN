// hooks/facilitator/use-facilitator-impact.ts
// ============================================================================
// React Query hook for the Facilitator Impact Dashboard
// ============================================================================

import { useQuery, UseQueryResult } from '@tanstack/react-query';
import {
  FacilitatorImpactDashboardData,
  FacilitatorImpactFilters
} from '@/types/facilitator-impact';
import { FacilitatorImpactService } from '@/lib/services/facilitator/facilitator-impact-service';

export const facilitatorImpactKeys = {
  all: ['facilitator-impact'] as const,
  dashboard: (filters?: FacilitatorImpactFilters) =>
    [...facilitatorImpactKeys.all, 'dashboard', filters] as const
};

export function useFacilitatorImpactDashboard(
  filters?: FacilitatorImpactFilters
): UseQueryResult<FacilitatorImpactDashboardData, Error> {
  return useQuery({
    queryKey: facilitatorImpactKeys.dashboard(filters),
    queryFn: () => FacilitatorImpactService.getDashboardData(filters),
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false
  });
}
