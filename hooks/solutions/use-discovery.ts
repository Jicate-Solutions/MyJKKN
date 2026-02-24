'use client';

/**
 * Solutions Hub - Discovery Hooks
 * Purpose: React Query hooks for discovery visits and client communications
 * Connected to: lib/services/solutions/discovery-service.ts
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { solutionsHubKeys } from '@/lib/query-keys';
import { QUERY_CONFIG } from '@/lib/config/query-config';
import { apiClient } from '@/lib/api/client';
import {
  COMMUNICATION_TYPE_LABELS,
  COMMUNICATION_DIRECTION_LABELS,
} from '@/lib/services/solutions/discovery-service';
import type {
  DiscoveryVisitFilters,
  CommunicationFilters,
  CreateDiscoveryVisitInput,
  UpdateDiscoveryVisitInput,
  CreateCommunicationInput,
  UpdateCommunicationInput,
} from '@/lib/services/solutions/discovery-service';
import type {
  DiscoveryVisit,
  ClientCommunication,
  CommunicationType,
  CommunicationDirection,
} from '@/lib/services/solutions/types';

// ============================================
// RE-EXPORT TYPES FOR CONVENIENCE
// ============================================

export type {
  DiscoveryVisitFilters,
  CommunicationFilters,
  CreateDiscoveryVisitInput,
  UpdateDiscoveryVisitInput,
  CreateCommunicationInput,
  UpdateCommunicationInput,
  DiscoveryVisit,
  ClientCommunication,
  CommunicationType,
  CommunicationDirection,
};

// ============================================
// QUERY HOOKS - DISCOVERY VISITS
// ============================================

/**
 * Fetch all discovery visits with optional filters
 */
export function useDiscoveryVisits(filters?: DiscoveryVisitFilters) {
  return useQuery({
    queryKey: solutionsHubKeys.discoveryVisits.list(filters),
    queryFn: () => apiClient.get('/api/solutions/discovery/visits', { params: filters as Record<string, any> }),
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

/**
 * Fetch a single discovery visit by ID
 */
export function useDiscoveryVisit(id: string) {
  return useQuery({
    queryKey: solutionsHubKeys.discoveryVisits.detail(id),
    queryFn: () => apiClient.get(`/api/solutions/discovery/visits/${id}`),
    enabled: !!id,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

/**
 * Fetch discovery visits for a specific client
 */
export function useClientDiscoveryVisits(clientId: string) {
  return useQuery({
    queryKey: solutionsHubKeys.discoveryVisits.byClient(clientId),
    queryFn: () => apiClient.get('/api/solutions/discovery/visits', { params: { client_id: clientId } }),
    enabled: !!clientId,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

/**
 * Fetch recent discovery visits for dashboard
 */
export function useRecentDiscoveryVisits(limit: number = 5) {
  return useQuery({
    queryKey: [...solutionsHubKeys.discoveryVisits.all, 'recent', limit],
    queryFn: () => apiClient.get('/api/solutions/discovery/visits', { params: { limit, recent: 'true' } }),
    ...QUERY_CONFIG.DASHBOARD_DATA,
  });
}

/**
 * Fetch discovery visit statistics for dashboard
 */
export function useDiscoveryVisitStats() {
  return useQuery({
    queryKey: [...solutionsHubKeys.discoveryVisits.all, 'stats'],
    queryFn: () => apiClient.get('/api/solutions/discovery/visits', { params: { stats: 'true' } }),
    ...QUERY_CONFIG.DASHBOARD_DATA,
  });
}

// ============================================
// MUTATION HOOKS - DISCOVERY VISITS
// ============================================

/**
 * Create a new discovery visit
 */
export function useCreateDiscoveryVisit() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateDiscoveryVisitInput) =>
      apiClient.post<DiscoveryVisit>('/api/solutions/discovery/visits', input),
    onSuccess: (data: DiscoveryVisit) => {
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.discoveryVisits.all });
      if (data?.client_id) {
        queryClient.invalidateQueries({
          queryKey: solutionsHubKeys.discoveryVisits.byClient(data.client_id),
        });
      }
    },
  });
}

/**
 * Update an existing discovery visit
 */
export function useUpdateDiscoveryVisit() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: UpdateDiscoveryVisitInput }) =>
      apiClient.patch<DiscoveryVisit>(`/api/solutions/discovery/visits/${id}`, updates),
    onSuccess: (data: DiscoveryVisit) => {
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.discoveryVisits.all });
      if (data?.id) {
        queryClient.setQueryData(solutionsHubKeys.discoveryVisits.detail(data.id), data);
      }
    },
  });
}

