'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { HostelAllocationService } from '@/lib/services/campus-living/hostel-allocation-service';
import type {
  HostelAllocation,
  CreateHostelAllocationDTO,
  UpdateHostelAllocationDTO,
  AllocationFilters,
} from '@/types/campus-living';

// Query key factory
export const hostelAllocationKeys = {
  all: ['hostel-allocations'] as const,
  list: (filters: Record<string, unknown>) => ['hostel-allocations', 'list', filters] as const,
  active: (institutionId: string) => ['hostel-allocations', 'active', institutionId] as const,
  detail: (id: string) => ['hostel-allocations', 'detail', id] as const,
};

// --- Query hooks ---

export function useHostelAllocations(institutionId: string, filters?: AllocationFilters) {
  return useQuery({
    queryKey: hostelAllocationKeys.list({ institutionId, ...filters }),
    queryFn: () => HostelAllocationService.getAllocations(institutionId, filters),
    enabled: !!institutionId,
  });
}

export function useActiveAllocations(institutionId: string) {
  return useQuery({
    queryKey: hostelAllocationKeys.active(institutionId),
    queryFn: () => HostelAllocationService.getActiveAllocations(institutionId),
    enabled: !!institutionId,
  });
}

export function useHostelAllocation(id: string) {
  return useQuery({
    queryKey: hostelAllocationKeys.detail(id),
    queryFn: () => HostelAllocationService.getAllocation(id),
    enabled: !!id,
  });
}

// --- Mutation hooks ---

export function useCreateHostelAllocation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateHostelAllocationDTO) =>
      HostelAllocationService.createAllocation(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: hostelAllocationKeys.all });
      toast.success('Allocation created');
    },
    onError: (error: Error) => {
      toast.error(`Failed to create allocation: ${error.message}`);
    },
  });
}

export function useUpdateHostelAllocation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateHostelAllocationDTO }) =>
      HostelAllocationService.updateAllocation(id, payload),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: hostelAllocationKeys.all });
      queryClient.invalidateQueries({ queryKey: hostelAllocationKeys.detail(variables.id) });
      toast.success('Allocation updated');
    },
    onError: (error: Error) => {
      toast.error(`Failed to update allocation: ${error.message}`);
    },
  });
}

export function useTransferAllocation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: { new_room_id: string; new_bed_id: string; reason?: string } }) =>
      HostelAllocationService.transferAllocation(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: hostelAllocationKeys.all });
      toast.success('Allocation transferred');
    },
    onError: (error: Error) => {
      toast.error(`Failed to transfer allocation: ${error.message}`);
    },
  });
}

export function useVacateAllocation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: { vacate_reason: string; actual_vacate_date: string } }) =>
      HostelAllocationService.vacateAllocation(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: hostelAllocationKeys.all });
      toast.success('Allocation vacated');
    },
    onError: (error: Error) => {
      toast.error(`Failed to vacate allocation: ${error.message}`);
    },
  });
}

export function useDeleteHostelAllocation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => HostelAllocationService.deleteAllocation(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: hostelAllocationKeys.all });
      toast.success('Allocation deleted');
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete allocation: ${error.message}`);
    },
  });
}
