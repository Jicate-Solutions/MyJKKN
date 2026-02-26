// hooks/admission/use-voice-agents.ts
// React Query hooks for AI Voice Agents

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  VoiceAgentService,
  type VoiceAgentConfig,
  type VoiceAgentType,
  type AgentCallFilters,
} from '@/lib/services/ai/voice-agent-service';

// ============================================================================
// QUERY KEYS
// ============================================================================

export const voiceAgentKeys = {
  all: ['voice-agents'] as const,
  configs: (institutionId: string) => [...voiceAgentKeys.all, 'configs', institutionId] as const,
  calls: () => [...voiceAgentKeys.all, 'calls'] as const,
  callsList: (filters: AgentCallFilters) => [...voiceAgentKeys.calls(), filters] as const,
  callDetail: (id: string) => [...voiceAgentKeys.calls(), 'detail', id] as const,
  analytics: (institutionId: string, from?: string, to?: string) =>
    [...voiceAgentKeys.all, 'analytics', institutionId, from, to] as const,
};

// ============================================================================
// HOOKS
// ============================================================================

export function useVoiceAgentConfigs(institutionId?: string) {
  const query = useQuery({
    queryKey: voiceAgentKeys.configs(institutionId || ''),
    queryFn: () => VoiceAgentService.getAgentConfigs(institutionId!),
    enabled: !!institutionId,
  });

  return {
    configs: query.data || [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

export function useVoiceAgentCalls(filters: AgentCallFilters) {
  const query = useQuery({
    queryKey: voiceAgentKeys.callsList(filters),
    queryFn: () => VoiceAgentService.getAgentCalls(filters),
    enabled: !!filters.institutionId,
  });

  return {
    calls: query.data?.calls || [],
    total: query.data?.total || 0,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}

export function useVoiceAgentCall(callId?: string) {
  const query = useQuery({
    queryKey: voiceAgentKeys.callDetail(callId || ''),
    queryFn: () => VoiceAgentService.getAgentCall(callId!),
    enabled: !!callId,
  });

  return {
    call: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
  };
}

export function useVoiceAgentAnalytics(params: {
  institutionId?: string;
  fromDate?: string;
  toDate?: string;
}) {
  const query = useQuery({
    queryKey: voiceAgentKeys.analytics(
      params.institutionId || '',
      params.fromDate,
      params.toDate
    ),
    queryFn: () =>
      VoiceAgentService.getAnalytics({
        institutionId: params.institutionId!,
        fromDate: params.fromDate,
        toDate: params.toDate,
      }),
    enabled: !!params.institutionId,
  });

  return {
    analytics: query.data || {
      total_calls: 0,
      completed_calls: 0,
      failed_calls: 0,
      avg_duration_seconds: 0,
      qualification_rate: 0,
      interest_rate: 0,
      callback_rate: 0,
      by_agent_type: {},
      daily_calls: [],
    },
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}

// ============================================================================
// MUTATIONS
// ============================================================================

export function useVoiceAgentMutations() {
  const queryClient = useQueryClient();

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: voiceAgentKeys.all });
  };

  const initializeConfigs = useMutation({
    mutationFn: (institutionId: string) => VoiceAgentService.initializeDefaultConfigs(institutionId),
    onSuccess: () => {
      toast.success('Voice agent configs initialized');
      invalidateAll();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const updateConfig = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      VoiceAgentService.updateAgentConfig(id, data),
    onSuccess: () => {
      toast.success('Agent config updated');
      invalidateAll();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const toggleAgent = useMutation({
    mutationFn: ({ id, isEnabled }: { id: string; isEnabled: boolean }) =>
      VoiceAgentService.updateAgentConfig(id, { is_enabled: isEnabled }),
    onSuccess: (_, variables) => {
      toast.success(variables.isEnabled ? 'Agent enabled' : 'Agent disabled');
      invalidateAll();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const initiateCall = useMutation({
    mutationFn: (params: {
      agentConfigId: string;
      leadId: string;
      phoneNumber: string;
      institutionId: string;
    }) => VoiceAgentService.initiateCall(params),
    onSuccess: () => {
      toast.success('Call initiated');
      queryClient.invalidateQueries({ queryKey: voiceAgentKeys.calls() });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return {
    initializeConfigs,
    updateConfig,
    toggleAgent,
    initiateCall,
    isInitializing: initializeConfigs.isPending,
    isUpdating: updateConfig.isPending,
    isCalling: initiateCall.isPending,
  };
}

export function useAgentTypeInfo() {
  return {
    agentTypes: VoiceAgentService.getAgentTypes(),
  };
}
