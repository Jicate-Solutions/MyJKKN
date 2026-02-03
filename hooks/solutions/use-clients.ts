'use client';

/**
 * Solutions Hub - Clients Hooks
 * Purpose: React Query hooks for clients CRUD operations
 * Migrated from: JKKN-Solutions-Hub/src/hooks/use-clients.ts
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { solutionsHubKeys } from '@/lib/query-keys';
import { QUERY_CONFIG } from '@/lib/config/query-config';

// ============================================
// TYPES
// ============================================

export type SourceType = 'placement' | 'alumni' | 'clinical' | 'referral' | 'direct' | 'yi' | 'intent';
export type PartnerStatus = 'standard' | 'yi' | 'alumni' | 'mou' | 'referral';

export interface ClientFilters {
  source_type?: SourceType;
  partner_status?: PartnerStatus;
  source_department_id?: string;
  is_active?: boolean;
  search?: string;
  page?: number;
  limit?: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

export interface CreateClientInput {
  name: string;
  contact_person?: string;
  contact_email?: string;
  contact_phone?: string;
  address?: string;
  source_type: SourceType;
  source_department_id?: string;
  partner_status?: PartnerStatus;
  intent_agency_id?: string;
  notes?: string;
}

export interface UpdateClientInput {
  name?: string;
  contact_person?: string;
  contact_email?: string;
  contact_phone?: string;
  address?: string;
  source_type?: SourceType;
  source_department_id?: string;
  partner_status?: PartnerStatus;
  intent_agency_id?: string;
  notes?: string;
  is_active?: boolean;
}

// ============================================
// SERVICE PLACEHOLDER
// ============================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ClientService = any;

const clientsService: ClientService = {
  getClients: async (_filters?: ClientFilters) => {
    throw new Error('clientsService.getClients not implemented');
  },
  getClientById: async (_id: string) => {
    throw new Error('clientsService.getClientById not implemented');
  },
  createClient: async (_input: CreateClientInput) => {
    throw new Error('clientsService.createClient not implemented');
  },
  updateClient: async (_id: string, _input: UpdateClientInput) => {
    throw new Error('clientsService.updateClient not implemented');
  },
  deactivateClient: async (_id: string) => {
    throw new Error('clientsService.deactivateClient not implemented');
  },
  reactivateClient: async (_id: string) => {
    throw new Error('clientsService.reactivateClient not implemented');
  },
  incrementReferralCount: async (_id: string) => {
    throw new Error('clientsService.incrementReferralCount not implemented');
  },
  getClientIndustries: async () => {
    throw new Error('clientsService.getClientIndustries not implemented');
  },
};

// ============================================
// QUERY HOOKS
// ============================================

/**
 * Fetch all clients with optional filters
 */
export function useClients(filters?: ClientFilters) {
  return useQuery({
    queryKey: solutionsHubKeys.clients.list(filters),
    queryFn: () => clientsService.getClients(filters),
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

/**
 * Fetch a single client by ID
 */
export function useClient(id: string) {
  return useQuery({
    queryKey: solutionsHubKeys.clients.detail(id),
    queryFn: () => clientsService.getClientById(id),
    enabled: !!id,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

/**
 * Fetch unique industries for filter dropdown
 */
export function useClientIndustries() {
  return useQuery({
    queryKey: solutionsHubKeys.clients.industries(),
    queryFn: () => clientsService.getClientIndustries(),
    ...QUERY_CONFIG.STABLE_DATA,
  });
}

// ============================================
// MUTATION HOOKS
// ============================================

/**
 * Create a new client
 */
export function useCreateClient() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateClientInput) => clientsService.createClient(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.clients.all });
    },
  });
}

/**
 * Update an existing client
 */
export function useUpdateClient() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: UpdateClientInput }) =>
      clientsService.updateClient(id, updates),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.clients.all });
      if (data?.id) {
        queryClient.setQueryData(solutionsHubKeys.clients.detail(data.id), data);
      }
    },
  });
}

/**
 * Deactivate a client
 */
export function useDeactivateClient() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => clientsService.deactivateClient(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.clients.all });
    },
  });
}

/**
 * Reactivate a client
 */
export function useReactivateClient() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => clientsService.reactivateClient(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.clients.all });
    },
  });
}

/**
 * Increment referral count for a client
 */
export function useIncrementReferralCount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => clientsService.incrementReferralCount(id),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.clients.all });
      if (data?.id) {
        queryClient.setQueryData(solutionsHubKeys.clients.detail(data.id), data);
      }
    },
  });
}
