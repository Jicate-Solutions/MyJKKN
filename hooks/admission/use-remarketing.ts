// hooks/admission/use-remarketing.ts
// React Query hooks for Strategic Remarketing

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  RemarketingService,
  type AudienceRuleFilters,
  type CreateAudienceRuleInput,
  type UpdateAudienceRuleInput,
  type SyncResult,
} from '@/lib/services/marketing/remarketing-service';

// ============================================================================
// QUERY KEYS
// ============================================================================

export const remarketingKeys = {
  all: ['remarketing'] as const,
  rules: () => [...remarketingKeys.all, 'rules'] as const,
  rulesList: (filters: AudienceRuleFilters) => [...remarketingKeys.rules(), filters] as const,
  adAccounts: () => [...remarketingKeys.all, 'ad-accounts'] as const,
  syncHistory: (ruleId: string) => [...remarketingKeys.all, 'sync-history', ruleId] as const,
};

// ============================================================================
// HOOKS
// ============================================================================

export function useRemarketingRules(filters: AudienceRuleFilters) {
  const query = useQuery({
    queryKey: remarketingKeys.rulesList(filters),
    queryFn: () => RemarketingService.getAudienceRules(filters),
    enabled: !!filters.institutionId,
  });

  return {
    rules: query.data || [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

export function useAdAccountStatus() {
  const query = useQuery({
    queryKey: remarketingKeys.adAccounts(),
    queryFn: () => RemarketingService.getAdAccountStatus(),
    staleTime: 5 * 60 * 1000,
  });

  return {
    accounts: query.data || [],
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}

export function useSyncHistory(ruleId?: string) {
  const query = useQuery({
    queryKey: remarketingKeys.syncHistory(ruleId || ''),
    queryFn: () => RemarketingService.getSyncHistory(ruleId!),
    enabled: !!ruleId,
  });

  return {
    history: query.data || [],
    isLoading: query.isLoading,
  };
}

// ============================================================================
// MUTATIONS
// ============================================================================

export function useRemarketingMutations() {
  const queryClient = useQueryClient();

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: remarketingKeys.all });
  };

  const createRule = useMutation({
    mutationFn: (data: CreateAudienceRuleInput) => RemarketingService.createAudienceRule(data),
    onSuccess: () => {
      toast.success('Audience rule created');
      invalidateAll();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const updateRule = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateAudienceRuleInput }) =>
      RemarketingService.updateAudienceRule(id, data),
    onSuccess: () => {
      toast.success('Audience rule updated');
      invalidateAll();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteRule = useMutation({
    mutationFn: (id: string) => RemarketingService.deleteAudienceRule(id),
    onSuccess: () => {
      toast.success('Audience rule deleted');
      invalidateAll();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const syncAudience = useMutation<SyncResult, Error, string>({
    mutationFn: (ruleId: string) => RemarketingService.syncAudience(ruleId),
    onSuccess: (result) => {
      if (result.success) {
        toast.success(`Synced ${result.audience_size} contacts`);
      } else {
        toast.error(result.error || 'Sync failed');
      }
      invalidateAll();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return {
    createRule,
    updateRule,
    deleteRule,
    syncAudience,
    isSyncing: syncAudience.isPending,
  };
}
