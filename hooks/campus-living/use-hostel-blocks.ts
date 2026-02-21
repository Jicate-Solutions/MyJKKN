'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { HostelBlockService } from '@/lib/services/campus-living/hostel-block-service';
import type {
  HostelBlock,
  CreateHostelBlockDTO,
  UpdateHostelBlockDTO,
  BlockFilters,
} from '@/types/campus-living';

// Query key factory
export const hostelBlockKeys = {
  all: ['hostel-blocks'] as const,
  list: (filters: Record<string, unknown>) => ['hostel-blocks', 'list', filters] as const,
  detail: (id: string) => ['hostel-blocks', 'detail', id] as const,
};

// --- Query hooks ---

export function useHostelBlocks(institutionId: string, filters?: BlockFilters) {
  return useQuery({
    queryKey: hostelBlockKeys.list({ institutionId, ...filters }),
    queryFn: () => HostelBlockService.getBlocks(institutionId, filters),
    enabled: !!institutionId,
  });
}

export function useHostelBlock(id: string) {
  return useQuery({
    queryKey: hostelBlockKeys.detail(id),
    queryFn: () => HostelBlockService.getBlock(id),
    enabled: !!id,
  });
}

// --- Mutation hooks ---

export function useCreateHostelBlock() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateHostelBlockDTO) => HostelBlockService.createBlock(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: hostelBlockKeys.all });
      toast.success('Hostel block created');
    },
    onError: (error: Error) => {
      toast.error(`Failed to create block: ${error.message}`);
    },
  });
}

export function useUpdateHostelBlock() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateHostelBlockDTO }) =>
      HostelBlockService.updateBlock(id, payload),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: hostelBlockKeys.all });
      queryClient.invalidateQueries({ queryKey: hostelBlockKeys.detail(variables.id) });
      toast.success('Block updated');
    },
    onError: (error: Error) => {
      toast.error(`Failed to update block: ${error.message}`);
    },
  });
}

export function useDeleteHostelBlock() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => HostelBlockService.deleteBlock(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: hostelBlockKeys.all });
      toast.success('Block deleted');
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete block: ${error.message}`);
    },
  });
}
