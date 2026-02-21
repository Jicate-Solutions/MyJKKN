'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
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

export function useOccupancyAnalytics(institutionId: string, filters?: Record<string, unknown>) {
  return useQuery({
    queryKey: campusLivingAnalyticsKeys.occupancy({ institutionId, ...filters }),
    queryFn: () => CampusLivingAnalytics.getOccupancyAnalytics(institutionId, filters),
    enabled: !!institutionId,
  });
}

export function useAttendanceAnalytics(institutionId: string, filters?: Record<string, unknown>) {
  return useQuery({
    queryKey: campusLivingAnalyticsKeys.attendance({ institutionId, ...filters }),
    queryFn: () => CampusLivingAnalytics.getAttendanceAnalytics(institutionId, filters),
    enabled: !!institutionId,
  });
}

export function useMaintenanceAnalytics(institutionId: string, filters?: Record<string, unknown>) {
  return useQuery({
    queryKey: campusLivingAnalyticsKeys.maintenance({ institutionId, ...filters }),
    queryFn: () => CampusLivingAnalytics.getMaintenanceAnalytics(institutionId, filters),
    enabled: !!institutionId,
  });
}

export function useMessAnalytics(institutionId: string, filters?: Record<string, unknown>) {
  return useQuery({
    queryKey: campusLivingAnalyticsKeys.mess({ institutionId, ...filters }),
    queryFn: () => CampusLivingAnalytics.getMessAnalytics(institutionId, filters),
    enabled: !!institutionId,
  });
}

export function useIncidentAnalytics(institutionId: string, filters?: Record<string, unknown>) {
  return useQuery({
    queryKey: campusLivingAnalyticsKeys.incidents({ institutionId, ...filters }),
    queryFn: () => CampusLivingAnalytics.getIncidentAnalytics(institutionId, filters),
    enabled: !!institutionId,
  });
}

export function useTrendAnalytics(institutionId: string, filters?: Record<string, unknown>) {
  return useQuery({
    queryKey: campusLivingAnalyticsKeys.trends({ institutionId, ...filters }),
    queryFn: () => CampusLivingAnalytics.getTrendAnalytics(institutionId, filters),
    enabled: !!institutionId,
  });
}
