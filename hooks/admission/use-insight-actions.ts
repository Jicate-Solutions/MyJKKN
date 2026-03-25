// hooks/admission/use-insight-actions.ts
// React Query hooks for Insight Actions

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  InsightActionsService,
  type InsightActionType,
  type ActionParams,
  type ActionContext,
  type AvailableAction,
  type ActionExecution,
  type ActionFilters,
} from '@/lib/services/admission/insight-actions-service';

// ============================================================================
// QUERY KEYS
// ============================================================================

export const insightActionsKeys = {
  all: ['insight-actions'] as const,
  available: (context?: ActionContext) => [...insightActionsKeys.all, 'available', context] as const,
  history: (filters: ActionFilters) => [...insightActionsKeys.all, 'history', filters] as const,
  execution: (id: string) => [...insightActionsKeys.all, 'execution', id] as const,
};

// ============================================================================
// AVAILABLE ACTIONS HOOK
// ============================================================================

/**
 * Get available actions based on context
 */
export function useAvailableActions(context?: ActionContext) {
  return useQuery({
    queryKey: insightActionsKeys.available(context),
    queryFn: () => InsightActionsService.getAvailableActions(context),
    staleTime: 1000 * 60 * 5, // 5 minutes - actions don't change often
  });
}

/**
 * Get a specific action's metadata
 */
export function useActionMetadata(actionType: InsightActionType | null) {
  return useQuery({
    queryKey: [...insightActionsKeys.all, 'metadata', actionType],
    queryFn: () => actionType ? InsightActionsService.getActionMetadata(actionType) : null,
    enabled: !!actionType,
    staleTime: Infinity, // Metadata doesn't change
  });
}

// ============================================================================
// ACTION EXECUTION HOOKS
// ============================================================================

/**
 * Execute a single action on one lead
 */
export function useExecuteAction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      actionType,
      leadId,
      params,
      context,
    }: {
      actionType: InsightActionType;
      leadId: string;
      params: ActionParams;
      context: ActionContext;
    }) => {
      return InsightActionsService.executeAction(actionType, leadId, params, context);
    },
    onSuccess: (result, variables) => {
      const actionMeta = InsightActionsService.getActionMetadata(variables.actionType);
      toast.success(`${actionMeta?.label || 'Action'} completed: ${result.result?.summary}`);

      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: insightActionsKeys.history({ institution_id: variables.context.institution_id }) });
      queryClient.invalidateQueries({ queryKey: ['admission-leads'] });
      queryClient.invalidateQueries({ queryKey: ['admission-lead', variables.leadId] });
      queryClient.invalidateQueries({ queryKey: ['counselor-daily-view'] });
    },
    onError: (error: Error, variables) => {
      const actionMeta = InsightActionsService.getActionMetadata(variables.actionType);
      toast.error(`${actionMeta?.label || 'Action'} failed: ${error.message}`);
    },
  });
}

/**
 * Execute a bulk action on multiple leads
 */
export function useBulkAction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      actionType,
      leadIds,
      params,
      context,
    }: {
      actionType: InsightActionType;
      leadIds: string[];
      params: ActionParams;
      context: ActionContext;
    }) => {
      return InsightActionsService.executeBulkAction(actionType, leadIds, params, context);
    },
    onSuccess: (result, variables) => {
      const actionMeta = InsightActionsService.getActionMetadata(variables.actionType);
      const successMsg = result.result?.summary || `${result.result?.success_count || 0} completed`;

      if (result.result?.failure_count && result.result.failure_count > 0) {
        toast.warning(`${actionMeta?.label || 'Bulk action'}: ${successMsg}`);
      } else {
        toast.success(`${actionMeta?.label || 'Bulk action'}: ${successMsg}`);
      }

      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: insightActionsKeys.history({ institution_id: variables.context.institution_id }) });
      queryClient.invalidateQueries({ queryKey: ['admission-leads'] });
      queryClient.invalidateQueries({ queryKey: ['counselor-daily-view'] });

      // Invalidate individual lead queries
      variables.leadIds.forEach(leadId => {
        queryClient.invalidateQueries({ queryKey: ['admission-lead', leadId] });
      });
    },
    onError: (error: Error, variables) => {
      const actionMeta = InsightActionsService.getActionMetadata(variables.actionType);
      toast.error(`${actionMeta?.label || 'Bulk action'} failed: ${error.message}`);
    },
  });
}

/**
 * Cancel an executing action
 */
export function useCancelAction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (executionId: string) => {
      return InsightActionsService.cancelExecution(executionId);
    },
    onSuccess: () => {
      toast.success('Action cancelled');
      queryClient.invalidateQueries({ queryKey: insightActionsKeys.all });
    },
    onError: (error: Error) => {
      toast.error(`Failed to cancel: ${error.message}`);
    },
  });
}

// ============================================================================
// ACTION HISTORY HOOKS
// ============================================================================

/**
 * Get action execution history
 */
export function useActionHistory(filters: ActionFilters) {
  return useQuery({
    queryKey: insightActionsKeys.history(filters),
    queryFn: () => InsightActionsService.getActionHistory(filters),
    enabled: !!filters.institution_id,
    staleTime: 1000 * 30, // 30 seconds
  });
}

/**
 * Get a single execution details
 */
export function useActionExecution(executionId: string | null) {
  return useQuery({
    queryKey: insightActionsKeys.execution(executionId || ''),
    queryFn: () => executionId ? InsightActionsService.getExecution(executionId) : null,
    enabled: !!executionId,
    refetchInterval: (query) => {
      // Poll while execution is in progress
      const data = query.state.data;
      if (data && (data.status === 'pending' || data.status === 'executing')) {
        return 2000; // Poll every 2 seconds
      }
      return false;
    },
  });
}

// ============================================================================
// HELPER HOOKS
// ============================================================================

/**
 * Helper hook for action button UI state
 */
export function useActionButtonState(actionType: InsightActionType | null) {
  const metadata = useActionMetadata(actionType);
  const executeAction = useExecuteAction();
  const bulkAction = useBulkAction();

  return {
    isLoading: executeAction.isPending || bulkAction.isPending,
    metadata: metadata.data,
    execute: executeAction.mutate,
    executeBulk: bulkAction.mutate,
    error: executeAction.error || bulkAction.error,
  };
}

/**
 * Hook for managing selected leads for bulk actions
 */
export function useLeadSelection() {
  const queryClient = useQueryClient();

  // This could be enhanced with zustand or context for more complex state management
  // For now, we'll use a simple approach

  return {
    // These would be managed by the parent component state
    // This hook provides the action execution logic
    executeBulkAction: useBulkAction(),
    executeAction: useExecuteAction(),
  };
}

/**
 * Get action icon and color helpers
 */
export function useActionStyles() {
  return {
    getIconName: (actionType: InsightActionType): string => {
      const metadata = InsightActionsService.getActionMetadata(actionType);
      return metadata?.icon || 'activity';
    },
    getColor: (actionType: InsightActionType): string => {
      const metadata = InsightActionsService.getActionMetadata(actionType);
      return metadata?.color || 'gray';
    },
    getLabel: (actionType: InsightActionType): string => {
      const metadata = InsightActionsService.getActionMetadata(actionType);
      return metadata?.label || actionType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    },
  };
}

// ============================================================================
// ACTION MUTATIONS COMBINED HOOK
// ============================================================================

/**
 * Combined mutations hook for actions
 */
export function useInsightActionMutations() {
  return {
    executeAction: useExecuteAction(),
    executeBulkAction: useBulkAction(),
    cancelAction: useCancelAction(),
  };
}
