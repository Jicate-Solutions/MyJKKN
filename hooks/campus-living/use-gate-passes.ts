'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { GatePassService } from '@/lib/services/campus-living/gate-pass-service';
import type {
  HostelGatePass,
  CreateHostelGatePassDTO,
} from '@/types/campus-living';

// Query key factory
export const gatePassKeys = {
  all: ['gate-passes'] as const,
  list: (filters: Record<string, unknown>) => ['gate-passes', 'list', filters] as const,
  detail: (id: string) => ['gate-passes', 'detail', id] as const,
};

// --- Query hooks ---

export function useGatePasses(institutionId: string, filters?: Record<string, unknown>) {
  return useQuery({
    queryKey: gatePassKeys.list({ institutionId, ...filters }),
    queryFn: () => GatePassService.getGatePasses(institutionId, filters),
    enabled: !!institutionId,
  });
}

export function useGatePass(id: string) {
  return useQuery({
    queryKey: gatePassKeys.detail(id),
    queryFn: () => GatePassService.getGatePass(id),
    enabled: !!id,
  });
}

// --- Mutation hooks ---

export function useIssueGatePass() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateHostelGatePassDTO) => GatePassService.generateGatePass(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: gatePassKeys.all });
      toast.success('Gate pass issued');
    },
    onError: (error: Error) => {
      toast.error(`Failed to issue gate pass: ${error.message}`);
    },
  });
}

export function useReturnGatePass() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, securityId }: { id: string; securityId: string }) =>
      GatePassService.recordReturn(id, securityId),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: gatePassKeys.all });
      queryClient.invalidateQueries({ queryKey: gatePassKeys.detail(variables.id) });
      toast.success('Gate pass returned');
    },
    onError: (error: Error) => {
      toast.error(`Failed to return gate pass: ${error.message}`);
    },
  });
}

export function useUpdateGatePass() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<CreateHostelGatePassDTO> }) =>
      GatePassService.updateGatePass(id, payload),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: gatePassKeys.all });
      queryClient.invalidateQueries({ queryKey: gatePassKeys.detail(variables.id) });
      toast.success('Gate pass updated');
    },
    onError: (error: Error) => {
      toast.error(`Failed to update gate pass: ${error.message}`);
    },
  });
}

export function useDeleteGatePass() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => GatePassService.deleteGatePass(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: gatePassKeys.all });
      toast.success('Gate pass deleted');
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete gate pass: ${error.message}`);
    },
  });
}
