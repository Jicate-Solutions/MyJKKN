'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ImsSalesService } from '@/lib/services/ims/sales-service';
import type { ImsSaleFilters, CreateImsSaleDto } from '@/types/ims';

export function useImsSales(filters: ImsSaleFilters) {
  return useQuery({
    queryKey: ['ims-sales', filters],
    queryFn: () => ImsSalesService.getSales(filters),
    enabled: !!(filters.store_id || filters.institution_id),
    staleTime: 60 * 1000,
  });
}

export function useImsSale(id: string) {
  return useQuery({
    queryKey: ['ims-sale', id],
    queryFn: () => ImsSalesService.getSale(id),
    enabled: !!id,
    staleTime: 60 * 1000,
  });
}

export function useImsSellableItems(storeId: string, institutionId?: string) {
  return useQuery({
    queryKey: ['ims-sellable-items', storeId],
    queryFn: () => ImsSalesService.getSellableItems(storeId, institutionId),
    enabled: !!storeId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreateImsSale() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ data, userId }: { data: CreateImsSaleDto; userId: string }) =>
      ImsSalesService.createSale(data, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ims-sales'] });
      queryClient.invalidateQueries({ queryKey: ['ims-sellable-items'] });
      queryClient.invalidateQueries({ queryKey: ['ims-stock-summary'] });
      queryClient.invalidateQueries({ queryKey: ['ims-dashboard-stats'] });
    },
  });
}

export function useCancelImsSale() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      reason,
      itemsReturned,
    }: {
      id: string;
      reason: string;
      itemsReturned?: boolean;
    }) => ImsSalesService.cancelSale(id, reason, itemsReturned),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ims-sales'] });
      queryClient.invalidateQueries({ queryKey: ['ims-sale'] });
      queryClient.invalidateQueries({ queryKey: ['ims-stock-summary'] });
    },
  });
}

export function useImsDailySalesSummary(storeId: string, date: string, institutionId?: string) {
  return useQuery({
    queryKey: ['ims-daily-sales', storeId, date],
    queryFn: () => ImsSalesService.getDailySalesSummary(storeId, date, institutionId),
    enabled: !!storeId && !!date,
    staleTime: 60 * 1000,
  });
}

export function useImsValidateStock() {
  return useMutation({
    mutationFn: ({ items, storeId }: {
      items: Array<{ item_id: string; quantity: number; name?: string }>;
      storeId: string;
    }) => ImsSalesService.validateStock(items, storeId),
  });
}
