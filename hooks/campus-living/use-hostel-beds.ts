'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { HostelBedService } from '@/lib/services/campus-living/hostel-bed-service';
import type {
  HostelBed,
  CreateHostelBedDTO,
  UpdateHostelBedDTO,
} from '@/types/campus-living';

// Query key factory
export const hostelBedKeys = {
  all: ['hostel-beds'] as const,
  list: (filters: Record<string, unknown>) => ['hostel-beds', 'list', filters] as const,
  byRoom: (roomId: string) => ['hostel-beds', 'by-room', roomId] as const,
  detail: (id: string) => ['hostel-beds', 'detail', id] as const,
};

// --- Query hooks ---

export function useHostelBeds(institutionId: string, filters?: Record<string, unknown>) {
  return useQuery({
    queryKey: hostelBedKeys.list({ institutionId, ...filters }),
    queryFn: () => HostelBedService.getBeds(institutionId, filters),
    enabled: !!institutionId,
  });
}

export function useBedsByRoom(roomId: string) {
  return useQuery({
    queryKey: hostelBedKeys.byRoom(roomId),
    queryFn: () => HostelBedService.getBedsByRoom(roomId),
    enabled: !!roomId,
  });
}

export function useHostelBed(id: string) {
  return useQuery({
    queryKey: hostelBedKeys.detail(id),
    queryFn: () => HostelBedService.getBed(id),
    enabled: !!id,
  });
}

// --- Mutation hooks ---

export function useCreateHostelBed() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateHostelBedDTO) => HostelBedService.createBed(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: hostelBedKeys.all });
      toast.success('Bed created');
    },
    onError: (error: Error) => {
      toast.error(`Failed to create bed: ${error.message}`);
    },
  });
}

export function useUpdateHostelBed() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateHostelBedDTO }) =>
      HostelBedService.updateBed(id, payload),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: hostelBedKeys.all });
      queryClient.invalidateQueries({ queryKey: hostelBedKeys.detail(variables.id) });
      toast.success('Bed updated');
    },
    onError: (error: Error) => {
      toast.error(`Failed to update bed: ${error.message}`);
    },
  });
}

export function useDeleteHostelBed() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => HostelBedService.deleteBed(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: hostelBedKeys.all });
      toast.success('Bed deleted');
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete bed: ${error.message}`);
    },
  });
}
