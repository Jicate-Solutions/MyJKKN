// hooks/admission/use-campaign-processor.ts
// React Query hooks for campaign background job processor

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  CampaignProcessorService,
  type QueuedStep,
  type CampaignLog,
  type QueueStepInput,
  type QueueFilters,
  type LogFilters,
  type QueueStats,
  type CampaignStepStatus,
  type CampaignStepType,
} from '@/lib/services/admission/campaign-processor-service';

// Query keys
export const campaignProcessorKeys = {
  all: ['admission-campaign-processor'] as const,
  queue: () => [...campaignProcessorKeys.all, 'queue'] as const,
  queueList: (filters: QueueFilters) => [...campaignProcessorKeys.queue(), filters] as const,
  queuePending: (institutionId: string) => [...campaignProcessorKeys.queue(), 'pending', institutionId] as const,
  logs: () => [...campaignProcessorKeys.all, 'logs'] as const,
  logsList: (filters: LogFilters) => [...campaignProcessorKeys.logs(), filters] as const,
  stats: (institutionId: string) => [...campaignProcessorKeys.all, 'stats', institutionId] as const,
  executionStatus: (institutionId: string, options: { workflowId?: string; leadId?: string; executionId?: string }) =>
    [...campaignProcessorKeys.all, 'execution-status', institutionId, options] as const,
};

/**
 * Hook to fetch queued steps with filters
 */
export function useQueuedSteps(filters: QueueFilters) {
  const query = useQuery({
    queryKey: campaignProcessorKeys.queueList(filters),
    queryFn: () => CampaignProcessorService.getQueuedSteps(filters),
    enabled: !!filters.institution_id,
  });

  return {
    steps: query.data?.data || [],
    total: query.data?.total || 0,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * Hook to fetch pending steps ready for execution
 */
export function usePendingSteps(institutionId?: string, limit = 50) {
  const query = useQuery({
    queryKey: campaignProcessorKeys.queuePending(institutionId || ''),
    queryFn: () => CampaignProcessorService.getPendingSteps(institutionId, limit),
    enabled: !!institutionId,
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  return {
    steps: query.data || [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * Hook to fetch campaign logs
 */
export function useCampaignLogs(filters: LogFilters) {
  const query = useQuery({
    queryKey: campaignProcessorKeys.logsList(filters),
    queryFn: () => CampaignProcessorService.getLogs(filters),
    enabled: !!filters.institution_id,
  });

  return {
    logs: query.data?.data || [],
    total: query.data?.total || 0,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * Hook to fetch queue statistics
 */
export function useQueueStats(institutionId?: string) {
  const query = useQuery({
    queryKey: campaignProcessorKeys.stats(institutionId || ''),
    queryFn: () => CampaignProcessorService.getQueueStats(institutionId!),
    enabled: !!institutionId,
    staleTime: 30000, // 30 seconds
  });

  return {
    stats: query.data || {
      total_pending: 0,
      total_running: 0,
      total_completed: 0,
      total_failed: 0,
      completed_today: 0,
      failed_today: 0,
    } as QueueStats,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}

/**
 * Hook to fetch execution status for a workflow, lead, or execution
 */
export function useExecutionStatus(
  institutionId?: string,
  options?: { workflowId?: string; leadId?: string; executionId?: string }
) {
  const query = useQuery({
    queryKey: campaignProcessorKeys.executionStatus(institutionId || '', options || {}),
    queryFn: () => CampaignProcessorService.getExecutionStatus(institutionId!, options || {}),
    enabled: !!institutionId && !!(options?.workflowId || options?.leadId || options?.executionId),
    refetchInterval: 5000, // Refresh every 5 seconds for active executions
  });

  return {
    status: query.data || { pending: 0, running: 0, completed: 0, failed: 0, steps: [] },
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * Hook for campaign processor mutations
 */
export function useCampaignProcessorMutations() {
  const queryClient = useQueryClient();

  const invalidateQueries = (institutionId?: string) => {
    queryClient.invalidateQueries({ queryKey: campaignProcessorKeys.all });
    if (institutionId) {
      queryClient.invalidateQueries({ queryKey: campaignProcessorKeys.stats(institutionId) });
    }
  };

  const queueStep = useMutation({
    mutationFn: (input: QueueStepInput) => CampaignProcessorService.queueCampaignStep(input),
    onSuccess: (data) => {
      toast.success('Step queued successfully');
      invalidateQueries(data.institution_id);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to queue step');
    },
  });

  const queueMultipleSteps = useMutation({
    mutationFn: (steps: QueueStepInput[]) => CampaignProcessorService.queueMultipleSteps(steps),
    onSuccess: (data) => {
      toast.success(`${data.length} steps queued successfully`);
      if (data.length > 0) {
        invalidateQueries(data[0].institution_id);
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to queue steps');
    },
  });

  const cancelStep = useMutation({
    mutationFn: ({ queueId, reason, institutionId }: { queueId: string; reason?: string; institutionId: string }) =>
      CampaignProcessorService.cancelStep(queueId, reason),
    onSuccess: (_, { institutionId }) => {
      toast.success('Step cancelled');
      invalidateQueries(institutionId);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to cancel step');
    },
  });

  const skipStep = useMutation({
    mutationFn: ({ queueId, reason, institutionId }: { queueId: string; reason?: string; institutionId: string }) =>
      CampaignProcessorService.skipStep(queueId, reason),
    onSuccess: (_, { institutionId }) => {
      toast.success('Step skipped');
      invalidateQueries(institutionId);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to skip step');
    },
  });

  const retryStep = useMutation({
    mutationFn: ({ queueId, institutionId }: { queueId: string; institutionId: string }) =>
      CampaignProcessorService.retryStep(queueId),
    onSuccess: (_, { institutionId }) => {
      toast.success('Step queued for retry');
      invalidateQueries(institutionId);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to retry step');
    },
  });

  return {
    queueStep,
    queueMultipleSteps,
    cancelStep,
    skipStep,
    retryStep,
    isQueueing: queueStep.isPending || queueMultipleSteps.isPending,
    isCancelling: cancelStep.isPending,
    isSkipping: skipStep.isPending,
    isRetrying: retryStep.isPending,
  };
}

/**
 * Hook for campaign processor helper data
 */
export function useCampaignProcessorHelpers() {
  return {
    stepTypes: CampaignProcessorService.getStepTypes(),
    statusTypes: CampaignProcessorService.getStatusTypes(),
    calculateExecuteAfter: CampaignProcessorService.calculateExecuteAfter,
  };
}

/**
 * Hook for real-time queue updates (using Supabase realtime)
 */
export function useQueueRealtime(institutionId?: string) {
  const queryClient = useQueryClient();

  // This could be enhanced to use Supabase realtime subscriptions
  // For now, we rely on polling via refetchInterval in the query hooks

  const refresh = () => {
    if (institutionId) {
      queryClient.invalidateQueries({
        queryKey: campaignProcessorKeys.queuePending(institutionId),
      });
      queryClient.invalidateQueries({
        queryKey: campaignProcessorKeys.stats(institutionId),
      });
    }
  };

  return { refresh };
}
