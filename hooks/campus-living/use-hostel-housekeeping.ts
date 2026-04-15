'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { usePermissions } from '@/hooks/use-permissions';
import {
  HousekeepingService,
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
    queryFn: () => HousekeepingService.getSchedules(institutionId as string, filters),
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
      toast.error(`Failed to delete cleaning schedule: ${error.message}`);
    },
  });
}

// --- Tasks ---

export function useCleaningTasks(
  institutionId: string | undefined,
  filters?: TaskFilters
) {
  const { isSuperAdmin } = usePermissions();
  return useQuery({
    queryKey: housekeepingKeys.tasks({ institutionId, ...filters }),
    queryFn: () => HousekeepingService.getTasks(institutionId as string, filters),
    enabled: isSuperAdmin || !!institutionId,
  });
}
