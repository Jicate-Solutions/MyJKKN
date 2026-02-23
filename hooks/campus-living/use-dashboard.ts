'use client'

import { useQuery } from '@tanstack/react-query'
import { DashboardService } from '@/lib/services/campus-living/dashboard-service'

// Query key factory
export const dashboardKeys = {
  all: ['campus-living-dashboard'] as const,
  summary: (institutionId?: string) => [...dashboardKeys.all, 'summary', institutionId] as const,
  blockOccupancy: (institutionId?: string) => [...dashboardKeys.all, 'block-occupancy', institutionId] as const,
  attendanceTrend: (institutionId?: string, days?: number) => [...dashboardKeys.all, 'attendance-trend', institutionId, days] as const,
  maintenanceByCategory: (institutionId?: string) => [...dashboardKeys.all, 'maintenance-category', institutionId] as const,
}

// --- Query hooks ---

export function useManagementSummary(institutionId?: string) {
  return useQuery({
    queryKey: dashboardKeys.summary(institutionId),
    queryFn: () => DashboardService.getManagementSummary(institutionId),
  })
}

export function useBlockOccupancy(institutionId?: string) {
  return useQuery({
    queryKey: dashboardKeys.blockOccupancy(institutionId),
    queryFn: () => DashboardService.getBlockOccupancy(institutionId),
  })
}

export function useAttendanceTrend(institutionId?: string, days?: number) {
  return useQuery({
    queryKey: dashboardKeys.attendanceTrend(institutionId, days),
    queryFn: () => DashboardService.getAttendanceTrend(institutionId, days),
  })
}

export function useMaintenanceByCategory(institutionId?: string) {
  return useQuery({
    queryKey: dashboardKeys.maintenanceByCategory(institutionId),
    queryFn: () => DashboardService.getMaintenanceByCategory(institutionId),
  })
}
