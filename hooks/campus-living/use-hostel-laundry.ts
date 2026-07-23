'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { usePermissions } from '@/hooks/use-permissions';
import {
  LaundryService,
  type CreateLaundryOrderDTO,
  type CreateLaundryConfigDTO,
  type HostelLaundryOrder,
  type HostelLaundryConfig,
  type LaundryFilters,
  type LaundryConfigFilters,
} from '@/lib/services/campus-living/laundry-service';

// Query key factory
export const hostelLaundryKeys = {
  all: ['hostel-laundry'] as const,
  list: (filters: Record<string, unknown>) => ['hostel-laundry', 'list', filters] as const,
  detail: (id: string) => ['hostel-laundry', 'detail', id] as const,
  configs: ['hostel-laundry', 'configs'] as const,
  configList: (filters: Record<string, unknown>) =>
    ['hostel-laundry', 'configs', 'list', filters] as const,
  configDetail: (id: string) => ['hostel-laundry', 'configs', 'detail', id] as const,
};

// --- Query hooks ---

export function useLaundryOrders(
  institutionId: string | undefined,
  filters?: LaundryFilters
) {
  const { isSuperAdmin } = usePermissions();
  return useQuery({
    queryKey: hostelLaundryKeys.list({ institutionId, ...filters }),
    queryFn: () => LaundryService.getOrders(isSuperAdmin ? undefined : institutionId, filters),
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

// --- Laundry config hooks (hostel_laundry_configs) ---

export function useLaundryConfigs(
  institutionId: string | undefined,
  filters?: LaundryConfigFilters
) {
  const { isSuperAdmin } = usePermissions();
  return useQuery({
    queryKey: hostelLaundryKeys.configList({ institutionId, ...filters }),
    queryFn: () =>
      LaundryService.getConfigs(isSuperAdmin ? undefined : institutionId, filters),
    enabled: isSuperAdmin || !!institutionId,
  });
}

export function useLaundryConfig(id: string) {
  return useQuery({
    queryKey: hostelLaundryKeys.configDetail(id),
    queryFn: () => LaundryService.getConfig(id),
    enabled: !!id,
  });
}

export function useCreateLaundryConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateLaundryConfigDTO) => LaundryService.createConfig(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: hostelLaundryKeys.configs });
      toast.success('Laundry configuration created');
    },
    onError: (error: Error) => {
      toast.error(`Failed to create laundry configuration: ${error.message}`);
    },
  });
}

export function useUpdateLaundryConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<HostelLaundryConfig> }) =>
      LaundryService.updateConfig(id, payload),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: hostelLaundryKeys.configs });
      queryClient.invalidateQueries({
        queryKey: hostelLaundryKeys.configDetail(variables.id),
      });
      toast.success('Laundry configuration updated');
    },
    onError: (error: Error) => {
      toast.error(`Failed to update laundry configuration: ${error.message}`);
    },
  });
}

export function useDeleteLaundryConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => LaundryService.deleteConfig(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: hostelLaundryKeys.configs });
      toast.success('Laundry configuration deleted');
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete laundry configuration: ${error.message}`);
    },
  });
}
