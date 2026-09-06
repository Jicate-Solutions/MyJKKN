'use client';

/**
 * Solutions Hub - Proposals Hooks
 * Purpose: React Query hooks for proposal CRUD + status-advance operations.
 * Mirrors use-clients.ts: apiClient against /api/solutions/proposals,
 * keyed by solutionsHubKeys.proposals.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { solutionsHubKeys } from '@/lib/query-keys';
import { QUERY_CONFIG } from '@/lib/config/query-config';
import { apiClient } from '@/lib/api/client';
import type { ProposalFilters } from '@/lib/services/solutions/proposals-service';
import type {
  Proposal,
  ProposalStatus,
  CreateProposalInput,
  UpdateProposalInput,
} from '@/lib/services/solutions/types';

// Re-export types for convenience
export type { Proposal, ProposalStatus, CreateProposalInput, UpdateProposalInput, ProposalFilters };

interface ProposalListResponse {
  data: Proposal[];
  metadata?: { total: number; page: number; limit: number; totalPages: number };
}

// ============================================
// QUERY HOOKS
// ============================================

/**
 * Fetch proposals with optional filters
 */
export function useProposals(filters?: ProposalFilters) {
  return useQuery({
    queryKey: solutionsHubKeys.proposals.list(filters),
    queryFn: () =>
      apiClient.get<ProposalListResponse>('/api/solutions/proposals', {
        params: filters as Record<string, any>,
      }),
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

/**
 * Fetch all proposals for one client
 */
export function useClientProposals(clientId: string | undefined) {
  return useQuery({
    queryKey: solutionsHubKeys.proposals.list({ client_id: clientId }),
    queryFn: () =>
      apiClient.get<ProposalListResponse>('/api/solutions/proposals', {
        params: { client_id: clientId!, limit: 50 },
      }),
    enabled: !!clientId,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

// ============================================
// MUTATION HOOKS
// ============================================

/**
 * Create a new proposal (starts as draft)
 */
export function useCreateProposal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateProposalInput) =>
      apiClient.post<Proposal>('/api/solutions/proposals', input),
    onSuccess: (data) => {
      if (data?.id) {
        queryClient.setQueryData(solutionsHubKeys.proposals.detail(data.id), data);
      }
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.proposals.all });
    },
  });
}

/**
 * Update proposal fields (title, amount, links, notes — not status)
 */
export function useUpdateProposal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: UpdateProposalInput }) =>
      apiClient.patch<Proposal>(`/api/solutions/proposals/${id}`, updates),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.proposals.all });
      if (data?.id) {
        queryClient.setQueryData(solutionsHubKeys.proposals.detail(data.id), data);
      }
    },
  });
}

/**
 * Move a proposal to its next status. The server stamps
 * sent_at / approved_at / signed_at on the transition.
 */
export function useAdvanceProposal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: ProposalStatus }) =>
      apiClient.patch<Proposal>(`/api/solutions/proposals/${id}`, { status }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.proposals.all });
      if (data?.id) {
        queryClient.setQueryData(solutionsHubKeys.proposals.detail(data.id), data);
      }
    },
  });
}
