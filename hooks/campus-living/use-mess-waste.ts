'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { MessWasteService } from '@/lib/services/campus-living/mess-waste-service';
import type {
  MessWasteLog,
  CreateMessWasteLogDTO,
} from '@/types/campus-living';

// Query key factory
export const messWasteKeys = {
  all: ['mess-waste'] as const,
  list: (filters: Record<string, unknown>) => ['mess-waste', 'list', filters] as const,
  detail: (id: string) => ['mess-waste', 'detail', id] as const,
};

// --- Query hooks ---

export function useMessWasteLogs(institutionId: string, filters?: Record<string, unknown>) {
  return useQuery({
    queryKey: messWasteKeys.list({ institutionId, ...filters }),
    queryFn: () => MessWasteService.getWasteLogs(institutionId, filters),
    enabled: !!institutionId,
  });
}

export function useMessWasteLog(id: string) {
  return useQuery({
    queryKey: messWasteKeys.detail(id),
    queryFn: () => MessWasteService.getWasteLog(id),
    enabled: !!id,
  });
}

// --- Mutation hooks ---

export function useCreateMessWasteLog() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateMessWasteLogDTO) => MessWasteService.createWasteLog(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: messWasteKeys.all });
      toast.success('Waste log recorded');
    },
    onError: (error: Error) => {
      toast.error(`Failed to record waste log: ${error.message}`);
    },
  });
}

export function useUpdateMessWasteLog() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<CreateMessWasteLogDTO> }) =>
      MessWasteService.updateWasteLog(id, payload),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: messWasteKeys.all });
      queryClient.invalidateQueries({ queryKey: messWasteKeys.detail(variables.id) });
      toast.success('Waste log updated');
    },
    onError: (error: Error) => {
      toast.error(`Failed to update waste log: ${error.message}`);
    },
  });
}

export function useDeleteMessWasteLog() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => MessWasteService.deleteWasteLog(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: messWasteKeys.all });
      toast.success('Waste log deleted');
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete waste log: ${error.message}`);
    },
  });
}
