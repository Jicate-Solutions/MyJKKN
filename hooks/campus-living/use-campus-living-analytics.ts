'use client';

import { useQuery } from '@tanstack/react-query';
import { CampusLivingAnalytics } from '@/lib/services/campus-living/campus-living-analytics';
import { useCampusLivingScope } from '@/hooks/campus-living/use-campus-living-scope';

// Query key factory
export const campusLivingAnalyticsKeys = {
  all: ['campus-living-analytics'] as const,
  occupancy: (filters: Record<string, unknown>) => ['campus-living-analytics', 'occupancy', filters] as const,
  attendance: (filters: Record<string, unknown>) => ['campus-living-analytics', 'attendance', filters] as const,
  maintenance: (filters: Record<string, unknown>) => ['campus-living-analytics', 'maintenance', filters] as const,
  mess: (filters: Record<string, unknown>) => ['campus-living-analytics', 'mess', filters] as const,
  incidents: (filters: Record<string, unknown>) => ['campus-living-analytics', 'incidents', filters] as const,
  trends: (filters: Record<string, unknown>) => ['campus-living-analytics', 'trends', filters] as const,
  crossDomain: (filters: Record<string, unknown>) => ['campus-living-analytics', 'cross-domain', filters] as const,
};

// --- Query hooks ---
//
// The filter objects below carry `scope` (the RESOLVED viewer scope) rather than
// the raw institutionId, and every `enabled` waits for permissions to load. Both
// halves are required — see useCampusLivingScope for why (BUG-005831). These
// hooks feed the seven /campus-living/analytics pages plus the Management
// Dashboard's 30-day attendance trend, all of which read zero for a super admin
// under the old shape.

export function useOccupancyAnalytics(institutionId: string | undefined) {
  const { scopeKey, serviceArg, ready } = useCampusLivingScope(institutionId);
  return useQuery({
    queryKey: campusLivingAnalyticsKeys.occupancy({ scope: scopeKey }),
    queryFn: () => CampusLivingAnalytics.getOccupancyAnalytics(serviceArg),
    enabled: ready,
  });
}

export function useAttendanceTrend(institutionId: string | undefined, dateFrom: string, dateTo: string, blockId?: string) {
  const { scopeKey, serviceArg, ready } = useCampusLivingScope(institutionId);
  return useQuery({
    queryKey: campusLivingAnalyticsKeys.attendance({ scope: scopeKey, dateFrom, dateTo, blockId }),
    queryFn: () => CampusLivingAnalytics.getAttendanceTrend(serviceArg, dateFrom, dateTo, blockId),
    enabled: ready && !!dateFrom && !!dateTo,
  });
}

export function useMaintenanceAnalytics(institutionId: string | undefined, dateFrom?: string, dateTo?: string) {
  const { scopeKey, serviceArg, ready } = useCampusLivingScope(institutionId);
  return useQuery({
    queryKey: campusLivingAnalyticsKeys.maintenance({ scope: scopeKey, dateFrom, dateTo }),
    queryFn: () => CampusLivingAnalytics.getMaintenanceAnalytics(serviceArg, dateFrom, dateTo),
    enabled: ready,
  });
}

export function useMessAnalytics(institutionId: string | undefined, dateFrom: string, dateTo: string) {
  const { scopeKey, serviceArg, ready } = useCampusLivingScope(institutionId);
  return useQuery({
    queryKey: campusLivingAnalyticsKeys.mess({ scope: scopeKey, dateFrom, dateTo }),
    queryFn: () => CampusLivingAnalytics.getMessAnalytics(serviceArg, dateFrom, dateTo),
    enabled: ready && !!dateFrom && !!dateTo,
  });
}

export function useIncidentAnalytics(institutionId: string | undefined, dateFrom?: string, dateTo?: string) {
  const { scopeKey, serviceArg, ready } = useCampusLivingScope(institutionId);
  return useQuery({
    queryKey: campusLivingAnalyticsKeys.incidents({ scope: scopeKey, dateFrom, dateTo }),
    queryFn: () => CampusLivingAnalytics.getIncidentAnalytics(serviceArg, dateFrom, dateTo),
    enabled: ready,
  });
}

export function useRiskAlerts(institutionId: string | undefined) {
  const { scopeKey, serviceArg, ready } = useCampusLivingScope(institutionId);
  return useQuery({
    queryKey: campusLivingAnalyticsKeys.trends({ scope: scopeKey }),
    queryFn: () => CampusLivingAnalytics.generateRiskAlerts(serviceArg),
    enabled: ready,
  });
}

export function useCrossDomainAnalytics(institutionId: string | undefined) {
  const { scopeKey, serviceArg, ready } = useCampusLivingScope(institutionId);
  return useQuery({
    queryKey: campusLivingAnalyticsKeys.crossDomain({ scope: scopeKey }),
    queryFn: () => CampusLivingAnalytics.getCrossDomainCorrelations(serviceArg),
    enabled: ready,
  });
}
