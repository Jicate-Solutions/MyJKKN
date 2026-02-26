// hooks/admission/use-status-tracking.ts
// React Query hooks for Application Status Tracking page

import { useQuery } from '@tanstack/react-query';
import {
  StatusTrackingService,
  type StatusFilters,
  type StatusPipelineStats,
} from '@/lib/services/admission/status-tracking-service';

// ============================================================================
// QUERY KEYS
// ============================================================================

export const statusTrackingKeys = {
  all: ['status-tracking'] as const,
  applications: (filters: StatusFilters) =>
    [...statusTrackingKeys.all, 'applications', filters] as const,
  pipeline: (institutionId: string) =>
    [...statusTrackingKeys.all, 'pipeline', institutionId] as const,
  activity: (institutionId: string) =>
    [...statusTrackingKeys.all, 'activity', institutionId] as const,
};

// ============================================================================
// QUERY HOOKS
// ============================================================================

/**
 * Fetch applications with lead info for status tracking
 */
export function useApplicationsStatus(filters: StatusFilters) {
  const query = useQuery({
    queryKey: statusTrackingKeys.applications(filters),
    queryFn: () => StatusTrackingService.getApplications(filters),
    enabled: !!filters.institutionId,
  });

  return {
    applications: query.data?.applications || [],
    total: query.data?.total || 0,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * Fetch pipeline stats (counts by status)
 */
export function usePipelineStats(institutionId?: string) {
  const query = useQuery({
    queryKey: statusTrackingKeys.pipeline(institutionId || ''),
    queryFn: () => StatusTrackingService.getPipelineStats(institutionId!),
    enabled: !!institutionId,
    staleTime: 60000,
  });

  return {
    stats: query.data || {
      total: 0,
      draft: 0,
      submitted: 0,
      under_review: 0,
      approved: 0,
      rejected: 0,
      enrolled: 0,
    } as StatusPipelineStats,
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}

/**
 * Fetch recent activity log
 */
export function useRecentActivity(institutionId?: string, limit?: number) {
  const query = useQuery({
    queryKey: statusTrackingKeys.activity(institutionId || ''),
    queryFn: () =>
      StatusTrackingService.getRecentActivity(institutionId!, limit || 20),
    enabled: !!institutionId,
  });

  return {
    activities: query.data || [],
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}
