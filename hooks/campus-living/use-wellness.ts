'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { WellnessService } from '@/lib/services/campus-living/wellness-service';
import type {
  CreatePulseConfigDTO,
  PulseConfigFilters,
  SubmitPulseResponseDTO,
  PulseResponseFilters,
  HostelPulseConfig,
} from '@/types/campus-living';

// Query key factory
export const wellnessKeys = {
  all: ['wellness'] as const,
  configs: (filters: Record<string, unknown>) => ['wellness', 'configs', filters] as const,
  config: (id: string) => ['wellness', 'config', id] as const,
  responses: (filters: Record<string, unknown>) => ['wellness', 'responses', filters] as const,
  moodTrends: (filters: Record<string, unknown>) => ['wellness', 'mood-trends', filters] as const,
  flagged: (institutionId: string) => ['wellness', 'flagged', institutionId] as const,
};

// --- Query hooks ---

export function usePulseConfigs(institutionId: string, filters?: PulseConfigFilters) {
  return useQuery({
    queryKey: wellnessKeys.configs({ institutionId, ...filters }),
    queryFn: () => WellnessService.getPulseConfigs(institutionId, filters),
    enabled: !!institutionId,
  });
}

export function usePulseConfig(id: string) {
  return useQuery({
    queryKey: wellnessKeys.config(id),
    queryFn: () => WellnessService.getPulseConfig(id),
    enabled: !!id,
  });
}

export function usePulseResponses(institutionId: string, filters?: PulseResponseFilters) {
  return useQuery({
    queryKey: wellnessKeys.responses({ institutionId, ...filters }),
    queryFn: () => WellnessService.getResponses(institutionId, filters),
    enabled: !!institutionId,
  });
}

export function useMoodTrends(institutionId: string, dateFrom?: string, dateTo?: string, blockId?: string) {
  return useQuery({
    queryKey: wellnessKeys.moodTrends({ institutionId, dateFrom, dateTo, blockId }),
    queryFn: () => WellnessService.getMoodTrends(institutionId, dateFrom, dateTo, blockId),
    enabled: !!institutionId,
  });
}

export function useFlaggedStudents(institutionId: string) {
  return useQuery({
    queryKey: wellnessKeys.flagged(institutionId),
    queryFn: () => WellnessService.getFlaggedStudents(institutionId),
    enabled: !!institutionId,
  });
}

// --- Mutation hooks ---

export function useCreatePulseConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreatePulseConfigDTO) => WellnessService.createPulseConfig(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: wellnessKeys.all });
      toast.success('Pulse survey created');
    },
    onError: (error: Error) => {
      toast.error(`Failed to create pulse survey: ${error.message}`);
    },
  });
}

export function useUpdatePulseConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<HostelPulseConfig> }) =>
      WellnessService.updatePulseConfig(id, payload),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: wellnessKeys.all });
      queryClient.invalidateQueries({ queryKey: wellnessKeys.config(variables.id) });
      toast.success('Pulse survey updated');
    },
    onError: (error: Error) => {
      toast.error(`Failed to update pulse survey: ${error.message}`);
    },
  });
}

export function useActivatePulse() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => WellnessService.activatePulse(id),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: wellnessKeys.all });
      queryClient.invalidateQueries({ queryKey: wellnessKeys.config(id) });
      toast.success('Survey activated');
    },
    onError: (error: Error) => {
      toast.error(`Failed to activate survey: ${error.message}`);
    },
  });
}

export function usePausePulse() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => WellnessService.pausePulse(id),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: wellnessKeys.all });
      queryClient.invalidateQueries({ queryKey: wellnessKeys.config(id) });
      toast.success('Survey paused');
    },
    onError: (error: Error) => {
      toast.error(`Failed to pause survey: ${error.message}`);
    },
  });
}

export function useArchivePulse() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => WellnessService.archivePulse(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: wellnessKeys.all });
      toast.success('Survey archived');
    },
    onError: (error: Error) => {
      toast.error(`Failed to archive survey: ${error.message}`);
    },
  });
}

export function useSubmitPulseResponse() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: SubmitPulseResponseDTO) => WellnessService.submitResponse(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: wellnessKeys.all });
      toast.success('Response submitted');
    },
    onError: (error: Error) => {
      toast.error(`Failed to submit response: ${error.message}`);
    },
  });
}
