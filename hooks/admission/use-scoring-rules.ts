// hooks/admission/use-scoring-rules.ts
// React Query hooks for admission scoring rules

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ScoringRulesService,
  type ScoringRule,
  type ScoringRuleConfig,
  type CreateScoringRuleInput,
  type UpdateScoringRuleInput,
} from '@/lib/services/admission/scoring-rules-service';

// Query keys
export const scoringRulesKeys = {
  all: ['scoring-rules'] as const,
  lists: () => [...scoringRulesKeys.all, 'list'] as const,
  list: (institutionId: string) => [...scoringRulesKeys.lists(), institutionId] as const,
  active: (institutionId: string) => [...scoringRulesKeys.all, 'active', institutionId] as const,
  details: () => [...scoringRulesKeys.all, 'detail'] as const,
  detail: (id: string) => [...scoringRulesKeys.details(), id] as const,
};

/**
 * Hook to fetch all scoring rules for an institution
 */
export function useScoringRules(institutionId?: string) {
  const query = useQuery({
    queryKey: scoringRulesKeys.list(institutionId || ''),
    queryFn: () => ScoringRulesService.getScoringRules(institutionId!),
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
 * Hook to fetch the active scoring rule for an institution
 */
export function useActiveScoringRule(institutionId?: string) {
  const query = useQuery({
    queryKey: scoringRulesKeys.active(institutionId || ''),
    queryFn: () => ScoringRulesService.getActiveScoringRule(institutionId!),
    enabled: !!institutionId,
  });

  return {
    rule: query.data,
    config: query.data?.criteria as ScoringRuleConfig | undefined,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * Hook to fetch a single scoring rule by ID
 */
export function useScoringRule(id?: string) {
  const query = useQuery({
    queryKey: scoringRulesKeys.detail(id || ''),
    queryFn: () => ScoringRulesService.getScoringRule(id!),
    enabled: !!id,
  });

  return {
    rule: query.data,
    config: query.data?.criteria as ScoringRuleConfig | undefined,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * Hook for scoring rule mutations (create, update, delete, toggle)
 */
export function useScoringRuleMutations() {
  const queryClient = useQueryClient();

  const invalidateQueries = (institutionId?: string) => {
    queryClient.invalidateQueries({ queryKey: scoringRulesKeys.all });
    if (institutionId) {
      queryClient.invalidateQueries({ queryKey: scoringRulesKeys.list(institutionId) });
      queryClient.invalidateQueries({ queryKey: scoringRulesKeys.active(institutionId) });
    }
  };

  const createRule = useMutation({
    mutationFn: (input: CreateScoringRuleInput) => ScoringRulesService.createScoringRule(input),
    onSuccess: (data) => {
      toast.success('Scoring rule created successfully');
      invalidateQueries(data.institution_id);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create scoring rule');
    },
  });

  const updateRule = useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateScoringRuleInput }) =>
      ScoringRulesService.updateScoringRule(id, input),
    onSuccess: (data) => {
      toast.success('Scoring rule updated successfully');
      invalidateQueries(data.institution_id);
      queryClient.invalidateQueries({ queryKey: scoringRulesKeys.detail(data.id) });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update scoring rule');
    },
  });

  const deleteRule = useMutation({
    mutationFn: ({ id, institutionId }: { id: string; institutionId: string }) =>
      ScoringRulesService.deleteScoringRule(id),
    onSuccess: (_, { institutionId }) => {
      toast.success('Scoring rule deleted');
      invalidateQueries(institutionId);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete scoring rule');
    },
  });

  const toggleStatus = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      ScoringRulesService.toggleRuleStatus(id, isActive),
    onSuccess: (data) => {
      toast.success(data.is_active ? 'Scoring rule activated' : 'Scoring rule deactivated');
      invalidateQueries(data.institution_id);
      queryClient.invalidateQueries({ queryKey: scoringRulesKeys.detail(data.id) });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to toggle rule status');
    },
  });

  return {
    createRule,
    updateRule,
    deleteRule,
    toggleStatus,
    isCreating: createRule.isPending,
    isUpdating: updateRule.isPending,
    isDeleting: deleteRule.isPending,
    isToggling: toggleStatus.isPending,
  };
}

/**
 * Hook to get default scoring rule configuration
 */
export function useDefaultScoringConfig() {
  return ScoringRulesService.getDefaultConfig();
}

/**
 * Hook to calculate score for a lead
 */
export function useCalculateScore(config?: ScoringRuleConfig) {
  const calculate = (
    engagementData: Record<string, number>,
    qualityData: Record<string, number>
  ) => {
    if (!config) {
      return { engagementScore: 0, qualityScore: 0, totalScore: 0, category: 'Unknown' };
    }
    return ScoringRulesService.calculateScore(config, engagementData, qualityData);
  };

  return { calculate };
}
