'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { usePermissions } from '@/hooks/use-permissions';
import { PreventiveMaintenanceService } from '@/lib/services/campus-living/preventive-maintenance-service';
import type {
  HostelPmTaskStatus,
  CompleteHostelPmTaskDTO,
} from '@/types/campus-living/community';

export const hostelPreventiveMaintenanceKeys = {
  all: ['hostel-preventive-maintenance'] as const,
  list: (filters: Record<string, unknown>) =>
    ['hostel-preventive-maintenance', 'list', filters] as const,
  tasks: (filters: Record<string, unknown>) =>
    ['hostel-preventive-maintenance', 'tasks', filters] as const,
};

/**
 * Lists preventive-maintenance schedules for hostel-infrastructure resources.
 * Super admins see schedules across all institutions; everyone else sees their
 * own institution's schedules.
 */
export function usePreventiveMaintenance(institutionId: string | undefined) {
  const { isSuperAdmin } = usePermissions();
  return useQuery({
    queryKey: hostelPreventiveMaintenanceKeys.list({ institutionId }),
    queryFn: () =>
      PreventiveMaintenanceService.getSchedules(
        isSuperAdmin ? undefined : institutionId,
      ),
    enabled: isSuperAdmin || !!institutionId,
  });
}

/**
 * Lists preventive-maintenance tasks (auto-generated from active schedules)
 * for the supplied institution. Filters on status, schedule_id, block_id,
 * and free-text title search.
 */
export function useHostelPmTasks(
  institutionId: string | undefined,
  filters?: {
    status?: HostelPmTaskStatus | HostelPmTaskStatus[];
    schedule_id?: string;
    block_id?: string | null;
    search?: string;
  },
) {
  return useQuery({
    queryKey: hostelPreventiveMaintenanceKeys.tasks({
      institutionId,
      ...filters,
    }),
    queryFn: () =>
      PreventiveMaintenanceService.getTasks(institutionId, filters),
    enabled: !!institutionId,
  });
}

/**
 * Complete a PM task — flips status to 'resolved' and stamps completion
 * metadata. Invalidates the tasks query on success so the page re-syncs.
 */
export function useCompleteHostelPmTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      completedBy,
      payload,
    }: {
      id: string;
      completedBy: string | null;
      payload: CompleteHostelPmTaskDTO;
    }) => PreventiveMaintenanceService.completeTask(id, completedBy, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: hostelPreventiveMaintenanceKeys.all,
      });
      toast.success('Task completed');
    },
    onError: (error: Error) => {
      toast.error(`Failed to complete task: ${error.message}`);
    },
  });
}
