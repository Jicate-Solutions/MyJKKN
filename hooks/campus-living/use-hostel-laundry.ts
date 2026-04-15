'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { usePermissions } from '@/hooks/use-permissions';
import {
  LaundryService,
  type CreateLaundryOrderDTO,
  type HostelLaundryOrder,
  type LaundryFilters,
} from '@/lib/services/campus-living/laundry-service';

// Query key factory
export const hostelLaundryKeys = {
  all: ['hostel-laundry'] as const,
  list: (filters: Record<string, unknown>) => ['hostel-laundry', 'list', filters] as const,
  detail: (id: string) => ['hostel-laundry', 'detail', id] as const,
};

// --- Query hooks ---

export function useLaundryOrders(
  institutionId: string | undefined,
  filters?: LaundryFilters
) {
  const { isSuperAdmin } = usePermissions();
  return useQuery({
    queryKey: hostelLaundryKeys.list({ institutionId, ...filters }),
    queryFn: () => LaundryService.getOrders(institutionId as string, filters),
    enabled: isSuperAdmin || !!institutionId,
  });
}

export function useLaundryOrder(id: string) {
  return useQuery({
    queryKey: hostelLaundryKeys.detail(id),
    queryFn: () => LaundryService.getOrder(id),
    enabled: !!id,
  });
}

// --- Mutation hooks ---

export function useCreateLaundryOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateLaundryOrderDTO) => LaundryService.createOrder(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: hostelLaundryKeys.all });
      toast.success('Laundry order created');
    },
    onError: (error: Error) => {
      toast.error(`Failed to create laundry order: ${error.message}`);
    },
  });
}

export function useUpdateLaundryOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<HostelLaundryOrder> }) =>
      LaundryService.updateOrder(id, payload),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: hostelLaundryKeys.all });
      queryClient.invalidateQueries({ queryKey: hostelLaundryKeys.detail(variables.id) });
      toast.success('Laundry order updated');
    },
    onError: (error: Error) => {
      toast.error(`Failed to update laundry order: ${error.message}`);
    },
  });
}

export function useDeleteLaundryOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => LaundryService.deleteOrder(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: hostelLaundryKeys.all });
      toast.success('Laundry order deleted');
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete laundry order: ${error.message}`);
    },
  });
}
