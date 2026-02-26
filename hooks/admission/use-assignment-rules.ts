// hooks/admission/use-assignment-rules.ts
// React Query hooks for admission assignment rules

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  AssignmentRulesService,
  type AssignmentRule,
  type CreateAssignmentRuleInput,
  type UpdateAssignmentRuleInput,
  type AssignmentStats,
} from '@/lib/services/admission/assignment-rules-service';

// Query keys
export const assignmentRulesKeys = {
  all: ['assignment-rules'] as const,
  lists: () => [...assignmentRulesKeys.all, 'list'] as const,
  list: (institutionId: string) => [...assignmentRulesKeys.lists(), institutionId] as const,
  active: (institutionId: string) => [...assignmentRulesKeys.all, 'active', institutionId] as const,
  details: () => [...assignmentRulesKeys.all, 'detail'] as const,
  detail: (id: string) => [...assignmentRulesKeys.details(), id] as const,
  stats: (institutionId: string) => [...assignmentRulesKeys.all, 'stats', institutionId] as const,
};

/**
 * Hook to fetch all assignment rules for an institution
 */
export function useAssignmentRules(institutionId?: string) {
  const query = useQuery({
    queryKey: assignmentRulesKeys.list(institutionId || ''),
    queryFn: () => AssignmentRulesService.getAssignmentRules(institutionId!),
    enabled: !!institutionId,
  });

  return {
    rules: query.data || [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * Hook to fetch active assignment rules for an institution
 */
export function useActiveAssignmentRules(institutionId?: string) {
  const query = useQuery({
    queryKey: assignmentRulesKeys.active(institutionId || ''),
    queryFn: () => AssignmentRulesService.getActiveAssignmentRules(institutionId!),
    enabled: !!institutionId,
  });

  return {
    rules: query.data || [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * Hook to fetch a single assignment rule by ID
 */
export function useAssignmentRule(id?: string) {
  const query = useQuery({
    queryKey: assignmentRulesKeys.detail(id || ''),
    queryFn: () => AssignmentRulesService.getAssignmentRule(id!),
    enabled: !!id,
  });

  return {
    rule: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * Hook to fetch assignment statistics
 */
export function useAssignmentStats(institutionId?: string) {
  const query = useQuery({
    queryKey: assignmentRulesKeys.stats(institutionId || ''),
    queryFn: () => AssignmentRulesService.getAssignmentStats(institutionId!),
    enabled: !!institutionId,
    staleTime: 30000, // 30 seconds
  });

  return {
    stats: query.data || {
      totalRules: 0,
      activeRules: 0,
      leadsAssignedToday: 0,
      avgAssignmentTime: '-',
      unassignedLeads: 0,
    } as AssignmentStats,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}

/**
 * Hook for assignment rule mutations (create, update, delete, toggle)
 */
export function useAssignmentRuleMutations() {
  const queryClient = useQueryClient();

  const invalidateQueries = (institutionId?: string) => {
    queryClient.invalidateQueries({ queryKey: assignmentRulesKeys.all });
    if (institutionId) {
      queryClient.invalidateQueries({ queryKey: assignmentRulesKeys.list(institutionId) });
      queryClient.invalidateQueries({ queryKey: assignmentRulesKeys.active(institutionId) });
      queryClient.invalidateQueries({ queryKey: assignmentRulesKeys.stats(institutionId) });
    }
  };

  const createRule = useMutation({
    mutationFn: (input: CreateAssignmentRuleInput) => AssignmentRulesService.createAssignmentRule(input),
    onSuccess: (data) => {
      toast.success('Assignment rule created successfully');
      invalidateQueries(data.institution_id);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create assignment rule');
    },
  });

  const updateRule = useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateAssignmentRuleInput }) =>
      AssignmentRulesService.updateAssignmentRule(id, input),
    onSuccess: (data) => {
      toast.success('Assignment rule updated successfully');
      invalidateQueries(data.institution_id);
      queryClient.invalidateQueries({ queryKey: assignmentRulesKeys.detail(data.id) });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update assignment rule');
    },
  });

  const deleteRule = useMutation({
    mutationFn: ({ id, institutionId }: { id: string; institutionId: string }) =>
      AssignmentRulesService.deleteAssignmentRule(id),
    onSuccess: (_, { institutionId }) => {
      toast.success('Assignment rule deleted');
      invalidateQueries(institutionId);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete assignment rule');
    },
  });

  const toggleStatus = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      AssignmentRulesService.toggleRuleStatus(id, isActive),
    onSuccess: (data) => {
      toast.success(data.is_active ? 'Rule activated' : 'Rule paused');
      invalidateQueries(data.institution_id);
      queryClient.invalidateQueries({ queryKey: assignmentRulesKeys.detail(data.id) });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to toggle rule status');
    },
  });

  const updatePriorities = useMutation({
    mutationFn: (rules: { id: string; priority: number }[]) =>
      AssignmentRulesService.updatePriorities(rules),
    onSuccess: () => {
      toast.success('Rule priorities updated');
      queryClient.invalidateQueries({ queryKey: assignmentRulesKeys.all });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update priorities');
    },
  });

  return {
    createRule,
    updateRule,
    deleteRule,
    toggleStatus,
    updatePriorities,
    isCreating: createRule.isPending,
    isUpdating: updateRule.isPending,
    isDeleting: deleteRule.isPending,
    isToggling: toggleStatus.isPending,
  };
}
