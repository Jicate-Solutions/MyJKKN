'use client';

// hooks/grievance/use-grievance-dashboard.ts
// F004: Grievance Ticketing System - Dashboard & Reporting Hooks

import { useQuery } from '@tanstack/react-query';
import { GrievanceService } from '@/lib/services/grievance/grievance-service';
import type { GrievanceHistory } from '@/types/grievance';

// Query keys
export const grievanceDashboardKeys = {
  all: ['grievance-dashboard'] as const,
  stats: (institutionId: string) => [...grievanceDashboardKeys.all, 'stats', institutionId] as const,
  slaReport: (institutionId: string, dateFrom?: string, dateTo?: string) =>
    [...grievanceDashboardKeys.all, 'sla-report', institutionId, dateFrom, dateTo] as const,
  history: (ticketId: string) => [...grievanceDashboardKeys.all, 'history', ticketId] as const
};

/**
 * Hook to fetch dashboard stats
 */
export function useGrievanceDashboardStats(institutionId: string) {
  return useQuery({
    queryKey: grievanceDashboardKeys.stats(institutionId),
    queryFn: () => GrievanceService.getDashboardStats(institutionId),
    enabled: !!institutionId,
    staleTime: 60 * 1000, // 1 minute
    refetchInterval: 60 * 1000 // Auto-refresh every minute
  });
}

/**
 * Hook to fetch SLA compliance report
 */
export function useGrievanceSLAReport(
  institutionId: string,
  dateFrom?: string,
  dateTo?: string
) {
  return useQuery({
    queryKey: grievanceDashboardKeys.slaReport(institutionId, dateFrom, dateTo),
    queryFn: () => GrievanceService.getSLAReport(institutionId, dateFrom, dateTo),
    enabled: !!institutionId,
    staleTime: 5 * 60 * 1000 // 5 minutes
  });
}

/**
 * Hook to fetch ticket history
 */
export function useGrievanceHistory(ticketId: string) {
  return useQuery({
    queryKey: grievanceDashboardKeys.history(ticketId),
    queryFn: () => GrievanceService.getHistory(ticketId),
    enabled: !!ticketId,
    staleTime: 30 * 1000
  });
}
