// hooks/admission/use-parent-communication.ts
// React Query hooks for Parent Communication module

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ParentCommunicationService,
  type ParentCommFilters,
  type ParentCommStats,
  type LeadWithParents,
  type CommunicationLogEntry,
} from '@/lib/services/admission/parent-communication-service';

// ============================================================================
// QUERY KEYS
// ============================================================================

export const parentCommKeys = {
  all: ['parent-communication'] as const,
  leads: (filters: ParentCommFilters) =>
    [...parentCommKeys.all, 'leads', filters] as const,
  logs: (institutionId: string, leadId?: string) =>
    [...parentCommKeys.all, 'logs', institutionId, leadId] as const,
  stats: (institutionId: string) =>
    [...parentCommKeys.all, 'stats', institutionId] as const,
};

// ============================================================================
// QUERY HOOKS
// ============================================================================

/**
 * Fetch leads with parent information
 */
export function useLeadsWithParents(filters: ParentCommFilters) {
  const query = useQuery({
    queryKey: parentCommKeys.leads(filters),
    queryFn: () => ParentCommunicationService.getLeadsWithParentInfo(filters),
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
 * Fetch communication logs (SMS + WhatsApp)
 */
export function useParentCommLogs(
  institutionId?: string,
  leadId?: string,
  limit?: number
) {
  const query = useQuery({
    queryKey: parentCommKeys.logs(institutionId || '', leadId),
    queryFn: () =>
      ParentCommunicationService.getCommunicationLogs(institutionId!, {
        limit: limit || 50,
        leadId,
      }),
    enabled: !!institutionId,
  });

  return {
    logs: query.data || [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * Fetch parent communication stats
 */
export function useParentCommStats(institutionId?: string) {
  const query = useQuery({
    queryKey: parentCommKeys.stats(institutionId || ''),
    queryFn: () => ParentCommunicationService.getStats(institutionId!),
    enabled: !!institutionId,
    staleTime: 60000,
  });

  return {
    stats: query.data || {
      totalLeadsWithParentInfo: 0,
      totalLeadsWithoutParentInfo: 0,
      totalParentContacts: 0,
      recentCommunications: 0,
      avgEngagement: 0,
    } as ParentCommStats,
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}

// ============================================================================
// MUTATION HOOKS
// ============================================================================

/**
 * Mutation to update parent info on a lead
 */
export function useUpdateParentInfo() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      leadId,
      parentData,
    }: {
      leadId: string;
      parentData: {
        parent_name: string;
        parent_phone: string;
        parent_email?: string;
        parent_opted_in?: boolean;
      };
    }) => ParentCommunicationService.updateParentInfo(leadId, parentData),
    onSuccess: () => {
      toast.success('Parent information saved successfully');
      queryClient.invalidateQueries({ queryKey: parentCommKeys.all });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to save parent information');
    },
  });
}
