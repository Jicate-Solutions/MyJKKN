'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { HostelWardenService } from '@/lib/services/campus-living/hostel-warden-service';
import type {
  HostelWarden,
  CreateHostelWardenDTO,
  UpdateHostelWardenDTO,
} from '@/types/campus-living';

// Query key factory
export const hostelWardenKeys = {
  all: ['hostel-wardens'] as const,
  list: (filters: Record<string, unknown>) => ['hostel-wardens', 'list', filters] as const,
  detail: (id: string) => ['hostel-wardens', 'detail', id] as const,
};

// --- Query hooks ---

export function useHostelWardens(institutionId: string, filters?: Record<string, unknown>) {
  return useQuery({
    queryKey: hostelWardenKeys.list({ institutionId, ...filters }),
    queryFn: () => HostelWardenService.getWardens(institutionId, filters),
    enabled: !!institutionId,
  });
}

export function useHostelWarden(id: string) {
  return useQuery({
    queryKey: hostelWardenKeys.detail(id),
    queryFn: () => HostelWardenService.getWarden(id),
    enabled: !!id,
  });
}

// --- Mutation hooks ---

export function useCreateHostelWarden() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateHostelWardenDTO) => HostelWardenService.createWarden(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: hostelWardenKeys.all });
      toast.success('Warden assigned');
    },
    onError: (error: Error) => {
      toast.error(`Failed to assign warden: ${error.message}`);
    },
  });
}

export function useUpdateHostelWarden() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateHostelWardenDTO }) =>
      HostelWardenService.updateWarden(id, payload),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: hostelWardenKeys.all });
      queryClient.invalidateQueries({ queryKey: hostelWardenKeys.detail(variables.id) });
      toast.success('Warden updated');
    },
    onError: (error: Error) => {
      toast.error(`Failed to update warden: ${error.message}`);
    },
  });
}

export function useDeleteHostelWarden() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => HostelWardenService.deleteWarden(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: hostelWardenKeys.all });
      toast.success('Warden removed');
    },
    onError: (error: Error) => {
      toast.error(`Failed to remove warden: ${error.message}`);
    },
  });
}
