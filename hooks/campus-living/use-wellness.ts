'use client';

/**
 * React Query wrappers for the hostel wellness pulse-survey module.
 *
 * Pairs with lib/services/campus-living/wellness-service.ts.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { WellnessService } from '@/lib/services/campus-living/wellness-service';
import type {
  CreateHostelPulseConfigDTO,
  CreateHostelPulseResponseDTO,
  PulseStatusEnum,
  UpdateHostelPulseConfigDTO,
} from '@/types/campus-living/wellness';

export const wellnessKeys = {
  all: ['campus-living', 'wellness'] as const,
  configs: (institutionId: string | undefined, filters: Record<string, unknown>) =>
    ['campus-living', 'wellness', 'configs', institutionId, filters] as const,
  config: (id: string | undefined) =>
    ['campus-living', 'wellness', 'config', id] as const,
  responses: (
    institutionId: string | undefined,
    filters: Record<string, unknown>,
  ) => ['campus-living', 'wellness', 'responses', institutionId, filters] as const,
};

// ── Configs ───────────────────────────────────────────────────────────────

export function usePulseConfigs(
  institutionId: string | undefined,
  filters?: { status?: PulseStatusEnum },
) {
  return useQuery({
    queryKey: wellnessKeys.configs(institutionId, filters ?? {}),
    queryFn: () => WellnessService.listConfigs(institutionId, filters),
    enabled: !!institutionId,
  });
}

export function usePulseConfig(id: string | undefined) {
  return useQuery({
    queryKey: wellnessKeys.config(id),
    queryFn: () => WellnessService.getConfig(id as string),
    enabled: !!id,
  });
}

export function useCreatePulseConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateHostelPulseConfigDTO) =>
      WellnessService.createConfig(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: wellnessKeys.all });
      toast.success('Pulse survey saved');
    },
    onError: (error: Error) => {
      toast.error(`Failed to save survey: ${error.message}`);
    },
  });
}

export function useUpdatePulseConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: UpdateHostelPulseConfigDTO;
    }) => WellnessService.updateConfig(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: wellnessKeys.all });
      toast.success('Survey updated');
    },
    onError: (error: Error) => {
      toast.error(`Failed to update survey: ${error.message}`);
    },
  });
}

export function useDeletePulseConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => WellnessService.deleteConfig(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: wellnessKeys.all });
      toast.success('Survey deleted');
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete survey: ${error.message}`);
    },
  });
}

// ── Responses ─────────────────────────────────────────────────────────────

export function usePulseResponses(
  institutionId: string | undefined,
  filters?: {
    config_id?: string;
    critical_only?: boolean;
    since?: string;
    limit?: number;
  },
) {
  return useQuery({
    queryKey: wellnessKeys.responses(institutionId, filters ?? {}),
    queryFn: () => WellnessService.listResponses(institutionId, filters),
    enabled: !!institutionId,
  });
}

export function useSubmitPulseResponse() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateHostelPulseResponseDTO) =>
      WellnessService.submitResponse(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: wellnessKeys.all });
      toast.success('Response submitted');
    },
    onError: (error: Error) => {
      toast.error(`Failed to submit response: ${error.message}`);
    },
  });
}
