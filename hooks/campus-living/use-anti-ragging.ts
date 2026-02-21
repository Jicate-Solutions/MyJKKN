'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AntiRaggingService } from '@/lib/services/campus-living/anti-ragging-service';
import type {
  AntiRaggingAffidavit,
  CreateAntiRaggingAffidavitDTO,
} from '@/types/campus-living';

// Query key factory
export const antiRaggingKeys = {
  all: ['anti-ragging'] as const,
  list: (filters: Record<string, unknown>) => ['anti-ragging', 'list', filters] as const,
  detail: (id: string) => ['anti-ragging', 'detail', id] as const,
};

// --- Query hooks ---

export function useAntiRaggingAffidavits(institutionId: string, filters?: Record<string, unknown>) {
  return useQuery({
    queryKey: antiRaggingKeys.list({ institutionId, ...filters }),
    queryFn: () => AntiRaggingService.getAffidavits(institutionId, filters),
    enabled: !!institutionId,
  });
}

export function useAntiRaggingAffidavit(id: string) {
  return useQuery({
    queryKey: antiRaggingKeys.detail(id),
    queryFn: () => AntiRaggingService.getAffidavit(id),
    enabled: !!id,
  });
}

// --- Mutation hooks ---

export function useCreateAntiRaggingAffidavit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateAntiRaggingAffidavitDTO) =>
      AntiRaggingService.createAffidavit(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: antiRaggingKeys.all });
      toast.success('Affidavit submitted');
    },
    onError: (error: Error) => {
      toast.error(`Failed to submit affidavit: ${error.message}`);
    },
  });
}

export function useUpdateAntiRaggingAffidavit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<CreateAntiRaggingAffidavitDTO> }) =>
      AntiRaggingService.updateAffidavit(id, payload),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: antiRaggingKeys.all });
      queryClient.invalidateQueries({ queryKey: antiRaggingKeys.detail(variables.id) });
      toast.success('Affidavit updated');
    },
    onError: (error: Error) => {
      toast.error(`Failed to update affidavit: ${error.message}`);
    },
  });
}

export function useDeleteAntiRaggingAffidavit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => AntiRaggingService.deleteAffidavit(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: antiRaggingKeys.all });
      toast.success('Affidavit deleted');
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete affidavit: ${error.message}`);
    },
  });
}
