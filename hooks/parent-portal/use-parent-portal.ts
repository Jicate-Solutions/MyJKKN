// ============================================================================
// React Query hooks for Parent Portal Access Management (Admin)
// ============================================================================

import {
  useQuery,
  useMutation,
  useQueryClient,
  UseQueryResult,
} from '@tanstack/react-query';
import { useMemo, useCallback } from 'react';
import type {
  ParentPortalAccess,
  ParentAccessFilters,
  ParentAccessListResponse,
  ParentAccessStats,
  CreateParentAccessDto,
  UpdateParentAccessDto,
} from '@/types/parent-portal';
import { ParentAccessService } from '@/lib/services/parent-portal/parent-access-service';
import { ParentCommunicationService } from '@/lib/services/parent-portal/parent-communication-service';
import { useAuth } from '../use-auth';
import { QUERY_CONFIG } from '@/lib/config/query-config';

// ============================================================================
// Query key factories
// ============================================================================

export const parentAccessKeys = {
  all: ['parent-access'] as const,
  lists: () => [...parentAccessKeys.all, 'list'] as const,
  list: (filters: ParentAccessFilters) =>
    [...parentAccessKeys.lists(), filters] as const,
  details: () => [...parentAccessKeys.all, 'detail'] as const,
  detail: (id: string) => [...parentAccessKeys.details(), id] as const,
  stats: (institutionId: string) =>
    [...parentAccessKeys.all, 'stats', institutionId] as const,
};

export const adminCommunicationKeys = {
  all: ['admin-communications'] as const,
  lists: () => [...adminCommunicationKeys.all, 'list'] as const,
  list: (filters: Record<string, unknown>) =>
    [...adminCommunicationKeys.lists(), filters] as const,
  stats: (institutionId: string) =>
    [...adminCommunicationKeys.all, 'stats', institutionId] as const,
};

// ============================================================================
// ACCESS MANAGEMENT HOOKS
// ============================================================================

/**
 * Get parent access records with filters and pagination
 */
export function useParentAccessRecords(
  filters: Partial<ParentAccessFilters> = {}
): UseQueryResult<ParentAccessListResponse, Error> {
  const { profile, isLoading: authLoading } = useAuth();

  const queryKey = useMemo(() => {
    const stableFilters: ParentAccessFilters = {
      institution_id: filters.institution_id || '',
      search: filters.search,
      is_active: filters.is_active,
      relationship: filters.relationship,
      learner_id: filters.learner_id,
      page: filters.page || 1,
      limit: filters.limit || 20,
    };
    return parentAccessKeys.list(stableFilters);
  }, [
    filters.institution_id,
    filters.search,
    filters.is_active,
    filters.relationship,
    filters.learner_id,
    filters.page,
    filters.limit,
  ]);

  const queryFn = useCallback(async () => {
    return ParentAccessService.getAccessRecords(
      filters as ParentAccessFilters
    );
  }, [filters]);

  return useQuery({
    queryKey,
    queryFn,
    enabled: !authLoading && !!profile && !!filters.institution_id,
    placeholderData: (previousData) => previousData,
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

/**
 * Get single parent access record
 */
export function useParentAccessRecord(
  id: string
): UseQueryResult<ParentPortalAccess | null, Error> {
  const { profile, isLoading: authLoading } = useAuth();

  return useQuery({
    queryKey: parentAccessKeys.detail(id),
    queryFn: () => ParentAccessService.getAccessById(id),
    enabled: !authLoading && !!profile && !!id,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

/**
 * Get parent access stats for institution
 */
export function useParentAccessStats(
  institutionId: string
): UseQueryResult<ParentAccessStats, Error> {
  const { profile, isLoading: authLoading } = useAuth();

  return useQuery({
    queryKey: parentAccessKeys.stats(institutionId),
    queryFn: () => ParentAccessService.getAccessStats(institutionId),
    enabled: !authLoading && !!profile && !!institutionId,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

/**
 * Create parent access mutation
 */
export function useCreateParentAccess() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateParentAccessDto) =>
      ParentAccessService.createAccess(data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: parentAccessKeys.lists() });
      queryClient.invalidateQueries({
        queryKey: parentAccessKeys.stats(data.institution_id),
      });
    },
  });
}

/**
 * Update parent access mutation
 */
export function useUpdateParentAccess(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdateParentAccessDto) =>
      ParentAccessService.updateAccess(id, data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: parentAccessKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: parentAccessKeys.lists() });
      queryClient.setQueryData(parentAccessKeys.detail(id), data);
    },
  });
}

/**
 * Toggle active status mutation
 */
export function useToggleParentAccess() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      ParentAccessService.toggleActive(id, isActive),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: parentAccessKeys.lists() });
    },
  });
}

/**
 * Regenerate access code mutation
 */
export function useRegenerateAccessCode() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => ParentAccessService.regenerateAccessCode(id),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: parentAccessKeys.detail(data.id) });
      queryClient.invalidateQueries({ queryKey: parentAccessKeys.lists() });
    },
  });
}

/**
 * Delete parent access mutation
 */
export function useDeleteParentAccess() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => ParentAccessService.deleteAccess(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: parentAccessKeys.lists() });
    },
  });
}

// ============================================================================
// ADMIN COMMUNICATION HOOKS
// ============================================================================

/**
 * Get communications for admin view
 */
export function useAdminCommunications(
  filters: Record<string, unknown> = {}
) {
  const { profile, isLoading: authLoading } = useAuth();

  return useQuery({
    queryKey: adminCommunicationKeys.list(filters),
    queryFn: () =>
      ParentCommunicationService.getCommunications(filters as any),
    enabled: !authLoading && !!profile && !!filters.institution_id,
    placeholderData: (previousData: unknown) => previousData,
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

/**
 * Get communication stats for admin dashboard
 */
export function useAdminCommunicationStats(institutionId: string) {
  const { profile, isLoading: authLoading } = useAuth();

  return useQuery({
    queryKey: adminCommunicationKeys.stats(institutionId),
    queryFn: () =>
      ParentCommunicationService.getCommunicationStats(institutionId),
    enabled: !authLoading && !!profile && !!institutionId,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

/**
 * Send communication mutation (admin action)
 */
export function useSendAdminCommunication() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: any) =>
      ParentCommunicationService.sendCommunication(data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: adminCommunicationKeys.lists(),
      });
    },
  });
}

/**
 * Delete communication mutation
 */
export function useDeleteAdminCommunication() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      ParentCommunicationService.deleteCommunication(id),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: adminCommunicationKeys.lists(),
      });
    },
  });
}
