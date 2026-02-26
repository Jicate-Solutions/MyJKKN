'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
    enabled: !!filters.institution_id,
    staleTime: 10 * 60 * 1000,
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
  isSuperAdmin?: boolean
) {
  return useQuery({
    queryKey: ['ims-stores-select', institutionId, isSuperAdmin],
    queryFn: () => ImsStoreService.getStoresForSelect(institutionId, isSuperAdmin),
    enabled: !!institutionId || isSuperAdmin === true,
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
