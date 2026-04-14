'use client';

/**
 * Solutions Hub - Prospect Pipeline Hooks
 * Purpose: React Query hooks for prospect CRUD, pipeline stage changes, activity logging, and stats.
 * Connected to: /api/solutions/prospects routes
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { solutionsHubKeys } from '@/lib/query-keys';
import { QUERY_CONFIG } from '@/lib/config/query-config';
import { apiClient } from '@/lib/api/client';
import type {
  ProspectFilters,
  UpdateProspectInput,
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
    queryFn: () => apiClient.get('/api/solutions/prospects', { params: filters as Record<string, any> }),
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

export function useProspect(id: string) {
  return useQuery({
    queryKey: solutionsHubKeys.prospects.detail(id),
    queryFn: () => apiClient.get(`/api/solutions/prospects/${id}`),
    enabled: !!id,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

export function useProspectStats() {
  return useQuery({
    queryKey: solutionsHubKeys.prospects.stats(),
    queryFn: () => apiClient.get('/api/solutions/prospects/stats'),
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

export function usePipelineBoard() {
  return useQuery({
    queryKey: solutionsHubKeys.prospects.pipelineBoard(),
    queryFn: () => apiClient.get('/api/solutions/prospects/pipeline'),
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

export function useProspectActivities(prospectId: string) {
  return useQuery({
    queryKey: solutionsHubKeys.prospects.activities(prospectId),
    queryFn: () => apiClient.get(`/api/solutions/prospects/${prospectId}/activities`),
    enabled: !!prospectId,
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

export function usePipelineAnalytics() {
  return useQuery({
    queryKey: solutionsHubKeys.prospects.analytics(),
    queryFn: () => apiClient.get('/api/solutions/prospects/analytics'),
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

// ============================================
// MUTATION HOOKS
// ============================================

export function useCreateProspect() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateProspectInput) => apiClient.post<Prospect>('/api/solutions/prospects', input),
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
      apiClient.patch<Prospect>(`/api/solutions/prospects/${id}`, input),
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
    mutationFn: ({ id, stage, lostReason, reopenDate }: { id: string; stage: PipelineStage; lostReason?: string; reopenDate?: string }) =>
      apiClient.patch<Prospect>(`/api/solutions/prospects/${id}/stage`, { stage, lostReason, reopenDate }),
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
    mutationFn: (id: string) => apiClient.delete(`/api/solutions/prospects/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.prospects.all });
    },
  });
}

export function useLogProspectActivity() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateProspectActivityInput) =>
      apiClient.post<ProspectActivity>(`/api/solutions/prospects/${input.prospect_id}/activities`, input),
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
    queryFn: () => apiClient.get('/api/solutions/prospects', { params: { client_id: clientId!, single: true } }),
    enabled: !!clientId,
  });
}

/** Get all prospects linked to a client (converted + repeat) */
export function useProspectsByClientId(clientId: string | undefined) {
  return useQuery({
    queryKey: ['prospects-by-client', clientId],
    queryFn: () => apiClient.get('/api/solutions/prospects', { params: { client_id: clientId!, all: true } }),
    enabled: !!clientId,
  });
}

/** Get prospects ready to re-engage (reopen_date reached) */
export function useReadyToReengage() {
  return useQuery({
    queryKey: ['prospects-reengage'],
    queryFn: () => apiClient.get('/api/solutions/prospects', { params: { ready_to_reengage: true } }),
  });
}

/** Reactivate a dormant/lost prospect back to lead stage */
export function useReactivateProspect() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.patch(`/api/solutions/prospects/${id}/stage`, { stage: 'lead' }),
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
    queryFn: () => apiClient.get('/api/solutions/prospects/analytics', { params: { type: 'source_conversion' } }),
  });
}
