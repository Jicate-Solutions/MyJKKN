// hooks/admission/use-voice-broadcast.ts
// React Query hooks for Voice Broadcast campaigns

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  VoiceBroadcastService,
  type BroadcastFilters,
  type BroadcastLogFilters,
  type CreateBroadcastInput,
  type UpdateBroadcastInput,
} from '@/lib/services/telephony/voice-broadcast-service';

// ============================================================================
// QUERY KEYS
// ============================================================================

export const voiceBroadcastKeys = {
  all: ['voice-broadcast'] as const,
  campaigns: () => [...voiceBroadcastKeys.all, 'campaigns'] as const,
  campaignsList: (filters: BroadcastFilters) => [...voiceBroadcastKeys.campaigns(), filters] as const,
  campaign: (id: string) => [...voiceBroadcastKeys.campaigns(), id] as const,
  logs: (campaignId: string) => [...voiceBroadcastKeys.all, 'logs', campaignId] as const,
  stats: (institutionId: string) => [...voiceBroadcastKeys.all, 'stats', institutionId] as const,
};

// ============================================================================
// HOOKS
// ============================================================================

export function useVoiceBroadcastCampaigns(filters: BroadcastFilters) {
  const query = useQuery({
    queryKey: voiceBroadcastKeys.campaignsList(filters),
    queryFn: () => VoiceBroadcastService.getCampaigns(filters),
    enabled: !!filters.institutionId,
  });

  return {
    campaigns: query.data?.campaigns || [],
    total: query.data?.total || 0,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}

export function useVoiceBroadcastCampaign(campaignId?: string) {
  const query = useQuery({
    queryKey: voiceBroadcastKeys.campaign(campaignId || ''),
    queryFn: () => VoiceBroadcastService.getCampaign(campaignId!),
    enabled: !!campaignId,
  });

  return {
    campaign: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}

export function useVoiceBroadcastLogs(campaignId: string, filters?: Partial<BroadcastLogFilters>) {
  const query = useQuery({
    queryKey: voiceBroadcastKeys.logs(campaignId),
    queryFn: () => VoiceBroadcastService.getCampaignLogs({ campaignId, ...filters }),
    enabled: !!campaignId,
  });

  return {
    logs: query.data?.logs || [],
    total: query.data?.total || 0,
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}

export function useVoiceBroadcastStats(institutionId?: string) {
  const query = useQuery({
    queryKey: voiceBroadcastKeys.stats(institutionId || ''),
    queryFn: () => VoiceBroadcastService.getStats(institutionId!),
    enabled: !!institutionId,
  });

  return {
    stats: query.data || {
      total_campaigns: 0,
      total_calls_made: 0,
      avg_answer_rate: 0,
      avg_listen_rate: 0,
      avg_press_1_rate: 0,
      total_cost: 0,
    },
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}

// ============================================================================
// MUTATIONS
// ============================================================================

export function useVoiceBroadcastMutations() {
  const queryClient = useQueryClient();

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: voiceBroadcastKeys.all });
  };

  const createCampaign = useMutation({
    mutationFn: (data: CreateBroadcastInput) => VoiceBroadcastService.createCampaign(data),
    onSuccess: () => {
      toast.success('Broadcast campaign created');
      invalidateAll();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const updateCampaign = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateBroadcastInput }) =>
      VoiceBroadcastService.updateCampaign(id, data),
    onSuccess: () => {
      toast.success('Campaign updated');
      invalidateAll();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const startCampaign = useMutation({
    mutationFn: (id: string) => VoiceBroadcastService.startCampaign(id),
    onSuccess: () => {
      toast.success('Campaign started');
      invalidateAll();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const pauseCampaign = useMutation({
    mutationFn: (id: string) => VoiceBroadcastService.pauseCampaign(id),
    onSuccess: () => {
      toast.success('Campaign paused');
      invalidateAll();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const cancelCampaign = useMutation({
    mutationFn: (id: string) => VoiceBroadcastService.cancelCampaign(id),
    onSuccess: () => {
      toast.success('Campaign cancelled');
      invalidateAll();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteCampaign = useMutation({
    mutationFn: (id: string) => VoiceBroadcastService.deleteCampaign(id),
    onSuccess: () => {
      toast.success('Campaign deleted');
      invalidateAll();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return {
    createCampaign,
    updateCampaign,
    startCampaign,
    pauseCampaign,
    cancelCampaign,
    deleteCampaign,
  };
}
