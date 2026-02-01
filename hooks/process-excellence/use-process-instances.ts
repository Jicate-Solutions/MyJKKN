'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { ProcessExcellenceService } from '@/lib/services/process-excellence/process-excellence-service';
import type {
  ProcessInstance,
  ProcessInstanceFilters,
  StartProcessInstanceDto
} from '@/types/process-excellence';

// Query keys
export const processInstanceKeys = {
  all: ['process-instances'] as const,
  lists: () => [...processInstanceKeys.all, 'list'] as const,
  list: (filters: ProcessInstanceFilters) =>
    [...processInstanceKeys.lists(), filters] as const,
  details: () => [...processInstanceKeys.all, 'detail'] as const,
  detail: (id: string) => [...processInstanceKeys.details(), id] as const,
  byReference: (type: string, id: string) =>
    [...processInstanceKeys.all, 'reference', type, id] as const
};

// Hook for fetching process instances list
export function useProcessInstances(filters: ProcessInstanceFilters) {
  return useQuery({
    queryKey: processInstanceKeys.list(filters),
    queryFn: () => ProcessExcellenceService.getProcessInstances(filters),
    enabled: !!filters.institution_id,
    staleTime: 2 * 60 * 1000 // 2 minutes - instances change more frequently
  });
}

// Hook for fetching single process instance
export function useProcessInstance(id: string) {
  return useQuery({
    queryKey: processInstanceKeys.detail(id),
    queryFn: () => ProcessExcellenceService.getProcessInstance(id),
    enabled: !!id,
    staleTime: 2 * 60 * 1000
  });
}

// Hook for fetching instance by reference
export function useProcessInstanceByReference(
  referenceType: string,
  referenceId: string
) {
  return useQuery({
    queryKey: processInstanceKeys.byReference(referenceType, referenceId),
    queryFn: () =>
      ProcessExcellenceService.getInstanceByReference(referenceType, referenceId),
    enabled: !!referenceType && !!referenceId,
    staleTime: 2 * 60 * 1000
  });
}

// Hook for starting a process instance
export function useStartProcessInstance() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: StartProcessInstanceDto) =>
      ProcessExcellenceService.startProcessInstance(data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: processInstanceKeys.lists() });
      toast.success('Process instance started successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to start process instance');
    }
  });
}

// Hook for advancing to next stage
export function useAdvanceStage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      instanceId,
      newStage,
      isValueAdd
    }: {
      instanceId: string;
      newStage: string;
      isValueAdd?: boolean;
    }) =>
      ProcessExcellenceService.advanceStage(instanceId, newStage, isValueAdd),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: processInstanceKeys.lists() });
      queryClient.invalidateQueries({
        queryKey: processInstanceKeys.detail(data.id)
      });
      toast.success(`Advanced to stage: ${data.current_stage}`);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to advance stage');
    }
  });
}

// Hook for completing a process
export function useCompleteProcess() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (instanceId: string) =>
      ProcessExcellenceService.completeProcess(instanceId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: processInstanceKeys.lists() });
      queryClient.invalidateQueries({
        queryKey: processInstanceKeys.detail(data.id)
      });
      toast.success(
        `Process completed! Value-add ratio: ${data.value_add_ratio?.toFixed(1)}%`
      );
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to complete process');
    }
  });
}

// Hook for active instances (in-progress)
export function useActiveProcessInstances(institutionId?: string, processId?: string) {
  return useQuery({
    queryKey: [...processInstanceKeys.lists(), 'active', institutionId, processId],
    queryFn: () =>
      ProcessExcellenceService.getProcessInstances({
        institution_id: institutionId,
        process_id: processId,
        is_completed: false,
        limit: 100
      }),
    staleTime: 1 * 60 * 1000, // 1 minute
    select: (data) => data.data
  });
}

// Hook for SLA-breached instances
export function useSLABreachedInstances(institutionId?: string) {
  return useQuery({
    queryKey: [...processInstanceKeys.lists(), 'breached', institutionId],
    queryFn: () =>
      ProcessExcellenceService.getProcessInstances({
        institution_id: institutionId,
        sla_status: 'breached',
        is_completed: false,
        limit: 50
      }),
    staleTime: 1 * 60 * 1000,
    select: (data) => data.data
  });
}
