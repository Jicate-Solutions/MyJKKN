'use client';

import { useQuery } from '@tanstack/react-query';
import { MaturityAssessmentService } from '@/lib/services/maturity-assessment/maturity-assessment-service';
import type { MaturityDashboardData, RadarChartData, DepartmentComparisonData } from '@/types/maturity-assessment';

// Query keys
export const maturityDashboardKeys = {
  all: ['maturity-dashboard'] as const,
  byInstitution: (institutionId: string) =>
    [...maturityDashboardKeys.all, institutionId] as const,
  radar: (assessmentId: string) =>
    [...maturityDashboardKeys.all, 'radar', assessmentId] as const,
  comparison: (institutionId: string) =>
    [...maturityDashboardKeys.all, 'comparison', institutionId] as const
};

/**
 * Hook for fetching dashboard data
 */
export function useMaturityDashboard(institutionId: string | undefined) {
  return useQuery({
    queryKey: maturityDashboardKeys.byInstitution(institutionId || ''),
    queryFn: () => MaturityAssessmentService.getDashboard(institutionId!),
    enabled: !!institutionId,
    staleTime: 2 * 60 * 1000 // 2 minutes
  });
}

/**
 * Hook for fetching radar chart data for an assessment
 */
export function useMaturityRadarChart(assessmentId: string | undefined) {
  return useQuery({
    queryKey: maturityDashboardKeys.radar(assessmentId || ''),
    queryFn: () => MaturityAssessmentService.getRadarChartData(assessmentId!),
    enabled: !!assessmentId,
    staleTime: 5 * 60 * 1000 // 5 minutes
  });
}

/**
 * Hook for fetching department comparison data
 */
export function useDepartmentComparison(institutionId: string | undefined) {
  return useQuery({
    queryKey: maturityDashboardKeys.comparison(institutionId || ''),
    queryFn: () => MaturityAssessmentService.getDepartmentComparison(institutionId!),
    enabled: !!institutionId,
    staleTime: 2 * 60 * 1000
  });
}
