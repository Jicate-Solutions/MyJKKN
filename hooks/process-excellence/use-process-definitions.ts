'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { ProcessExcellenceService } from '@/lib/services/process-excellence/process-excellence-service';
import type {
  ProcessDefinition,
  ProcessDefinitionFilters,
  CreateProcessDefinitionDto,
  UpdateProcessDefinitionDto
} from '@/types/process-excellence';

// Query keys
export const processDefinitionKeys = {
  all: ['process-definitions'] as const,
  lists: () => [...processDefinitionKeys.all, 'list'] as const,
  list: (filters: ProcessDefinitionFilters) =>
    [...processDefinitionKeys.lists(), filters] as const,
  details: () => [...processDefinitionKeys.all, 'detail'] as const,
  detail: (id: string) => [...processDefinitionKeys.details(), id] as const
};

// Hook for fetching process definitions list
export function useProcessDefinitions(filters: ProcessDefinitionFilters = {}) {
  return useQuery({
    queryKey: processDefinitionKeys.list(filters),
    queryFn: () => ProcessExcellenceService.getProcessDefinitions(filters),
    staleTime: 5 * 60 * 1000 // 5 minutes
  });
}

// Hook for fetching single process definition
export function useProcessDefinition(id: string) {
  return useQuery({
    queryKey: processDefinitionKeys.detail(id),
    queryFn: () => ProcessExcellenceService.getProcessDefinition(id),
    enabled: !!id,
    staleTime: 5 * 60 * 1000
  });
}

// Hook for creating process definition
export function useCreateProcessDefinition() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateProcessDefinitionDto) =>
      ProcessExcellenceService.createProcessDefinition(data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: processDefinitionKeys.lists() });
      toast.success(`Process "${data.name}" created successfully`);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create process definition');
    }
  });
}

// Hook for updating process definition
export function useUpdateProcessDefinition() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      data
    }: {
      id: string;
      data: UpdateProcessDefinitionDto;
    }) => ProcessExcellenceService.updateProcessDefinition(id, data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: processDefinitionKeys.lists() });
      queryClient.invalidateQueries({
        queryKey: processDefinitionKeys.detail(data.id)
      });
      toast.success(`Process "${data.name}" updated successfully`);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update process definition');
    }
  });
}

// Hook for deleting process definition
export function useDeleteProcessDefinition() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      ProcessExcellenceService.deleteProcessDefinition(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: processDefinitionKeys.lists() });
      toast.success('Process definition deleted successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete process definition');
    }
  });
}

// Hook for active process definitions (for dropdowns)
export function useActiveProcessDefinitions(institutionId: string) {
  return useQuery({
    queryKey: [...processDefinitionKeys.lists(), 'active', institutionId],
    queryFn: () =>
      ProcessExcellenceService.getProcessDefinitions({
        institution_id: institutionId,
        is_active: true,
        limit: 100
      }),
    enabled: !!institutionId,
    staleTime: 10 * 60 * 1000, // 10 minutes
    select: (data) => data.data // Return just the array
  });
}
