// hooks/admission/use-re-engagement.ts
// React Query hooks for Cold Lead Re-engagement module

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ReEngagementService,
  type ColdLeadFilters,
  type ReEngagementStats,
} from '@/lib/services/admission/re-engagement-service';

// ============================================================================
// QUERY KEYS
// ============================================================================

export const reEngagementKeys = {
  all: ['re-engagement'] as const,
  coldLeads: (filters: ColdLeadFilters) =>
    [...reEngagementKeys.all, 'cold-leads', filters] as const,
  campaigns: (institutionId: string) =>
    [...reEngagementKeys.all, 'campaigns', institutionId] as const,
  stats: (institutionId: string) =>
    [...reEngagementKeys.all, 'stats', institutionId] as const,
};

// ============================================================================
// QUERY HOOKS
// ============================================================================

/**
 * Fetch cold/dormant leads
 */
export function useColdLeads(filters: ColdLeadFilters) {
  const query = useQuery({
    queryKey: reEngagementKeys.coldLeads(filters),
    queryFn: () => ReEngagementService.getColdLeads(filters),
    enabled: !!filters.institutionId,
  });

  return {
    leads: query.data?.leads || [],
    total: query.data?.total || 0,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * Fetch re-engagement campaigns (drip sequences)
 */
export function useReEngagementCampaigns(institutionId?: string) {
  const query = useQuery({
    queryKey: reEngagementKeys.campaigns(institutionId || ''),
    queryFn: () => ReEngagementService.getCampaigns(institutionId!),
    enabled: !!institutionId,
  });

  return {
    campaigns: query.data || [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * Fetch re-engagement stats
 */
export function useReEngagementStats(institutionId?: string) {
  const query = useQuery({
    queryKey: reEngagementKeys.stats(institutionId || ''),
    queryFn: () => ReEngagementService.getStats(institutionId!),
    enabled: !!institutionId,
    staleTime: 60000,
  });

  return {
    stats: query.data || {
      totalColdLeads: 0,
      veryColdLeads: 0,
      neverEngaged: 0,
      activeCampaigns: 0,
      dormantLeads: 0,
    } as ReEngagementStats,
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}

// ============================================================================
// MUTATION HOOKS
// ============================================================================

/**
 * Mark a cold lead as hot (re-engaged)
 */
export function useMarkLeadAsHot() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (leadId: string) => ReEngagementService.markAsHot(leadId),
    onSuccess: () => {
      toast.success('Lead marked as hot');
      queryClient.invalidateQueries({ queryKey: reEngagementKeys.all });
      queryClient.invalidateQueries({ queryKey: ['admission-leads'] });
      queryClient.invalidateQueries({ queryKey: ['counselor-daily-view'] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to mark lead as hot');
    },
  });
}
