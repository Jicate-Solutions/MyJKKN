'use client';

import { useRef } from 'react';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { ImsStoreService } from '@/lib/services/ims/store-service';
import type {
  ImsStoreFilters,
  CreateImsStoreDto,
  UpdateImsStoreDto,
} from '@/types/ims';

// ─── Read Hooks ────────────────────────────────────────

export function useImsStores(filters: ImsStoreFilters) {
  return useQuery({
    queryKey: ['ims-stores', filters],
    queryFn: () => ImsStoreService.getStores(filters),
    enabled: true,
    staleTime: 10 * 60 * 1000,
    // Retry if session isn't ready on first attempt (matches useImsStoresForSelect pattern)
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 8000),
  });
}

export function useImsStore(id: string) {
  return useQuery({
    queryKey: ['ims-store', id],
    queryFn: () => ImsStoreService.getStore(id),
    enabled: !!id,
    staleTime: 10 * 60 * 1000,
  });
}

export function useImsStoresForSelect(
  institutionId?: string | null,
  isSuperAdmin?: boolean,
  isPermissionsLoading?: boolean
) {
  // Latch isSuperAdmin=true once determined so the query key never flips back
  // to institution-scoped during AuthProvider re-auth cycles.
  // Without this latch: the key switches 'all' → 'no-inst' while profile is
  // briefly null, the new key has no cached data, and stores=[] makes the
  // dropdown disappear until the profile reloads.
  const latchedSuperAdmin = useRef(false);
  if (isSuperAdmin) latchedSuperAdmin.current = true;
  const effectiveSuperAdmin = latchedSuperAdmin.current;

  if (process.env.NODE_ENV === 'development') {
    console.log('[useImsStoresForSelect]', {
      institutionId,
      isSuperAdmin,
      effectiveSuperAdmin,
      isPermissionsLoading,
      enabled: !isPermissionsLoading && (!!institutionId || effectiveSuperAdmin),
      queryKey: ['ims-stores-select', effectiveSuperAdmin ? 'all' : (institutionId ?? 'no-inst')],
    });
  }

  return useQuery({
    queryKey: ['ims-stores-select', effectiveSuperAdmin ? 'all' : (institutionId ?? 'no-inst')],
    queryFn: () => ImsStoreService.getStoresForSelect(institutionId, effectiveSuperAdmin),
    enabled: !isPermissionsLoading && (!!institutionId || effectiveSuperAdmin === true),
    staleTime: 10 * 60 * 1000,
    placeholderData: keepPreviousData,
    // Retry up to 3 times with exponential backoff if session isn't ready
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 8000),
  });
}

/**
 * All active stores, for the admin "allocate a store to this user" dropdown.
 *
 * Deliberately NOT useImsStoresForSelect(..., isSuperAdmin=true): that hook's
 * ['ims-stores-select', 'all'] key is shared with the IMS StoreSwitcher, so
 * priming it with the unfiltered list from an admin page would leak every
 * institution's stores into the switcher for the rest of the session.
 */
export function useImsStoresForAssignment() {
  return useQuery({
    queryKey: ['ims-stores-assignment'],
    queryFn: () => ImsStoreService.getStoresForAssignment(),
    staleTime: 10 * 60 * 1000,
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 8000),
  });
}

/**
 * Cross-institution store grants held by `userId`, for the admin edit form.
 * Super-admin only — RLS returns [] for anyone else editing another user.
 */
export function useImsUserStoreGrants(userId: string | undefined) {
  return useQuery({
    queryKey: ['ims-user-store-grants', userId],
    queryFn: () => ImsStoreService.getUserStoreGrants(userId!),
    enabled: !!userId,
    staleTime: 10 * 60 * 1000,
  });
}

export function useImsStoreByInstitution(institutionId: string | null | undefined) {
  return useQuery({
    queryKey: ['ims-store-by-institution', institutionId],
    queryFn: () => ImsStoreService.getStoreByInstitution(institutionId!),
    enabled: !!institutionId,
    staleTime: 10 * 60 * 1000,
  });
}

/** Multi-store: returns ALL active stores for an institution */
export function useImsStoresByInstitution(institutionId: string | null | undefined) {
  return useQuery({
    queryKey: ['ims-stores-by-institution', institutionId],
    queryFn: () => ImsStoreService.getStoresByInstitution(institutionId!),
    enabled: !!institutionId,
    staleTime: 10 * 60 * 1000,
  });
}

// ─── Mutation Hooks ────────────────────────────────────

export function useCreateImsStore() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateImsStoreDto) => ImsStoreService.createStore(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ims-stores'] });
      queryClient.invalidateQueries({ queryKey: ['ims-stores-select'] });
      queryClient.invalidateQueries({ queryKey: ['ims-store-by-institution'] });
    },
  });
}

export function useUpdateImsStore() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: UpdateImsStoreDto;
    }) => ImsStoreService.updateStore(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ims-stores'] });
      queryClient.invalidateQueries({ queryKey: ['ims-stores-select'] });
      queryClient.invalidateQueries({ queryKey: ['ims-store'] });
    },
  });
}

export function useDeleteImsStore() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => ImsStoreService.deleteStore(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ims-stores'] });
      queryClient.invalidateQueries({ queryKey: ['ims-stores-select'] });
      queryClient.invalidateQueries({ queryKey: ['ims-store-by-institution'] });
    },
  });
}

export function useToggleImsStoreActive() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      ImsStoreService.toggleStoreActive(id, isActive),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ims-stores'] });
      queryClient.invalidateQueries({ queryKey: ['ims-stores-select'] });
    },
  });
}
