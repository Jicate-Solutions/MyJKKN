// hooks/solutions/use-ai-solution-compliance-dashboard.ts
// ============================================================================
// React Query hook for the AI-Solution Compliance Dashboard (renamed in PR-A1
// to disambiguate from accreditation compliance work under /accreditation/*)
// ============================================================================

import { useQuery, UseQueryResult } from '@tanstack/react-query';
import type {
  ComplianceDashboardData,
  ComplianceFilters
} from '@/types/ai-solution-compliance';
import { apiClient } from '@/lib/api/client';

export const aiSolutionComplianceKeys = {
  all: ['ai-solution-compliance'] as const,
  dashboard: (filters?: ComplianceFilters) =>
    [...aiSolutionComplianceKeys.all, 'dashboard', filters] as const
};

export function useAiSolutionComplianceDashboard(
  filters?: ComplianceFilters
): UseQueryResult<ComplianceDashboardData, Error> {
  return useQuery({
    queryKey: aiSolutionComplianceKeys.dashboard(filters),
    queryFn: () => apiClient.get<ComplianceDashboardData>('/api/solutions/ai-solution-compliance/dashboard', { params: filters as Record<string, any> }),
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false
  });
}
