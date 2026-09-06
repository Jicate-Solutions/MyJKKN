'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { usePermissions } from '@/hooks/use-permissions';
import {
  HousekeepingService,
  type CleaningTaskStatus,
  type CreateScheduleDTO,
  type HostelCleaningSchedule,
  type ScheduleFilters,
  type TaskFilters,
} from '@/lib/services/campus-living/housekeeping-service';

// Query key factory
export const housekeepingKeys = {
  all: ['hostel-housekeeping'] as const,
  schedules: (filters: Record<string, unknown>) => ['hostel-housekeeping', 'schedules', filters] as const,
  tasks: (filters: Record<string, unknown>) => ['hostel-housekeeping', 'tasks', filters] as const,
};

// --- Schedules ---

export function useCleaningSchedules(
  institutionId: string | undefined,
  filters?: ScheduleFilters
) {
  const { isSuperAdmin } = usePermissions();
  return useQuery({
    queryKey: housekeepingKeys.schedules({ institutionId, ...filters }),
    queryFn: () => HousekeepingService.getSchedules(isSuperAdmin ? undefined : institutionId, filters),
    enabled: isSuperAdmin || !!institutionId,
  });
}

export function useCreateCleaningSchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateScheduleDTO) => HousekeepingService.createSchedule(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: housekeepingKeys.all });
      toast.success('Cleaning schedule created');
    },
    onError: (error: Error) => {
      toast.error(`Failed to create cleaning schedule: ${error.message}`);
    },
  });
}

export function useUpdateCleaningSchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<HostelCleaningSchedule> }) =>
      HousekeepingService.updateSchedule(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: housekeepingKeys.all });
      toast.success('Cleaning schedule updated');
    },
    onError: (error: Error) => {
      toast.error(`Failed to update cleaning schedule: ${error.message}`);
    },
  });
}

export function useDeleteCleaningSchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => HousekeepingService.deleteSchedule(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: housekeepingKeys.all });
      toast.success('Cleaning schedule deleted');
    },
    onError: (error: Error) => {
      // hostel_cleaning_tasks.schedule_id has a plain FK (no cascade), so any
      // schedule that has ever generated a task cannot be deleted — RLS allows
      // it, Postgres refuses it with 23503. Say what to do instead rather than
      // surfacing the raw constraint name.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const code = (error as any)?.code;
      if (code === '23503') {
        toast.error(
          'This schedule already has generated cleaning tasks, so it cannot be deleted. Deactivate it instead to stop new tasks.'
        );
        return;
      }
      toast.error(`Failed to delete cleaning schedule: ${error.message}`);
    },
  });
}

// --- Tasks ---

/**
 * `pageSize` defaults to the service's 50 — which silently truncated the
 * tasks list (98 rows existed, 50 rendered, no indication). Callers showing a
 * full work list should pass a real page size and surface `count`.
 */
export function useCleaningTasks(
  institutionId: string | undefined,
  filters?: TaskFilters,
  page = 1,
  pageSize = 50
) {
  const { isSuperAdmin } = usePermissions();
  return useQuery({
    queryKey: housekeepingKeys.tasks({ institutionId, ...filters, page, pageSize }),
    queryFn: () =>
      HousekeepingService.getTasks(
        isSuperAdmin ? undefined : institutionId,
        filters,
        page,
        pageSize
      ),
    enabled: isSuperAdmin || !!institutionId,
  });
}

export function useUpdateCleaningTaskStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: CleaningTaskStatus }) =>
      HousekeepingService.updateTaskStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: housekeepingKeys.all });
      toast.success('Task status updated');
    },
    onError: (error: Error) => {
      // RLS denial arrives here as a plain Supabase error object, not a throw
      // from the UI — surface it rather than leaving the row silently stale.
      toast.error(`Failed to update task status: ${error.message}`);
    },
  });
}
