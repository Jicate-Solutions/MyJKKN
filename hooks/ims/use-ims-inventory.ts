'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ImsInventoryService } from '@/lib/services/ims/inventory-service';
import type { ImsItemForSelect } from '@/lib/services/ims/inventory-service';
import { ImsCategoryService } from '@/lib/services/ims/category-service';
import type {
  ImsItemFilters,
  ImsCategoryFilters,
  CreateImsItemDto,
  UpdateImsItemDto,
  CreateImsCategoryDto,
  UpdateImsCategoryDto,
} from '@/types/ims';

// Re-export so callers can type the hook's data without importing from the service directly
export type { ImsItemForSelect };

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
  return useQuery<ImsItemForSelect[]>({
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
      // A delete now also clears the item's stock rows, its store listings and any
      // batches, so the stock and POS views are stale too — not just the list.
      queryClient.invalidateQueries({ queryKey: ['ims-items'] });
      queryClient.invalidateQueries({ queryKey: ['ims-items-select'] });
      queryClient.invalidateQueries({ queryKey: ['ims-sellable-items'] });
      queryClient.invalidateQueries({ queryKey: ['ims-stock-summary'] });
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

/**
 * Bulk "add to POS" / "remove from POS".
 *
 * Invalidates ims-sellable-items as well as ims-items — that is the query the till
 * itself reads, so without it a cashier keeps seeing the old catalogue.
 */
export function useSetPosVisibility() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof ImsInventoryService.setPosVisibility>[0]) =>
      ImsInventoryService.setPosVisibility(input),
    onSuccess: (result, variables) => {
      queryClient.invalidateQueries({ queryKey: ['ims-items'] });
      queryClient.invalidateQueries({ queryKey: ['ims-sellable-items'] });
      toast.success(
        variables.action === 'add'
          ? `${result.updated} item${result.updated === 1 ? '' : 's'} now sell at the counter`
          : `${result.updated} item${result.updated === 1 ? '' : 's'} removed from the counter`,
      );
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

/**
 * List existing catalogue items at a store, or delist them.
 *
 * Separate from the POS toggle on purpose: "we carry this" and "we sell this at
 * the counter" are different decisions, and a store can carry something it only
 * issues to departments.
 */
export function useAddItemsToStore() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ storeId, itemIds }: { storeId: string; itemIds: string[] }) =>
      ImsInventoryService.addItemsToStore(storeId, itemIds),
    onSuccess: (added) => {
      queryClient.invalidateQueries({ queryKey: ['ims-items'] });
      queryClient.invalidateQueries({ queryKey: ['ims-items-select'] });
      toast.success(
        added === 0
          ? 'Those items were already in this store'
          : `${added} item${added === 1 ? '' : 's'} added to this store`,
      );
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useRemoveItemsFromStore() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ storeId, itemIds }: { storeId: string; itemIds: string[] }) =>
      ImsInventoryService.removeItemsFromStore(storeId, itemIds),
    onSuccess: (removed, variables) => {
      queryClient.invalidateQueries({ queryKey: ['ims-items'] });
      queryClient.invalidateQueries({ queryKey: ['ims-items-select'] });
      queryClient.invalidateQueries({ queryKey: ['ims-sellable-items'] });
      const skipped = variables.itemIds.length - removed;
      toast.success(
        skipped > 0
          ? `${removed} removed. ${skipped} kept — this store still holds stock of ${skipped === 1 ? 'it' : 'them'}.`
          : `${removed} item${removed === 1 ? '' : 's'} removed from this store`,
      );
    },
    onError: (err: Error) => toast.error(err.message),
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
