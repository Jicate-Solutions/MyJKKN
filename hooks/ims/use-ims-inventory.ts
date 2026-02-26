'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ImsInventoryService } from '@/lib/services/ims/inventory-service';
import { ImsCategoryService } from '@/lib/services/ims/category-service';
import type {
  ImsItemFilters,
  ImsCategoryFilters,
  CreateImsItemDto,
  UpdateImsItemDto,
  CreateImsCategoryDto,
  UpdateImsCategoryDto,
} from '@/types/ims';

// ─── Items ───────────────────────────────────────────────

export function useImsItems(filters: ImsItemFilters) {
  return useQuery({
    queryKey: ['ims-items', filters],
    queryFn: () => ImsInventoryService.getItems(filters),
    enabled: !!(filters.store_id || filters.institution_id),
    staleTime: 2 * 60 * 1000,
  });
}

export function useImsItem(id: string) {
  return useQuery({
    queryKey: ['ims-item', id],
    queryFn: () => ImsInventoryService.getItem(id),
    enabled: !!id,
    staleTime: 2 * 60 * 1000,
  });
}

export function useImsItemsForSelect(storeId: string, institutionId?: string) {
  return useQuery({
    queryKey: ['ims-items-select', storeId],
    queryFn: () => ImsInventoryService.getItemsForSelect(storeId, institutionId),
    enabled: !!storeId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreateImsItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateImsItemDto) => ImsInventoryService.createItem(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ims-items'] });
      queryClient.invalidateQueries({ queryKey: ['ims-items-select'] });
    },
  });
}

export function useUpdateImsItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateImsItemDto }) =>
      ImsInventoryService.updateItem(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ims-items'] });
      queryClient.invalidateQueries({ queryKey: ['ims-item'] });
      queryClient.invalidateQueries({ queryKey: ['ims-sellable-items'] });
      queryClient.invalidateQueries({ queryKey: ['ims-items-select'] });
    },
  });
}

export function useDeleteImsItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => ImsInventoryService.deleteItem(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ims-items'] });
    },
  });
}

export function useToggleImsItemActive() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      ImsInventoryService.toggleItemActive(id, isActive),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ims-items'] });
      queryClient.invalidateQueries({ queryKey: ['ims-sellable-items'] });
    },
  });
}

// ─── Categories ──────────────────────────────────────────

export function useImsCategories(filters: ImsCategoryFilters) {
  return useQuery({
    queryKey: ['ims-categories', filters],
    queryFn: () => ImsCategoryService.getCategories(filters),
    enabled: !!filters.store_id,
    staleTime: 10 * 60 * 1000,
  });
}

export function useImsCategoriesForSelect(storeId?: string) {
  return useQuery({
    queryKey: ['ims-categories-select', storeId],
    queryFn: () => ImsCategoryService.getCategoriesForSelect(storeId),
    staleTime: 10 * 60 * 1000,
  });
}

export function useCreateImsCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateImsCategoryDto) => ImsCategoryService.createCategory(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ims-categories'] });
      queryClient.invalidateQueries({ queryKey: ['ims-categories-select'] });
    },
  });
}

export function useUpdateImsCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateImsCategoryDto }) =>
      ImsCategoryService.updateCategory(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ims-categories'] });
    },
  });
}

export function useDeleteImsCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => ImsCategoryService.deleteCategory(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ims-categories'] });
      queryClient.invalidateQueries({ queryKey: ['ims-categories-select'] });
    },
  });
}
