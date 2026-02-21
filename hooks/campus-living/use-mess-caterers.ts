'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { MessCatererService } from '@/lib/services/campus-living/mess-caterer-service';
import type {
  MessCaterer,
  CreateMessCatererDTO,
  UpdateMessCatererDTO,
} from '@/types/campus-living';

// Query key factory
export const messCatererKeys = {
  all: ['mess-caterers'] as const,
  list: (filters: Record<string, unknown>) => ['mess-caterers', 'list', filters] as const,
  detail: (id: string) => ['mess-caterers', 'detail', id] as const,
};

// --- Query hooks ---

export function useMessCaterers(institutionId: string, filters?: Record<string, unknown>) {
  return useQuery({
    queryKey: messCatererKeys.list({ institutionId, ...filters }),
    queryFn: () => MessCatererService.getCaterers(institutionId, filters),
    enabled: !!institutionId,
  });
}

export function useMessCaterer(id: string) {
  return useQuery({
    queryKey: messCatererKeys.detail(id),
    queryFn: () => MessCatererService.getCaterer(id),
    enabled: !!id,
  });
}

// --- Mutation hooks ---

export function useCreateMessCaterer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateMessCatererDTO) => MessCatererService.createCaterer(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: messCatererKeys.all });
      toast.success('Caterer added');
    },
    onError: (error: Error) => {
      toast.error(`Failed to add caterer: ${error.message}`);
    },
  });
}

export function useUpdateMessCaterer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateMessCatererDTO }) =>
      MessCatererService.updateCaterer(id, payload),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: messCatererKeys.all });
      queryClient.invalidateQueries({ queryKey: messCatererKeys.detail(variables.id) });
      toast.success('Caterer updated');
    },
    onError: (error: Error) => {
      toast.error(`Failed to update caterer: ${error.message}`);
    },
  });
}

export function useDeleteMessCaterer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => MessCatererService.deleteCaterer(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: messCatererKeys.all });
      toast.success('Caterer removed');
    },
    onError: (error: Error) => {
      toast.error(`Failed to remove caterer: ${error.message}`);
    },
  });
}
