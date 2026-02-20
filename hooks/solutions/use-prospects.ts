'use client';

/**
 * Solutions Hub - Prospect Pipeline Hooks
 * Purpose: React Query hooks for prospect CRUD, pipeline stage changes, activity logging, and stats.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { solutionsHubKeys } from '@/lib/query-keys';
import { QUERY_CONFIG } from '@/lib/config/query-config';
import {
  prospectsService,
  type ProspectFilters,
  type UpdateProspectInput,
} from '@/lib/services/solutions/prospects-service';
import type {
  Prospect,
  ProspectActivity,
  CreateProspectInput,
  CreateProspectActivityInput,
  PipelineStage,
} from '@/lib/services/solutions/types';

// Re-export types for consumers
export type { ProspectFilters, UpdateProspectInput };

// ============================================
// QUERY HOOKS
// ============================================

export function useProspects(filters?: ProspectFilters) {
  return useQuery({
    queryKey: solutionsHubKeys.prospects.list(filters),
    queryFn: () => prospectsService.getProspects(filters),
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

export function useProspect(id: string) {
  return useQuery({
    queryKey: solutionsHubKeys.prospects.detail(id),
    queryFn: () => prospectsService.getProspectById(id),
    enabled: !!id,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

export function useProspectStats() {
  return useQuery({
    queryKey: solutionsHubKeys.prospects.stats(),
    queryFn: () => prospectsService.getProspectStats(),
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

export function usePipelineBoard() {
  return useQuery({
    queryKey: solutionsHubKeys.prospects.pipelineBoard(),
    queryFn: () => prospectsService.getPipelineBoard(),
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

export function useProspectActivities(prospectId: string) {
  return useQuery({
    queryKey: solutionsHubKeys.prospects.activities(prospectId),
    queryFn: () => prospectsService.getProspectActivities(prospectId),
    enabled: !!prospectId,
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

// ============================================
// MUTATION HOOKS
// ============================================

export function useCreateProspect() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateProspectInput) => prospectsService.createProspect(input),
    onSuccess: (data: Prospect) => {
      if (data?.id) {
        queryClient.setQueryData(solutionsHubKeys.prospects.detail(data.id), data);
      }
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.prospects.all });
    },
  });
}

export function useUpdateProspect() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateProspectInput }) =>
      prospectsService.updateProspect(id, input),
    onSuccess: (data: Prospect) => {
      if (data?.id) {
        queryClient.setQueryData(solutionsHubKeys.prospects.detail(data.id), data);
      }
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.prospects.all });
    },
  });
}

export function useUpdatePipelineStage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, stage, lostReason }: { id: string; stage: PipelineStage; lostReason?: string }) =>
      prospectsService.updatePipelineStage(id, stage, lostReason),
    onSuccess: (data: Prospect) => {
      if (data?.id) {
        queryClient.setQueryData(solutionsHubKeys.prospects.detail(data.id), data);
      }
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.prospects.all });
      // If won, also invalidate clients (new client was auto-created by DB trigger)
      if (data?.converted_client_id) {
        queryClient.invalidateQueries({ queryKey: solutionsHubKeys.clients.all });
      }
    },
  });
}

export function useDeleteProspect() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => prospectsService.deleteProspect(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.prospects.all });
    },
  });
}

export function useLogProspectActivity() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateProspectActivityInput) => prospectsService.logActivity(input),
    onSuccess: (data: ProspectActivity) => {
      queryClient.invalidateQueries({
        queryKey: solutionsHubKeys.prospects.activities(data.prospect_id),
      });
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.prospects.all });
    },
  });
}
