'use client';

import { useQuery } from '@tanstack/react-query';
import { CampusLivingAnalytics } from '@/lib/services/campus-living/campus-living-analytics';
import { usePermissions } from '@/hooks/use-permissions';

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

export function useOccupancyAnalytics(institutionId: string | undefined) {
  const { isSuperAdmin } = usePermissions();
  return useQuery({
    queryKey: campusLivingAnalyticsKeys.occupancy({ institutionId }),
    queryFn: () => CampusLivingAnalytics.getOccupancyAnalytics(isSuperAdmin ? undefined : institutionId),
    enabled: isSuperAdmin || !!institutionId,
  });
}

export function useAttendanceTrend(institutionId: string | undefined, dateFrom: string, dateTo: string, blockId?: string) {
  const { isSuperAdmin } = usePermissions();
  return useQuery({
    queryKey: campusLivingAnalyticsKeys.attendance({ institutionId, dateFrom, dateTo, blockId }),
    queryFn: () => CampusLivingAnalytics.getAttendanceTrend(isSuperAdmin ? undefined : institutionId, dateFrom, dateTo, blockId),
    enabled: (isSuperAdmin || !!institutionId) && !!dateFrom && !!dateTo,
  });
}

export function useMaintenanceAnalytics(institutionId: string | undefined, dateFrom?: string, dateTo?: string) {
  const { isSuperAdmin } = usePermissions();
  return useQuery({
    queryKey: campusLivingAnalyticsKeys.maintenance({ institutionId, dateFrom, dateTo }),
    queryFn: () => CampusLivingAnalytics.getMaintenanceAnalytics(isSuperAdmin ? undefined : institutionId, dateFrom, dateTo),
    enabled: isSuperAdmin || !!institutionId,
  });
}

export function useMessAnalytics(institutionId: string | undefined, dateFrom: string, dateTo: string) {
  const { isSuperAdmin } = usePermissions();
  return useQuery({
    queryKey: campusLivingAnalyticsKeys.mess({ institutionId, dateFrom, dateTo }),
    queryFn: () => CampusLivingAnalytics.getMessAnalytics(isSuperAdmin ? undefined : institutionId, dateFrom, dateTo),
    enabled: (isSuperAdmin || !!institutionId) && !!dateFrom && !!dateTo,
  });
}

export function useIncidentAnalytics(institutionId: string | undefined, dateFrom?: string, dateTo?: string) {
  const { isSuperAdmin } = usePermissions();
  return useQuery({
    queryKey: campusLivingAnalyticsKeys.incidents({ institutionId, dateFrom, dateTo }),
    queryFn: () => CampusLivingAnalytics.getIncidentAnalytics(isSuperAdmin ? undefined : institutionId, dateFrom, dateTo),
    enabled: isSuperAdmin || !!institutionId,
  });
}

export function useRiskAlerts(institutionId: string | undefined) {
  const { isSuperAdmin } = usePermissions();
  return useQuery({
    queryKey: campusLivingAnalyticsKeys.trends({ institutionId }),
    queryFn: () => CampusLivingAnalytics.generateRiskAlerts(isSuperAdmin ? undefined : institutionId),
    enabled: isSuperAdmin || !!institutionId,
  });
}
