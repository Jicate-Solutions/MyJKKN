'use client';

/**
 * Startup Studio - Innovation Pipeline Hooks
 * Aggregates counts across Appathon → Sarvam Galatta → Solve for 100 → NIF stages.
 */

import { useQuery } from '@tanstack/react-query';
import { startupStudioKeys } from '@/lib/query-keys';
import { QUERY_CONFIG } from '@/lib/config/query-config';
import { apiClient } from '@/lib/api/client';
import type {
  PipelineStage,
  PipelineSummary,
  PipelineTeam,
  PipelineActivity,
} from '@/lib/services/startup-studio/pipeline-service';

/**
 * Live counts and conversion rates for the 4 pipeline stages.
 */
export function usePipelineSummary() {
  return useQuery({
    queryKey: startupStudioKeys.pipeline.summary(),
    queryFn: async () => {
      const res = await apiClient.get<PipelineSummary>('/api/startup-studio/pipeline');
      // apiClient may wrap in { data } envelope — unwrap defensively
      return ((res as any)?.data ?? res) as PipelineSummary;
    },
    ...QUERY_CONFIG.DASHBOARD_DATA,
  });
}

/**
 * Teams at a specific pipeline stage. Only fires when stage is provided.
 */
export function usePipelineTeamsAtStage(stage: PipelineStage | null) {
  return useQuery({
    queryKey: startupStudioKeys.pipeline.teams(stage || 'none'),
    queryFn: async () => {
      const res = await apiClient.get<{ stage: PipelineStage; teams: PipelineTeam[] }>(
        `/api/startup-studio/pipeline/teams?stage=${stage}`
      );
      const unwrapped = ((res as any)?.data ?? res) as { stage: PipelineStage; teams: PipelineTeam[] };
      return unwrapped.teams || [];
    },
    enabled: !!stage,
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

/**
 * Recent activity feed across the pipeline.
 */
export function usePipelineActivity(limit: number = 20) {
  return useQuery({
    queryKey: startupStudioKeys.pipeline.activity(limit),
    queryFn: async () => {
      const res = await apiClient.get<{ activity: PipelineActivity[] }>(
        `/api/startup-studio/pipeline/activity?limit=${limit}`
      );
      const unwrapped = ((res as any)?.data ?? res) as { activity: PipelineActivity[] };
      return unwrapped.activity || [];
    },
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}
