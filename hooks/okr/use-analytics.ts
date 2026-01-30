// ============================================================================
// OKR Analytics Hooks
// React Query hooks for Dashboard Charts and Analytics
// ============================================================================

import { useQuery } from '@tanstack/react-query';
import { OKRAnalyticsService } from '@/lib/services/okr';
import { useAuth } from '../use-auth';
import type {
  OKRTrendDataPoint,
  OKRDepartmentComparison,
  OKRProjection,
  OKRAnalyticsSummary
} from '@/types/okr';

/**
 * Hook to fetch analytics summary
 */
export function useOKRAnalyticsSummary(
  institutionId: string | undefined,
  departmentId?: string
) {
  const { profile, isLoading: authLoading } = useAuth();

  return useQuery({
    queryKey: ['okr-analytics-summary', institutionId, departmentId],
    queryFn: () => OKRAnalyticsService.getAnalyticsSummary(institutionId!, departmentId),
    enabled: !authLoading && !!profile && !!institutionId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchInterval: 5 * 60 * 1000, // Refresh every 5 minutes
  });
}

/**
 * Hook to fetch progress trend data for charts
 */
export function useOKRProgressTrend(
  institutionId: string | undefined,
  departmentId?: string,
  weeks: number = 12
) {
  const { profile, isLoading: authLoading } = useAuth();

  return useQuery({
    queryKey: ['okr-progress-trend', institutionId, departmentId, weeks],
    queryFn: () => OKRAnalyticsService.getProgressTrend(institutionId!, departmentId, weeks),
    enabled: !authLoading && !!profile && !!institutionId,
    staleTime: 10 * 60 * 1000, // 10 minutes
  });
}

/**
 * Hook to fetch department comparison data for charts
 */
export function useOKRDepartmentComparison(institutionId: string | undefined) {
  const { profile, isLoading: authLoading } = useAuth();

  return useQuery({
    queryKey: ['okr-department-comparison', institutionId],
    queryFn: () => OKRAnalyticsService.getDepartmentComparison(institutionId!),
    enabled: !authLoading && !!profile && !!institutionId,
    staleTime: 10 * 60 * 1000, // 10 minutes
  });
}

/**
 * Hook to fetch projections data
 */
export function useOKRProjections(
  institutionId: string | undefined,
  departmentId?: string
) {
  const { profile, isLoading: authLoading } = useAuth();

  return useQuery({
    queryKey: ['okr-projections', institutionId, departmentId],
    queryFn: () => OKRAnalyticsService.getProjections(institutionId!, departmentId),
    enabled: !authLoading && !!profile && !!institutionId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Hook to fetch role-based dashboard data
 * Returns different data based on user role (executive, hod, admin)
 */
export function useOKRRoleDashboard(
  role: 'executive' | 'hod' | 'admin' | undefined,
  institutionId: string | undefined,
  departmentId?: string
) {
  const { profile, isLoading: authLoading } = useAuth();

  return useQuery({
    queryKey: ['okr-role-dashboard', role, institutionId, departmentId],
    queryFn: () =>
      OKRAnalyticsService.getRoleDashboardData(role!, institutionId!, departmentId),
    enabled: !authLoading && !!profile && !!role && !!institutionId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchInterval: 5 * 60 * 1000, // Refresh every 5 minutes
  });
}

/**
 * Utility hook to determine user's dashboard role
 */
export function useOKRDashboardRole(userRole: string | undefined): 'executive' | 'hod' | 'admin' | undefined {
  if (!userRole) return undefined;

  // Map user roles to dashboard roles
  const roleMapping: Record<string, 'executive' | 'hod' | 'admin'> = {
    'super_admin': 'admin',
    'administrator': 'admin',
    'principal': 'executive',
    'dean': 'executive',
    'hod': 'hod',
    'department_head': 'hod',
    'faculty': 'hod', // Faculty sees department-level data
    'staff': 'hod',
  };

  return roleMapping[userRole] || 'hod';
}
