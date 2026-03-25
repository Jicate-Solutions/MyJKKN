// hooks/admission/use-drip-executor.ts
// React Query hooks for Drip Sequence Executor

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  DripExecutorService,
  type DripSequence,
  type DripSequenceFilters,
  type DripSequenceStats,
  type StartDripSequenceInput,
} from '@/lib/services/admission/drip-executor-service';

// ============================================================================
// QUERY KEYS
// ============================================================================

export const dripExecutorKeys = {
  all: ['drip-executor'] as const,
  sequences: (filters: DripSequenceFilters) =>
    [...dripExecutorKeys.all, 'sequences', filters] as const,
  sequence: (id: string) => [...dripExecutorKeys.all, 'sequence', id] as const,
  stats: (institutionId: string) =>
    [...dripExecutorKeys.all, 'stats', institutionId] as const,
  leadSequences: (leadId: string) =>
    [...dripExecutorKeys.all, 'lead', leadId] as const,
  pending: () => [...dripExecutorKeys.all, 'pending'] as const,
};

// ============================================================================
// QUERY HOOKS
// ============================================================================

/**
 * Get active drip sequences for an institution
 */
export function useActiveSequences(filters: DripSequenceFilters) {
  const query = useQuery({
    queryKey: dripExecutorKeys.sequences(filters),
    queryFn: () => DripExecutorService.getActiveSequences(filters),
    enabled: !!filters.institution_id,
    staleTime: 30000, // 30 seconds
    refetchInterval: 60000, // Refresh every minute
  });

  return {
    sequences: query.data || [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * Get detailed status of a specific drip sequence
 */
export function useDripStatus(sequenceId: string) {
  const query = useQuery({
    queryKey: dripExecutorKeys.sequence(sequenceId),
    queryFn: () => DripExecutorService.getDripStatus(sequenceId),
    enabled: !!sequenceId,
    staleTime: 10000, // 10 seconds
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  return {
    sequence: query.data?.sequence,
    steps: query.data?.steps || [],
    logs: query.data?.logs || [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * Get drip sequence statistics for an institution
 */
export function useDripStats(institutionId: string) {
  const query = useQuery({
    queryKey: dripExecutorKeys.stats(institutionId),
    queryFn: () => DripExecutorService.getSequenceStats(institutionId),
    enabled: !!institutionId,
    staleTime: 60000, // 1 minute
  });

  return {
    stats: query.data || {
      total: 0,
      active: 0,
      paused: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
    } as DripSequenceStats,
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}

/**
 * Get sequences for a specific lead
 */
export function useLeadSequences(leadId: string) {
  const query = useQuery({
    queryKey: dripExecutorKeys.leadSequences(leadId),
    queryFn: () => DripExecutorService.getSequencesForLead(leadId),
    enabled: !!leadId,
    staleTime: 30000,
  });

  return {
    sequences: query.data || [],
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}

/**
 * Check if a lead has an active sequence for a workflow
 */
export function useHasActiveSequence(leadId: string, workflowId: string) {
  const query = useQuery({
    queryKey: [...dripExecutorKeys.leadSequences(leadId), workflowId],
    queryFn: () => DripExecutorService.hasActiveSequence(leadId, workflowId),
    enabled: !!leadId && !!workflowId,
    staleTime: 30000,
  });

  return {
    hasActive: query.data || false,
    isLoading: query.isLoading,
  };
}

// ============================================================================
// MUTATION HOOKS
// ============================================================================

/**
 * Mutations for drip sequence management
 */
export function useDripMutations() {
  const queryClient = useQueryClient();

  const startSequence = useMutation({
    mutationFn: (input: StartDripSequenceInput) =>
      DripExecutorService.startDripSequence(input),
    onSuccess: (data, variables) => {
      toast.success('Drip sequence started');
      // Invalidate relevant queries
      queryClient.invalidateQueries({
        queryKey: dripExecutorKeys.sequences({ institution_id: variables.institution_id }),
      });
      queryClient.invalidateQueries({
        queryKey: dripExecutorKeys.stats(variables.institution_id),
      });
      queryClient.invalidateQueries({
        queryKey: dripExecutorKeys.leadSequences(variables.lead_id),
      });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to start drip sequence');
    },
  });

  const pauseSequence = useMutation({
    mutationFn: (sequenceId: string) => DripExecutorService.pauseDrip(sequenceId),
    onSuccess: (data: DripSequence) => {
      toast.success('Drip sequence paused');
      queryClient.invalidateQueries({
        queryKey: dripExecutorKeys.sequence(data.id),
      });
      queryClient.invalidateQueries({
        queryKey: dripExecutorKeys.all,
      });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to pause sequence');
    },
  });

  const resumeSequence = useMutation({
    mutationFn: (sequenceId: string) => DripExecutorService.resumeDrip(sequenceId),
    onSuccess: (data: DripSequence) => {
      toast.success('Drip sequence resumed');
      queryClient.invalidateQueries({
        queryKey: dripExecutorKeys.sequence(data.id),
      });
      queryClient.invalidateQueries({
        queryKey: dripExecutorKeys.all,
      });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to resume sequence');
    },
  });

  const skipStep = useMutation({
    mutationFn: ({
      sequenceId,
      userId,
      reason,
    }: {
      sequenceId: string;
      userId?: string;
      reason?: string;
    }) => DripExecutorService.skipStep(sequenceId, userId, reason),
    onSuccess: (data: DripSequence) => {
      toast.success('Step skipped');
      queryClient.invalidateQueries({
        queryKey: dripExecutorKeys.sequence(data.id),
      });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to skip step');
    },
  });

  const cancelSequence = useMutation({
    mutationFn: ({ sequenceId, reason }: { sequenceId: string; reason?: string }) =>
      DripExecutorService.cancelDrip(sequenceId, reason),
    onSuccess: (_, variables) => {
      toast.success('Drip sequence cancelled');
      queryClient.invalidateQueries({
        queryKey: dripExecutorKeys.sequence(variables.sequenceId),
      });
      queryClient.invalidateQueries({
        queryKey: dripExecutorKeys.all,
      });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to cancel sequence');
    },
  });

  return {
    startSequence,
    pauseSequence,
    resumeSequence,
    skipStep,
    cancelSequence,
  };
}

// ============================================================================
// UTILITY HOOKS
// ============================================================================

/**
 * Combined hook for drip executor with all common operations
 */
export function useDripExecutor(institutionId: string) {
  const {
    sequences,
    isLoading: sequencesLoading,
    refetch: refetchSequences,
  } = useActiveSequences({ institution_id: institutionId });

  const { stats, isLoading: statsLoading, refetch: refetchStats } = useDripStats(institutionId);

  const mutations = useDripMutations();

  const refetchAll = async () => {
    await Promise.all([refetchSequences(), refetchStats()]);
  };

  return {
    // Data
    sequences,
    stats,
    // Loading states
    isLoading: sequencesLoading || statsLoading,
    // Actions
    startSequence: mutations.startSequence.mutateAsync,
    pauseSequence: mutations.pauseSequence.mutateAsync,
    resumeSequence: mutations.resumeSequence.mutateAsync,
    skipStep: mutations.skipStep.mutateAsync,
    cancelSequence: mutations.cancelSequence.mutateAsync,
    // Mutation states
    isStarting: mutations.startSequence.isPending,
    isPausing: mutations.pauseSequence.isPending,
    isResuming: mutations.resumeSequence.isPending,
    isSkipping: mutations.skipStep.isPending,
    isCancelling: mutations.cancelSequence.isPending,
    // Refetch
    refetchAll,
  };
}
