// hooks/solutions/use-compliance-dashboard.ts
// ============================================================================
// React Query hook for the AI-Solution Compliance Dashboard
// ============================================================================

import { useQuery, UseQueryResult } from '@tanstack/react-query';
import type {
  ComplianceDashboardData,
  ComplianceFilters
} from '@/types/compliance';
import { ComplianceService } from '@/lib/services/solutions/compliance-service';

export const complianceKeys = {
  all: ['compliance'] as const,
  dashboard: (filters?: ComplianceFilters) =>
    [...complianceKeys.all, 'dashboard', filters] as const
};

export function useComplianceDashboard(
  filters?: ComplianceFilters
): UseQueryResult<ComplianceDashboardData, Error> {
  return useQuery({
    queryKey: complianceKeys.dashboard(filters),
    queryFn: () => ComplianceService.getDashboardData(filters),
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false
  });
}
