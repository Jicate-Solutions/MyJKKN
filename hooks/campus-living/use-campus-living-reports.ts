'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CampusLivingReports } from '@/lib/services/campus-living/campus-living-reports';

// Query key factory
export const campusLivingReportKeys = {
  all: ['campus-living-reports'] as const,
  occupancy: (filters: Record<string, unknown>) => ['campus-living-reports', 'occupancy', filters] as const,
  attendance: (filters: Record<string, unknown>) => ['campus-living-reports', 'attendance', filters] as const,
  maintenance: (filters: Record<string, unknown>) => ['campus-living-reports', 'maintenance', filters] as const,
  mess: (filters: Record<string, unknown>) => ['campus-living-reports', 'mess', filters] as const,
  incidents: (filters: Record<string, unknown>) => ['campus-living-reports', 'incidents', filters] as const,
  financial: (filters: Record<string, unknown>) => ['campus-living-reports', 'financial', filters] as const,
};

// --- Query hooks ---

export function useOccupancyReport(institutionId: string, filters?: Record<string, unknown>) {
  return useQuery({
    queryKey: campusLivingReportKeys.occupancy({ institutionId, ...filters }),
    queryFn: () => CampusLivingReports.getOccupancyReport(institutionId, filters),
    enabled: !!institutionId,
  });
}

export function useAttendanceReport(institutionId: string, filters?: Record<string, unknown>) {
  return useQuery({
    queryKey: campusLivingReportKeys.attendance({ institutionId, ...filters }),
    queryFn: () => CampusLivingReports.getAttendanceReport(institutionId, filters),
    enabled: !!institutionId,
  });
}

export function useMaintenanceReport(institutionId: string, filters?: Record<string, unknown>) {
  return useQuery({
    queryKey: campusLivingReportKeys.maintenance({ institutionId, ...filters }),
    queryFn: () => CampusLivingReports.getMaintenanceReport(institutionId, filters),
    enabled: !!institutionId,
  });
}

export function useMessReport(institutionId: string, filters?: Record<string, unknown>) {
  return useQuery({
    queryKey: campusLivingReportKeys.mess({ institutionId, ...filters }),
    queryFn: () => CampusLivingReports.getMessReport(institutionId, filters),
    enabled: !!institutionId,
  });
}

export function useIncidentReport(institutionId: string, filters?: Record<string, unknown>) {
  return useQuery({
    queryKey: campusLivingReportKeys.incidents({ institutionId, ...filters }),
    queryFn: () => CampusLivingReports.getIncidentReport(institutionId, filters),
    enabled: !!institutionId,
  });
}

export function useFinancialReport(institutionId: string, filters?: Record<string, unknown>) {
  return useQuery({
    queryKey: campusLivingReportKeys.financial({ institutionId, ...filters }),
    queryFn: () => CampusLivingReports.getFinancialReport(institutionId, filters),
    enabled: !!institutionId,
  });
}

// --- Mutation hooks ---

export function useExportReport() {
  return useMutation({
    mutationFn: (payload: { institutionId: string; reportType: string; format: 'pdf' | 'csv' | 'xlsx'; filters?: Record<string, unknown> }) =>
      CampusLivingReports.exportReport(payload),
    onSuccess: () => {
      toast.success('Report exported');
    },
    onError: (error: Error) => {
      toast.error(`Failed to export report: ${error.message}`);
    },
  });
}
