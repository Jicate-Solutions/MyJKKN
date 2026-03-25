// hooks/admission/use-workflows.ts
// React Query hooks for admission workflows

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  WorkflowsService,
  type Workflow,
  type CreateWorkflowInput,
  type UpdateWorkflowInput,
  type WorkflowStats,
  type WorkflowExecution,
} from '@/lib/services/admission/workflows-service';

// Query keys
export const workflowsKeys = {
  all: ['admission-workflows'] as const,
  lists: () => [...workflowsKeys.all, 'list'] as const,
  list: (institutionId: string) => [...workflowsKeys.lists(), institutionId] as const,
  active: (institutionId: string) => [...workflowsKeys.all, 'active', institutionId] as const,
  details: () => [...workflowsKeys.all, 'detail'] as const,
  detail: (id: string) => [...workflowsKeys.details(), id] as const,
  stats: (institutionId: string) => [...workflowsKeys.all, 'stats', institutionId] as const,
  executions: (workflowId: string) => [...workflowsKeys.all, 'executions', workflowId] as const,
};

/**
 * Hook to fetch all workflows for an institution
 */
export function useWorkflows(institutionId?: string) {
  const query = useQuery({
    queryKey: workflowsKeys.list(institutionId || ''),
    queryFn: () => WorkflowsService.getWorkflows(institutionId!),
    enabled: !!institutionId,
  });

  return {
    workflows: query.data || [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * Hook to fetch active workflows (for execution engine)
 */
export function useActiveWorkflows(institutionId?: string) {
  const query = useQuery({
    queryKey: workflowsKeys.active(institutionId || ''),
    queryFn: () => WorkflowsService.getActiveWorkflows(institutionId!),
    enabled: !!institutionId,
  });

  return {
    workflows: query.data || [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * Hook to fetch a single workflow by ID
 */
export function useWorkflow(id?: string) {
  const query = useQuery({
    queryKey: workflowsKeys.detail(id || ''),
    queryFn: () => WorkflowsService.getWorkflow(id!),
    enabled: !!id,
  });

  return {
    workflow: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * Hook to fetch workflow statistics
 */
export function useWorkflowStats(institutionId?: string) {
  const query = useQuery({
    queryKey: workflowsKeys.stats(institutionId || ''),
    queryFn: () => WorkflowsService.getWorkflowStats(institutionId!),
    enabled: !!institutionId,
    staleTime: 30000, // 30 seconds
  });

  return {
    stats: query.data || {
      totalWorkflows: 0,
      activeWorkflows: 0,
      totalExecutions: 0,
      executionsToday: 0,
      failedExecutions: 0,
    } as WorkflowStats,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}

/**
 * Hook to fetch workflow executions
 */
export function useWorkflowExecutions(workflowId?: string, limit = 50) {
  const query = useQuery({
    queryKey: workflowsKeys.executions(workflowId || ''),
    queryFn: () => WorkflowsService.getWorkflowExecutions(workflowId!, limit),
    enabled: !!workflowId,
  });

  return {
    executions: query.data || [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * Hook for workflow mutations (create, update, delete, toggle, duplicate)
 */
export function useWorkflowMutations() {
  const queryClient = useQueryClient();

  const invalidateQueries = (institutionId?: string) => {
    queryClient.invalidateQueries({ queryKey: workflowsKeys.all });
    if (institutionId) {
      queryClient.invalidateQueries({ queryKey: workflowsKeys.stats(institutionId) });
    }
  };

  const createWorkflow = useMutation({
    mutationFn: (input: CreateWorkflowInput) => {
      const validation = WorkflowsService.validateWorkflow(input);
      if (!validation.valid) {
        throw new Error(validation.errors.join(', '));
      }
      return WorkflowsService.createWorkflow(input);
    },
    onSuccess: (data) => {
      toast.success('Workflow created successfully');
      invalidateQueries(data.institution_id);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create workflow');
    },
  });

  const updateWorkflow = useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateWorkflowInput }) =>
      WorkflowsService.updateWorkflow(id, input),
    onSuccess: (data) => {
      toast.success('Workflow updated successfully');
      invalidateQueries(data.institution_id);
      queryClient.invalidateQueries({ queryKey: workflowsKeys.detail(data.id) });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update workflow');
    },
  });

  const deleteWorkflow = useMutation({
    mutationFn: ({ id, institutionId }: { id: string; institutionId: string }) =>
      WorkflowsService.deleteWorkflow(id),
    onSuccess: (_, { institutionId }) => {
      toast.success('Workflow deleted');
      invalidateQueries(institutionId);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete workflow');
    },
  });

  const toggleStatus = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      WorkflowsService.toggleWorkflowStatus(id, isActive),
    onSuccess: (data) => {
      toast.success(data.is_active ? 'Workflow activated' : 'Workflow paused');
      invalidateQueries(data.institution_id);
      queryClient.invalidateQueries({ queryKey: workflowsKeys.detail(data.id) });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to toggle workflow status');
    },
  });

  const duplicateWorkflow = useMutation({
    mutationFn: (id: string) => WorkflowsService.duplicateWorkflow(id),
    onSuccess: (data) => {
      toast.success('Workflow duplicated successfully');
      invalidateQueries(data.institution_id);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to duplicate workflow');
    },
  });

  return {
    createWorkflow,
    updateWorkflow,
    deleteWorkflow,
    toggleStatus,
    duplicateWorkflow,
    isCreating: createWorkflow.isPending,
    isUpdating: updateWorkflow.isPending,
    isDeleting: deleteWorkflow.isPending,
    isToggling: toggleStatus.isPending,
    isDuplicating: duplicateWorkflow.isPending,
  };
}

/**
 * Hook for workflow helper data
 */
export function useWorkflowHelpers() {
  return {
    triggerTypes: WorkflowsService.getTriggerTypes(),
    actionTypes: WorkflowsService.getActionTypes(),
    validateWorkflow: WorkflowsService.validateWorkflow,
  };
}
