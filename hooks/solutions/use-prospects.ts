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

export function usePipelineAnalytics() {
  return useQuery({
    queryKey: solutionsHubKeys.prospects.analytics(),
    queryFn: () => prospectsService.getPipelineAnalytics(),
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
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

// ============================================
// PIPELINE ↔ CLIENT IMPROVEMENT HOOKS
// ============================================

/** Get prospect that was converted to this client */
export function useProspectByClientId(clientId: string | undefined) {
  return useQuery({
    queryKey: ['prospect-by-client', clientId],
    queryFn: () => prospectsService.getProspectByClientId(clientId!),
    enabled: !!clientId,
  });
}

/** Get all prospects linked to a client (converted + repeat) */
export function useProspectsByClientId(clientId: string | undefined) {
  return useQuery({
    queryKey: ['prospects-by-client', clientId],
    queryFn: () => prospectsService.getProspectsByClientId(clientId!),
    enabled: !!clientId,
  });
}

/** Get prospects ready to re-engage (reopen_date reached) */
export function useReadyToReengage() {
  return useQuery({
    queryKey: ['prospects-reengage'],
    queryFn: () => prospectsService.getReadyToReengage(),
  });
}

/** Reactivate a dormant/lost prospect back to lead stage */
export function useReactivateProspect() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => prospectsService.reactivateProspect(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.prospects.all });
      queryClient.invalidateQueries({ queryKey: ['prospects-reengage'] });
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.prospects.stats() });
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.prospects.pipelineBoard() });
    },
  });
}

/** Source conversion analytics (win rate, deal size, solutions per client by source) */
export function useSourceConversionAnalytics() {
  return useQuery({
    queryKey: ['source-conversion-analytics'],
    queryFn: () => prospectsService.getSourceConversionAnalytics(),
  });
}
