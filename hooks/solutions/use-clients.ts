'use client';

/**
 * Solutions Hub - Clients Hooks
 * Purpose: React Query hooks for clients CRUD operations
 * Migrated from: JKKN-Solutions-Hub/src/hooks/use-clients.ts
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { solutionsHubKeys } from '@/lib/query-keys';
import { QUERY_CONFIG } from '@/lib/config/query-config';
import {
  clientsService,
  type ClientFilters,
  type UpdateClientInput,
} from '@/lib/services/solutions/clients-service';
import type { CreateClientInput, SourceType, PartnerStatus } from '@/lib/services/solutions/types';

// Re-export types for convenience
export type { ClientFilters, UpdateClientInput, CreateClientInput, SourceType, PartnerStatus };

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
    mutationFn: async (input: CreateClientInput) => {
      const result = await clientsService.createClient(input);
      return result as { id: string } & Record<string, unknown>;
    },
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