/**
 * Delete a discovery visit
 */
export function useDeleteDiscoveryVisit() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/api/solutions/discovery/visits/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.discoveryVisits.all });
    },
  });
}

/**
 * Link a visit to a resulting solution/phase
 */
export function useLinkVisitToResult() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      visitId,
      solutionId,
    }: {
      visitId: string;
      solutionId: string;
    }) => apiClient.patch<DiscoveryVisit>(`/api/solutions/discovery/visits/${visitId}`, { solution_id: solutionId }),
    onSuccess: (data: DiscoveryVisit) => {
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.discoveryVisits.all });
      if (data?.id) {
        queryClient.setQueryData(solutionsHubKeys.discoveryVisits.detail(data.id), data);
      }
    },
  });
}

// ============================================
// QUERY HOOKS - COMMUNICATIONS
// ============================================

/**
 * Fetch all communications with optional filters
 */
export function useCommunications(filters?: CommunicationFilters) {
  return useQuery({
    queryKey: solutionsHubKeys.communications.list(filters),
    queryFn: () => apiClient.get('/api/solutions/discovery/communications', { params: filters as Record<string, any> }),
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

/**
 * Fetch a single communication by ID
 */
export function useCommunication(id: string) {
  return useQuery({
    queryKey: solutionsHubKeys.communications.detail(id),
    queryFn: () => apiClient.get(`/api/solutions/discovery/communications/${id}`),
    enabled: !!id,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

/**
 * Fetch communications for a specific client
 */
export function useClientCommunications(clientId: string) {
  return useQuery({
    queryKey: solutionsHubKeys.communications.byClient(clientId),
    queryFn: () => apiClient.get('/api/solutions/discovery/communications', { params: { client_id: clientId } }),
    enabled: !!clientId,
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

/**
 * Fetch communications for a specific solution
 */
export function useSolutionCommunications(solutionId: string) {
  return useQuery({
    queryKey: [...solutionsHubKeys.communications.all, 'solution', solutionId],
    queryFn: () => apiClient.get('/api/solutions/discovery/communications', { params: { solution_id: solutionId } }),
    enabled: !!solutionId,
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

// ============================================
// MUTATION HOOKS - COMMUNICATIONS
// ============================================

/**
 * Create a new communication
 */
export function useCreateCommunication() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateCommunicationInput) =>
      apiClient.post<ClientCommunication>('/api/solutions/discovery/communications', input),
    onSuccess: (data: ClientCommunication) => {
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.communications.all });
      if (data?.client_id) {
        queryClient.invalidateQueries({
          queryKey: solutionsHubKeys.communications.byClient(data.client_id),
        });
      }
    },
  });
}

/**
 * Update an existing communication
 */
export function useUpdateCommunication() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateCommunicationInput }) =>
      apiClient.patch<ClientCommunication>(`/api/solutions/discovery/communications/${id}`, input),
    onSuccess: (data: ClientCommunication) => {
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.communications.all });
      if (data?.id) {
        queryClient.setQueryData(solutionsHubKeys.communications.detail(data.id), data);
      }
    },
  });
}

/**
 * Delete a communication
 */
export function useDeleteCommunication() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/api/solutions/discovery/communications/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.communications.all });
    },
  });
}

// ============================================
// UTILITY EXPORTS
// ============================================

export {
  COMMUNICATION_TYPE_LABELS,
  COMMUNICATION_DIRECTION_LABELS,
};
