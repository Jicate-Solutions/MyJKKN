import { useQuery, UseQueryResult } from '@tanstack/react-query';
import {
  SystemOverview,
  RecentActivity,
  AtRiskStudent,
  AdminDashboardService
} from '@/lib/services/dashboard/admin-dashboard-service';

export function useSystemOverview(): UseQueryResult<SystemOverview, Error> {
  return useQuery({
    queryKey: ['admin-system-overview'],
    queryFn: () => AdminDashboardService.getSystemOverview(),
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: true,
  });
}

export function useRecentActivity(limit: number = 10): UseQueryResult<RecentActivity[], Error> {
  return useQuery({
    queryKey: ['admin-recent-activity', limit],
    queryFn: () => AdminDashboardService.getRecentActivity(limit),
    staleTime: 1 * 60 * 1000, // 1 minute
    refetchInterval: 30 * 1000, // Auto-refresh every 30 seconds
  });
}

export function useAtRiskStudents(limit: number = 10): UseQueryResult<AtRiskStudent[], Error> {
  return useQuery({
    queryKey: ['admin-at-risk-students', limit],
    queryFn: () => AdminDashboardService.getAtRiskStudents(limit),
    staleTime: 10 * 60 * 1000, // 10 minutes
  });
}
