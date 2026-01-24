import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AttendanceConsolidationService } from '@/lib/services/academic/attendance-consolidation-service';
import { usePermissions } from '@/hooks/use-permissions';
import toast from 'react-hot-toast';
import type {
  AttendanceConsolidationReport,
  CreateConsolidationReportDto,
  UpdateConsolidationReportDto,
  ConsolidationReportFilters,
} from '@/types/attendance';

/**
 * React Query hooks for Attendance Consolidation Reports
 * Created: 2026-01-23
 */

const QUERY_KEYS = {
  all: ['attendance-consolidation-reports'] as const,
  lists: () => [...QUERY_KEYS.all, 'list'] as const,
  list: (filters: ConsolidationReportFilters) => [...QUERY_KEYS.lists(), filters] as const,
  details: () => [...QUERY_KEYS.all, 'detail'] as const,
  detail: (id: string) => [...QUERY_KEYS.details(), id] as const,
};

/**
 * Hook to fetch a single consolidation report by ID
 */
export function useConsolidationReport(reportId: string | null) {
  return useQuery({
    queryKey: QUERY_KEYS.detail(reportId || ''),
    queryFn: () => AttendanceConsolidationService.getReport(reportId!),
    enabled: !!reportId,
    staleTime: 30000, // 30 seconds
  });
}

/**
 * Hook to fetch list of consolidation reports
 */
export function useConsolidationReports(filters: ConsolidationReportFilters = {}) {
  return useQuery({
    queryKey: QUERY_KEYS.list(filters),
    queryFn: () => AttendanceConsolidationService.listReports(filters),
    staleTime: 30000, // 30 seconds
  });
}

/**
 * Hook to create a new consolidation report
 */
export function useCreateConsolidationReport() {
  const queryClient = useQueryClient();
  const { userProfile } = usePermissions();

  return useMutation({
    mutationFn: async (dto: CreateConsolidationReportDto) => {
      if (!userProfile?.id) {
        throw new Error('User not authenticated');
      }
      return AttendanceConsolidationService.createReport(dto, userProfile.id);
    },
    onSuccess: (data) => {
      if (data) {
        toast.success('Consolidation report created successfully');
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.lists() });
      } else {
        toast.error('Failed to create report');
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create consolidation report');
    },
  });
}

/**
 * Hook to update a consolidation report
 */
export function useUpdateConsolidationReport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      reportId,
      dto,
    }: {
      reportId: string;
      dto: UpdateConsolidationReportDto;
    }) => {
      return AttendanceConsolidationService.updateReport(reportId, dto);
    },
    onSuccess: (data, variables) => {
      if (data) {
        toast.success('Report updated successfully');
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.detail(variables.reportId) });
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.lists() });
      } else {
        toast.error('Failed to update report');
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update consolidation report');
    },
  });
}

/**
 * Hook to delete a consolidation report (soft delete)
 */
export function useDeleteConsolidationReport() {
  const queryClient = useQueryClient();
  const { userProfile } = usePermissions();

  return useMutation({
    mutationFn: async (reportId: string) => {
      if (!userProfile?.id) {
        throw new Error('User not authenticated');
      }
      return AttendanceConsolidationService.deleteReport(reportId, userProfile.id);
    },
    onSuccess: (success) => {
      if (success) {
        toast.success('Report deleted successfully');
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.lists() });
      } else {
        toast.error('Failed to delete report');
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete consolidation report');
    },
  });
}

/**
 * Hook to regenerate report data
 */
export function useRegenerateConsolidationReport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (report: AttendanceConsolidationReport) => {
      return AttendanceConsolidationService.generateReportData(
        report.id,
        report.reportParams,
        report.institutionId
      );
    },
    onSuccess: (success, report) => {
      if (success) {
        toast.success('Report regenerated successfully');
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.detail(report.id) });
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.lists() });
      } else {
        toast.error('Failed to regenerate report');
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to regenerate consolidation report');
    },
  });
}

/**
 * Hook to bulk delete consolidation reports
 */
export function useBulkDeleteConsolidationReports() {
  const queryClient = useQueryClient();
  const { userProfile } = usePermissions();

  return useMutation({
    mutationFn: async (reportIds: string[]) => {
      if (!userProfile?.id) {
        throw new Error('User not authenticated');
      }

      const results = await Promise.allSettled(
        reportIds.map((id) => AttendanceConsolidationService.deleteReport(id, userProfile.id))
      );

      const successCount = results.filter((r) => r.status === 'fulfilled' && r.value).length;
      const failureCount = results.length - successCount;

      return { successCount, failureCount, total: results.length };
    },
    onSuccess: ({ successCount, failureCount }) => {
      if (successCount > 0) {
        toast.success(`Successfully deleted ${successCount} report(s)`);
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.lists() });
      }
      if (failureCount > 0) {
        toast.error(`Failed to delete ${failureCount} report(s)`);
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete reports');
    },
  });
}
