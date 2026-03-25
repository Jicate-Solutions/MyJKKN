// hooks/admission/use-campaign-monitoring.ts
// Campaign Monitoring Hooks - Real-time stats and execution tracking

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useCallback, useState } from 'react';
import {
  CampaignMonitoringService,
  type CampaignStats,
  type DeliveryMetrics,
  type ActiveSequence,
  type ExecutionLog,
  type RealtimeUpdate,
  type CampaignDetail,
} from '@/lib/services/admission/campaign-monitoring-service';

// Query keys for cache management
export const campaignMonitoringKeys = {
  all: ['campaign-monitoring'] as const,
  stats: (institutionId: string) => [...campaignMonitoringKeys.all, 'stats', institutionId] as const,
  delivery: (institutionId: string) => [...campaignMonitoringKeys.all, 'delivery', institutionId] as const,
  sequences: (institutionId: string) => [...campaignMonitoringKeys.all, 'sequences', institutionId] as const,
  logs: (institutionId: string, limit?: number) =>
    [...campaignMonitoringKeys.all, 'logs', institutionId, limit] as const,
  campaigns: (institutionId: string) => [...campaignMonitoringKeys.all, 'campaigns', institutionId] as const,
  campaign: (id: string) => [...campaignMonitoringKeys.all, 'campaign', id] as const,
};

// ============================================================================
// CAMPAIGN STATS HOOK
// ============================================================================

