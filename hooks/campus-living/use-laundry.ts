'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { LaundryService } from '@/lib/services/campus-living/laundry-service';
import type {
  CreateLaundryConfigDTO,
  LaundryConfigFilters,
  CreateLaundryOrderDTO,
  LaundryOrderFilters,
  LaundryItem,
  HostelLaundryConfig,
} from '@/types/campus-living';

// Query key factory
export const laundryKeys = {
  all: ['laundry'] as const,
  configs: (filters: Record<string, unknown>) => ['laundry', 'configs', filters] as const,
  config: (id: string) => ['laundry', 'config', id] as const,
  orders: (filters: Record<string, unknown>) => ['laundry', 'orders', filters] as const,
  order: (id: string) => ['laundry', 'order', id] as const,
  studentHistory: (learnerId: string) => ['laundry', 'student', learnerId] as const,
  schedule: (filters: Record<string, unknown>) => ['laundry', 'schedule', filters] as const,
  stats: (filters: Record<string, unknown>) => ['laundry', 'stats', filters] as const,
};

// --- Query hooks ---

export function useLaundryConfigs(institutionId: string, filters?: LaundryConfigFilters) {
  return useQuery({
    queryKey: laundryKeys.configs({ institutionId, ...filters }),
    queryFn: () => LaundryService.getConfigs(institutionId, filters),
    enabled: !!institutionId,
  });
}

export function useLaundryConfig(id: string) {
  return useQuery({
    queryKey: laundryKeys.config(id),
    queryFn: () => LaundryService.getConfig(id),
    enabled: !!id,
  });
}

export function useLaundryOrders(institutionId: string, filters?: LaundryOrderFilters) {
  return useQuery({
    queryKey: laundryKeys.orders({ institutionId, ...filters }),
    queryFn: () => LaundryService.getOrders(institutionId, filters),
    enabled: !!institutionId,
  });
}

export function useLaundryOrder(id: string) {
  return useQuery({
    queryKey: laundryKeys.order(id),
    queryFn: () => LaundryService.getOrder(id),
    enabled: !!id,
  });
}

export function useStudentLaundryHistory(learnerId: string) {
  return useQuery({
    queryKey: laundryKeys.studentHistory(learnerId),
    queryFn: () => LaundryService.getStudentHistory(learnerId),
    enabled: !!learnerId,
  });
}

export function useDailyLaundrySchedule(institutionId: string, dayOfWeek: number) {
  return useQuery({
    queryKey: laundryKeys.schedule({ institutionId, dayOfWeek }),
    queryFn: () => LaundryService.getDailySchedule(institutionId, dayOfWeek),
    enabled: !!institutionId,
  });
}

export function useLaundryStats(institutionId: string, dateFrom?: string, dateTo?: string) {
  return useQuery({
    queryKey: laundryKeys.stats({ institutionId, dateFrom, dateTo }),
    queryFn: () => LaundryService.getStats(institutionId, dateFrom, dateTo),
    enabled: !!institutionId,
  });
}

// --- Mutation hooks ---

export function useCreateLaundryConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateLaundryConfigDTO) => LaundryService.createConfig(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: laundryKeys.all });
      toast.success('Laundry config created');
    },
    onError: (error: Error) => {
      toast.error(`Failed to create laundry config: ${error.message}`);
    },
  });
}

export function useUpdateLaundryConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<HostelLaundryConfig> }) =>
      LaundryService.updateConfig(id, payload),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: laundryKeys.all });
      queryClient.invalidateQueries({ queryKey: laundryKeys.config(variables.id) });
      toast.success('Laundry config updated');
    },
    onError: (error: Error) => {
      toast.error(`Failed to update laundry config: ${error.message}`);
    },
  });
}

export function useCreateLaundryOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateLaundryOrderDTO) => LaundryService.createOrder(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: laundryKeys.all });
      toast.success('Laundry order created');
    },
    onError: (error: Error) => {
      toast.error(`Failed to create laundry order: ${error.message}`);
    },
  });
}

export function useCollectLaundryOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => LaundryService.collectOrder(id),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: laundryKeys.all });
      queryClient.invalidateQueries({ queryKey: laundryKeys.order(id) });
      toast.success('Order collected');
    },
    onError: (error: Error) => {
      toast.error(`Failed to collect order: ${error.message}`);
    },
  });
}

export function useMarkLaundryReady() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => LaundryService.markReady(id),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: laundryKeys.all });
      queryClient.invalidateQueries({ queryKey: laundryKeys.order(id) });
      toast.success('Order ready for pickup');
    },
    onError: (error: Error) => {
      toast.error(`Failed to mark order ready: ${error.message}`);
    },
  });
}

export function useDeliverLaundryOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, returnedItems }: { id: string; returnedItems: LaundryItem[] }) =>
      LaundryService.deliverOrder(id, returnedItems),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: laundryKeys.all });
      queryClient.invalidateQueries({ queryKey: laundryKeys.order(variables.id) });
      toast.success('Order delivered');
    },
    onError: (error: Error) => {
      toast.error(`Failed to deliver order: ${error.message}`);
    },
  });
}

export function useConfirmLaundryDelivery() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => LaundryService.confirmDelivery(id),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: laundryKeys.all });
      queryClient.invalidateQueries({ queryKey: laundryKeys.order(id) });
      toast.success('Delivery confirmed');
    },
    onError: (error: Error) => {
      toast.error(`Failed to confirm delivery: ${error.message}`);
    },
  });
}

export function useRaiseLaundryDispute() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      LaundryService.raiseDispute(id, reason),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: laundryKeys.all });
      queryClient.invalidateQueries({ queryKey: laundryKeys.order(variables.id) });
      toast.success('Dispute raised');
    },
    onError: (error: Error) => {
      toast.error(`Failed to raise dispute: ${error.message}`);
    },
  });
}
