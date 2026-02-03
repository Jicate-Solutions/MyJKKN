'use client';

/**
 * Solutions Hub - Discovery Hooks
 * Purpose: React Query hooks for discovery visits and client communications
 * Migrated from: JKKN-Solutions-Hub/src/hooks/use-discovery-visits.ts & use-communications.ts
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { solutionsHubKeys } from '@/lib/query-keys';
import { QUERY_CONFIG } from '@/lib/config/query-config';

// ============================================
// TYPES
// ============================================

export type CommunicationType = 'email' | 'call' | 'meeting' | 'whatsapp' | 'other';
export type CommunicationDirection = 'inbound' | 'outbound';

export interface DiscoveryVisitFilters {
  client_id?: string;
  department_id?: string;
  follow_up_required?: boolean;
  from_date?: string;
  to_date?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface CreateDiscoveryVisitInput {
  client_id: string;
  department_id?: string;
  visit_date: string;
  visitors?: { name: string; role: string }[];
  observations?: string;
  pain_points?: string;
  opportunities?: string;
  photos_urls?: string[];
  follow_up_required?: boolean;
  follow_up_date?: string;
}

export interface UpdateDiscoveryVisitInput {
  visit_date?: string;
  visitors?: { name: string; role: string }[];
  observations?: string;
  pain_points?: string;
  opportunities?: string;
  photos_urls?: string[];
  follow_up_required?: boolean;
  follow_up_date?: string;
  resulting_solution_id?: string;
  resulting_phase_id?: string;
}

export interface CommunicationFilters {
  client_id?: string;
  solution_id?: string;
  communication_type?: CommunicationType;
  direction?: CommunicationDirection;
  from_date?: string;
  to_date?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface CreateCommunicationInput {
  client_id: string;
  solution_id?: string;
  communication_type: CommunicationType;
  direction: CommunicationDirection;
  subject?: string;
  content?: string;
  participants?: string[];
  communication_date?: string;
}

export interface UpdateCommunicationInput {
  subject?: string;
  content?: string;
  participants?: string[];
}

// ============================================
// SERVICE PLACEHOLDER
// ============================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DiscoveryService = any;

const discoveryService: DiscoveryService = {
  // Discovery Visits
  getDiscoveryVisits: async (_filters?: DiscoveryVisitFilters) => {
    throw new Error('discoveryService.getDiscoveryVisits not implemented');
  },
  getDiscoveryVisitById: async (_id: string) => {
    throw new Error('discoveryService.getDiscoveryVisitById not implemented');
  },
  getClientDiscoveryVisits: async (_clientId: string) => {
    throw new Error('discoveryService.getClientDiscoveryVisits not implemented');
  },
  createDiscoveryVisit: async (_input: CreateDiscoveryVisitInput) => {
    throw new Error('discoveryService.createDiscoveryVisit not implemented');
  },
  updateDiscoveryVisit: async (_id: string, _input: UpdateDiscoveryVisitInput) => {
    throw new Error('discoveryService.updateDiscoveryVisit not implemented');
  },
  deleteDiscoveryVisit: async (_id: string) => {
    throw new Error('discoveryService.deleteDiscoveryVisit not implemented');
  },
  linkVisitToResult: async (_visitId: string, _solutionId: string, _phaseId?: string) => {
    throw new Error('discoveryService.linkVisitToResult not implemented');
  },

  // Communications
  getCommunications: async (_filters?: CommunicationFilters) => {
    throw new Error('discoveryService.getCommunications not implemented');
  },
  getCommunicationById: async (_id: string) => {
    throw new Error('discoveryService.getCommunicationById not implemented');
  },
  getClientCommunications: async (_clientId: string) => {
    throw new Error('discoveryService.getClientCommunications not implemented');
  },
  createCommunication: async (_input: CreateCommunicationInput) => {
    throw new Error('discoveryService.createCommunication not implemented');
  },
  updateCommunication: async (_id: string, _input: UpdateCommunicationInput) => {
    throw new Error('discoveryService.updateCommunication not implemented');
  },
  deleteCommunication: async (_id: string) => {
    throw new Error('discoveryService.deleteCommunication not implemented');
  },
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
    queryFn: () => discoveryService.getDiscoveryVisits(filters),
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

/**
 * Fetch a single discovery visit by ID
 */
export function useDiscoveryVisit(id: string) {
  return useQuery({
    queryKey: solutionsHubKeys.discoveryVisits.detail(id),
    queryFn: () => discoveryService.getDiscoveryVisitById(id),
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
    queryFn: () => discoveryService.getClientDiscoveryVisits(clientId),
    enabled: !!clientId,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
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
      discoveryService.createDiscoveryVisit(input),
    onSuccess: (data) => {
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
      discoveryService.updateDiscoveryVisit(id, updates),
    onSuccess: (data) => {
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
    mutationFn: (id: string) => discoveryService.deleteDiscoveryVisit(id),
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
      phaseId,
    }: {
      visitId: string;
      solutionId: string;
      phaseId?: string;
    }) => discoveryService.linkVisitToResult(visitId, solutionId, phaseId),
    onSuccess: (data) => {
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
    queryFn: () => discoveryService.getCommunications(filters),
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

/**
 * Fetch a single communication by ID
 */
export function useCommunication(id: string) {
  return useQuery({
    queryKey: solutionsHubKeys.communications.detail(id),
    queryFn: () => discoveryService.getCommunicationById(id),
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
    queryFn: () => discoveryService.getClientCommunications(clientId),
    enabled: !!clientId,
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
      discoveryService.createCommunication(input),
    onSuccess: (data) => {
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
      discoveryService.updateCommunication(id, input),
    onSuccess: (data) => {
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
    mutationFn: (id: string) => discoveryService.deleteCommunication(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.communications.all });
    },
  });
}