interface UseCampaignStatsResult {
  stats: CampaignStats | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

export function useCampaignStats(institutionId: string | undefined): UseCampaignStatsResult {
  const query = useQuery({
    queryKey: campaignMonitoringKeys.stats(institutionId || ''),
    queryFn: () => CampaignMonitoringService.getCampaignStats(institutionId!),
    enabled: !!institutionId,
    staleTime: 30000, // 30 seconds - refresh frequently for monitoring
    refetchInterval: 60000, // Auto-refresh every minute
  });

  return {
    stats: query.data || null,
    isLoading: query.isLoading,
    error: query.error as Error | null,
    refetch: query.refetch,
  };
}

// ============================================================================
// DELIVERY METRICS HOOK
// ============================================================================

interface UseDeliveryMetricsResult {
  metrics: DeliveryMetrics | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

export function useDeliveryMetrics(institutionId: string | undefined): UseDeliveryMetricsResult {
  const query = useQuery({
    queryKey: campaignMonitoringKeys.delivery(institutionId || ''),
    queryFn: () => CampaignMonitoringService.getDeliveryMetrics(institutionId!),
    enabled: !!institutionId,
    staleTime: 30000,
    refetchInterval: 60000,
  });

  return {
    metrics: query.data || null,
    isLoading: query.isLoading,
    error: query.error as Error | null,
    refetch: query.refetch,
  };
}

// ============================================================================
// ACTIVE SEQUENCES HOOK
// ============================================================================

interface UseActiveSequencesResult {
  sequences: ActiveSequence[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

export function useActiveSequences(institutionId: string | undefined): UseActiveSequencesResult {
  const query = useQuery({
    queryKey: campaignMonitoringKeys.sequences(institutionId || ''),
    queryFn: () => CampaignMonitoringService.getActiveSequences(institutionId!),
    enabled: !!institutionId,
    staleTime: 30000,
    refetchInterval: 60000,
  });

  return {
    sequences: query.data || [],
    isLoading: query.isLoading,
    error: query.error as Error | null,
    refetch: query.refetch,
  };
}

// ============================================================================
// EXECUTION LOGS HOOK
// ============================================================================

interface UseExecutionLogsResult {
  logs: ExecutionLog[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

export function useExecutionLogs(
  institutionId: string | undefined,
  limit = 50
): UseExecutionLogsResult {
  const query = useQuery({
    queryKey: campaignMonitoringKeys.logs(institutionId || '', limit),
    queryFn: () => CampaignMonitoringService.getExecutionLogs(institutionId!, limit),
    enabled: !!institutionId,
    staleTime: 10000, // 10 seconds - logs should be more fresh
    refetchInterval: 30000, // Auto-refresh every 30 seconds
  });

  return {
    logs: query.data || [],
    isLoading: query.isLoading,
    error: query.error as Error | null,
    refetch: query.refetch,
  };
}

// ============================================================================
// REAL-TIME UPDATES HOOK
// ============================================================================

interface UseRealtimeUpdatesResult {
  lastUpdate: RealtimeUpdate | null;
  isConnected: boolean;
}

export function useRealtimeUpdates(institutionId: string | undefined): UseRealtimeUpdatesResult {
  const queryClient = useQueryClient();
  const [lastUpdate, setLastUpdate] = useState<RealtimeUpdate | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  const handleUpdate = useCallback(
    (update: RealtimeUpdate) => {
      setLastUpdate(update);

      // Invalidate relevant queries based on update type
      switch (update.type) {
        case 'campaign_status_changed':
          queryClient.invalidateQueries({
            queryKey: campaignMonitoringKeys.stats(institutionId!),
          });
          queryClient.invalidateQueries({
            queryKey: campaignMonitoringKeys.campaigns(institutionId!),
          });
          if (update.campaignId) {
            queryClient.invalidateQueries({
              queryKey: campaignMonitoringKeys.campaign(update.campaignId),
            });
          }
          break;
        case 'execution_completed':
          queryClient.invalidateQueries({
            queryKey: campaignMonitoringKeys.logs(institutionId!),
          });
          queryClient.invalidateQueries({
            queryKey: campaignMonitoringKeys.delivery(institutionId!),
          });
          queryClient.invalidateQueries({
            queryKey: campaignMonitoringKeys.sequences(institutionId!),
          });
          break;
        case 'stats_updated':
          queryClient.invalidateQueries({
            queryKey: campaignMonitoringKeys.all,
          });
          break;
      }
    },
    [queryClient, institutionId]
  );

  useEffect(() => {
    if (!institutionId) return;

    setIsConnected(true);
    const unsubscribe = CampaignMonitoringService.subscribeToUpdates(institutionId, handleUpdate);

    return () => {
      setIsConnected(false);
      unsubscribe();
    };
  }, [institutionId, handleUpdate]);

  return {
    lastUpdate,
    isConnected,
  };
}

// ============================================================================
// CAMPAIGNS LIST HOOK
// ============================================================================

interface UseCampaignsResult {
  campaigns: CampaignDetail[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

export function useCampaigns(institutionId: string | undefined): UseCampaignsResult {
  const query = useQuery({
    queryKey: campaignMonitoringKeys.campaigns(institutionId || ''),
    queryFn: () => CampaignMonitoringService.getCampaigns(institutionId!),
    enabled: !!institutionId,
    staleTime: 60000,
  });

  return {
    campaigns: query.data || [],
    isLoading: query.isLoading,
    error: query.error as Error | null,
    refetch: query.refetch,
  };
}

// ============================================================================
// SINGLE CAMPAIGN HOOK
// ============================================================================

interface UseCampaignResult {
  campaign: CampaignDetail | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

export function useCampaign(campaignId: string | undefined): UseCampaignResult {
  const query = useQuery({
    queryKey: campaignMonitoringKeys.campaign(campaignId || ''),
    queryFn: () => CampaignMonitoringService.getCampaignDetail(campaignId!),
    enabled: !!campaignId,
    staleTime: 30000,
  });

  return {
    campaign: query.data || null,
    isLoading: query.isLoading,
    error: query.error as Error | null,
    refetch: query.refetch,
  };
}

// ============================================================================
// COMBINED DASHBOARD HOOK
// ============================================================================

interface UseCampaignMonitoringDashboardResult {
  stats: CampaignStats | null;
  deliveryMetrics: DeliveryMetrics | null;
  activeSequences: ActiveSequence[];
  recentLogs: ExecutionLog[];
  isLoading: boolean;
  isConnected: boolean;
  lastUpdate: RealtimeUpdate | null;
  refetchAll: () => void;
}

export function useCampaignMonitoringDashboard(
  institutionId: string | undefined
): UseCampaignMonitoringDashboardResult {
  const { stats, isLoading: statsLoading, refetch: refetchStats } = useCampaignStats(institutionId);
  const {
    metrics: deliveryMetrics,
    isLoading: metricsLoading,
    refetch: refetchMetrics,
  } = useDeliveryMetrics(institutionId);
  const {
    sequences: activeSequences,
    isLoading: sequencesLoading,
    refetch: refetchSequences,
  } = useActiveSequences(institutionId);
  const { logs: recentLogs, isLoading: logsLoading, refetch: refetchLogs } = useExecutionLogs(
    institutionId,
    50
  );
  const { lastUpdate, isConnected } = useRealtimeUpdates(institutionId);

  const isLoading = statsLoading || metricsLoading || sequencesLoading || logsLoading;

  const refetchAll = useCallback(() => {
    refetchStats();
    refetchMetrics();
    refetchSequences();
    refetchLogs();
  }, [refetchStats, refetchMetrics, refetchSequences, refetchLogs]);

  return {
    stats,
    deliveryMetrics,
    activeSequences,
    recentLogs,
    isLoading,
    isConnected,
    lastUpdate,
    refetchAll,
  };
}
