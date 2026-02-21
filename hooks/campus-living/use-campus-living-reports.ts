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

export function useOccupancyReport(institutionId: string) {
  return useQuery({
    queryKey: campusLivingReportKeys.occupancy({ institutionId }),
    queryFn: () => CampusLivingReports.generateOccupancyReport(institutionId),
    enabled: !!institutionId,
  });
}

export function useAttendanceRegisterReport(
  institutionId: string,
  dateFrom: string,
  dateTo: string,
  blockId?: string
) {
  return useQuery({
    queryKey: campusLivingReportKeys.attendance({ institutionId, dateFrom, dateTo, blockId }),
    queryFn: () => CampusLivingReports.generateAttendanceRegister(institutionId, dateFrom, dateTo, blockId),
    enabled: !!institutionId && !!dateFrom && !!dateTo,
  });
}

export function useVisitorRegisterReport(
  institutionId: string,
  dateFrom: string,
  dateTo: string,
  blockId?: string
) {
  return useQuery({
    queryKey: campusLivingReportKeys.maintenance({ institutionId, dateFrom, dateTo, blockId }),
    queryFn: () => CampusLivingReports.generateVisitorRegister(institutionId, dateFrom, dateTo, blockId),
    enabled: !!institutionId && !!dateFrom && !!dateTo,
  });
}

export function useAntiRaggingComplianceReport(institutionId: string, academicYearId: string) {
  return useQuery({
    queryKey: campusLivingReportKeys.incidents({ institutionId, academicYearId }),
    queryFn: () => CampusLivingReports.generateAntiRaggingComplianceReport(institutionId, academicYearId),
    enabled: !!institutionId && !!academicYearId,
  });
}

export function useSafetyAuditReport(institutionId: string, dateFrom: string, dateTo: string) {
  return useQuery({
    queryKey: campusLivingReportKeys.mess({ institutionId, dateFrom, dateTo }),
    queryFn: () => CampusLivingReports.generateSafetyAuditReport(institutionId, dateFrom, dateTo),
    enabled: !!institutionId && !!dateFrom && !!dateTo,
  });
}

export function useFeeCollectionReport(institutionId: string, academicYearId?: string) {
  return useQuery({
    queryKey: campusLivingReportKeys.financial({ institutionId, academicYearId }),
    queryFn: () => CampusLivingReports.generateFeeCollectionReport(institutionId, academicYearId),
    enabled: !!institutionId,
  });
}

// --- Mutation hooks ---

// CSV export helper — converts report data to CSV and downloads it
function downloadCsv(data: Record<string, unknown>[], filename: string) {
  if (!data.length) return;
  const headers = Object.keys(data[0]);
  const csv = [
    headers.join(','),
    ...data.map((row) =>
      headers.map((h) => {
        const val = row[h];
        const str = val === null || val === undefined ? '' : String(val);
        return str.includes(',') || str.includes('"') ? `"${str.replace(/"/g, '""')}"` : str;
      }).join(',')
    ),
  ].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

// JSON export helper — downloads report data as JSON
function downloadJson(data: unknown, filename: string) {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function useExportReport() {
  return useMutation({
    mutationFn: async (payload: {
      institutionId: string;
      reportType: 'occupancy' | 'attendance' | 'visitor' | 'anti-ragging' | 'safety' | 'fee-collection';
      format: 'csv' | 'json';
      filters?: Record<string, unknown>;
    }) => {
      const { institutionId, reportType, format, filters } = payload;
      const today = new Date().toISOString().split('T')[0];
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      let reportData: unknown;
      const filename = `campus-living-${reportType}-${today}`;

      switch (reportType) {
        case 'occupancy':
          reportData = await CampusLivingReports.generateOccupancyReport(institutionId);
          break;
        case 'attendance':
          reportData = await CampusLivingReports.generateAttendanceRegister(
            institutionId,
            (filters?.dateFrom as string) || thirtyDaysAgo,
            (filters?.dateTo as string) || today,
            filters?.blockId as string | undefined
          );
          break;
        case 'visitor':
          reportData = await CampusLivingReports.generateVisitorRegister(
            institutionId,
            (filters?.dateFrom as string) || thirtyDaysAgo,
            (filters?.dateTo as string) || today,
            filters?.blockId as string | undefined
          );
          break;
        case 'anti-ragging':
          reportData = await CampusLivingReports.generateAntiRaggingComplianceReport(
            institutionId,
            (filters?.academicYearId as string) || ''
          );
          break;
        case 'safety':
          reportData = await CampusLivingReports.generateSafetyAuditReport(
            institutionId,
            (filters?.dateFrom as string) || thirtyDaysAgo,
            (filters?.dateTo as string) || today
          );
          break;
        case 'fee-collection':
          reportData = await CampusLivingReports.generateFeeCollectionReport(
            institutionId,
            filters?.academicYearId as string | undefined
          );
          break;
      }

      if (format === 'json') {
        downloadJson(reportData, `${filename}.json`);
      } else {
        // For CSV, flatten the top-level array if available
        const flatData = Array.isArray(reportData)
          ? reportData
          : [reportData as Record<string, unknown>];
        downloadCsv(flatData, `${filename}.csv`);
      }

      return reportData;
    },
    onSuccess: () => {
      toast.success('Report exported successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to export report: ${error.message}`);
    },
  });
}
