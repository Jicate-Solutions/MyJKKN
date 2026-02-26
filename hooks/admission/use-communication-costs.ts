// hooks/admission/use-communication-costs.ts
// React Query hooks for Communication Cost Tracking

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  CommunicationCostService,
  type CostFilters,
  type LogCostInput,
} from '@/lib/services/admission/communication-cost-service';

// ============================================================================
// QUERY KEYS
// ============================================================================

export const communicationCostKeys = {
  all: ['communication-costs'] as const,
  dashboard: (institutionId: string) => [...communicationCostKeys.all, 'dashboard', institutionId] as const,
  entries: (filters: CostFilters) => [...communicationCostKeys.all, 'entries', filters] as const,
  monthly: (institutionId: string, months?: number) =>
    [...communicationCostKeys.all, 'monthly', institutionId, months] as const,
  channels: (institutionId: string, from?: string, to?: string) =>
    [...communicationCostKeys.all, 'channels', institutionId, from, to] as const,
};

// ============================================================================
// HOOKS
// ============================================================================

export function useCostDashboard(institutionId?: string) {
  const query = useQuery({
    queryKey: communicationCostKeys.dashboard(institutionId || ''),
    queryFn: () => CommunicationCostService.getDashboard(institutionId!),
    enabled: !!institutionId,
    staleTime: 60000,
  });

  return {
    dashboard: query.data || {
      total_spend: 0,
      monthly_spend: 0,
      daily_average: 0,
      by_channel: [],
      monthly_trend: [],
      top_cost_items: [],
    },
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}

export function useCostEntries(filters: CostFilters) {
  const query = useQuery({
    queryKey: communicationCostKeys.entries(filters),
    queryFn: () => CommunicationCostService.getCosts(filters),
    enabled: !!filters.institutionId,
  });

  return {
    entries: query.data?.entries || [],
    total: query.data?.total || 0,
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}

export function useMonthlyCosts(institutionId?: string, months?: number) {
  const query = useQuery({
    queryKey: communicationCostKeys.monthly(institutionId || '', months),
    queryFn: () =>
      CommunicationCostService.getMonthlySummary({
        institutionId: institutionId!,
        months,
      }),
    enabled: !!institutionId,
  });

  return {
    monthly: query.data || [],
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}

export function useChannelCosts(params: {
  institutionId?: string;
  fromDate?: string;
  toDate?: string;
}) {
  const query = useQuery({
    queryKey: communicationCostKeys.channels(
      params.institutionId || '',
      params.fromDate,
      params.toDate
    ),
    queryFn: () =>
      CommunicationCostService.getChannelBreakdown({
        institutionId: params.institutionId!,
        fromDate: params.fromDate,
        toDate: params.toDate,
      }),
    enabled: !!params.institutionId,
  });

  return {
    channels: query.data || [],
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}

// ============================================================================
// MUTATIONS
// ============================================================================

export function useCostMutations() {
  const queryClient = useQueryClient();

  const logCost = useMutation({
    mutationFn: (input: LogCostInput) => CommunicationCostService.logCost(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: communicationCostKeys.all });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return { logCost };
}

export function useCostHelpers() {
  return {
    defaultUnitCosts: CommunicationCostService.getDefaultUnitCosts(),
    channelLabels: CommunicationCostService.getChannelLabels(),
  };
}
