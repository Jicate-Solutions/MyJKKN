'use client';

import { useQuery } from '@tanstack/react-query';
import { CampusLivingAnalytics } from '@/lib/services/campus-living/campus-living-analytics';

// Query key factory
export const campusLivingAnalyticsKeys = {
  all: ['campus-living-analytics'] as const,
  occupancy: (filters: Record<string, unknown>) => ['campus-living-analytics', 'occupancy', filters] as const,
  attendance: (filters: Record<string, unknown>) => ['campus-living-analytics', 'attendance', filters] as const,
  maintenance: (filters: Record<string, unknown>) => ['campus-living-analytics', 'maintenance', filters] as const,
  mess: (filters: Record<string, unknown>) => ['campus-living-analytics', 'mess', filters] as const,
  incidents: (filters: Record<string, unknown>) => ['campus-living-analytics', 'incidents', filters] as const,
  trends: (filters: Record<string, unknown>) => ['campus-living-analytics', 'trends', filters] as const,
};

// --- Query hooks ---

export function useOccupancyAnalytics(institutionId: string) {
  return useQuery({
    queryKey: campusLivingAnalyticsKeys.occupancy({ institutionId }),
    queryFn: () => CampusLivingAnalytics.getOccupancyAnalytics(institutionId),
    enabled: !!institutionId,
  });
}

export function useAttendanceTrend(institutionId: string, dateFrom: string, dateTo: string, blockId?: string) {
  return useQuery({
    queryKey: campusLivingAnalyticsKeys.attendance({ institutionId, dateFrom, dateTo, blockId }),
    queryFn: () => CampusLivingAnalytics.getAttendanceTrend(institutionId, dateFrom, dateTo, blockId),
    enabled: !!institutionId && !!dateFrom && !!dateTo,
  });
}

export function useMaintenanceAnalytics(institutionId: string, dateFrom?: string, dateTo?: string) {
  return useQuery({
    queryKey: campusLivingAnalyticsKeys.maintenance({ institutionId, dateFrom, dateTo }),
    queryFn: () => CampusLivingAnalytics.getMaintenanceAnalytics(institutionId, dateFrom, dateTo),
    enabled: !!institutionId,
  });
}

export function useMessAnalytics(institutionId: string, dateFrom: string, dateTo: string) {
  return useQuery({
    queryKey: campusLivingAnalyticsKeys.mess({ institutionId, dateFrom, dateTo }),
    queryFn: () => CampusLivingAnalytics.getMessAnalytics(institutionId, dateFrom, dateTo),
    enabled: !!institutionId && !!dateFrom && !!dateTo,
  });
}

export function useIncidentAnalytics(institutionId: string, dateFrom?: string, dateTo?: string) {
  return useQuery({
    queryKey: campusLivingAnalyticsKeys.incidents({ institutionId, dateFrom, dateTo }),
    queryFn: () => CampusLivingAnalytics.getIncidentAnalytics(institutionId, dateFrom, dateTo),
    enabled: !!institutionId,
  });
}

export function useRiskAlerts(institutionId: string) {
  return useQuery({
    queryKey: campusLivingAnalyticsKeys.trends({ institutionId }),
    queryFn: () => CampusLivingAnalytics.generateRiskAlerts(institutionId),
    enabled: !!institutionId,
  });
}
