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
  // No `enabled: !!institutionId` gate — when institutionId is undefined the user is
  // a super_admin who legitimately wants the cross-institution view. The service skips
  // the .eq('institution_id', ...) filter in that case; RLS still enforces access.
  const query = useQuery({
    queryKey: campaignMonitoringKeys.stats(institutionId || 'all'),
    queryFn: () => CampaignMonitoringService.getCampaignStats(institutionId),
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
  // No enabled gate — see useCampaignStats above for super_admin rationale.
  const query = useQuery({
    queryKey: campaignMonitoringKeys.delivery(institutionId || 'all'),
    queryFn: () => CampaignMonitoringService.getDeliveryMetrics(institutionId),
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
  // No enabled gate — super_admin gets cross-institution view (see useCampaignStats).
  const query = useQuery({
    queryKey: campaignMonitoringKeys.sequences(institutionId || 'all'),
    queryFn: () => CampaignMonitoringService.getActiveSequences(institutionId),
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
  // No enabled gate — super_admin gets cross-institution view (see useCampaignStats).
  const query = useQuery({
    queryKey: campaignMonitoringKeys.logs(institutionId || 'all', limit),
    queryFn: () => CampaignMonitoringService.getExecutionLogs(institutionId, limit),
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

      // Invalidate relevant queries based on update type. Use 'all' as the
      // bucket key when institutionId is undefined (super_admin cross-institution view),
      // matching the keys used by the data-fetching hooks above.
      const bucket = institutionId || 'all';
      switch (update.type) {
        case 'campaign_status_changed':
          queryClient.invalidateQueries({
            queryKey: campaignMonitoringKeys.stats(bucket),
          });
          queryClient.invalidateQueries({
            queryKey: campaignMonitoringKeys.campaigns(bucket),
          });
          if (update.campaignId) {
            queryClient.invalidateQueries({
              queryKey: campaignMonitoringKeys.campaign(update.campaignId),
            });
          }
          break;
        case 'execution_completed':
          queryClient.invalidateQueries({
            queryKey: campaignMonitoringKeys.logs(bucket),
          });
          queryClient.invalidateQueries({
            queryKey: campaignMonitoringKeys.delivery(bucket),
          });
          queryClient.invalidateQueries({
            queryKey: campaignMonitoringKeys.sequences(bucket),
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
    // Subscribe always. When institutionId is undefined, the service uses an 'all' channel key
    // and RLS still scopes which postgres_changes events the client actually receives.
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
  // No enabled gate — super_admin gets cross-institution view.
  const query = useQuery({
    queryKey: campaignMonitoringKeys.campaigns(institutionId || 'all'),
    queryFn: () => CampaignMonitoringService.getCampaigns(institutionId),
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
