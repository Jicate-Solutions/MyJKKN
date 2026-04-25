'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { usePermissions } from '@/hooks/use-permissions';
import {
  HealthService,
  type CreateHealthCaseDTO,
  type HostelHealthCase,
  type HealthFilters,
} from '@/lib/services/campus-living/health-service';

// Query key factory
export const hostelHealthKeys = {
  all: ['hostel-health'] as const,
  list: (filters: Record<string, unknown>) => ['hostel-health', 'list', filters] as const,
  detail: (id: string) => ['hostel-health', 'detail', id] as const,
};

// --- Query hooks ---

export function useHealthCases(
  institutionId: string | undefined,
  filters?: HealthFilters
) {
  const { isSuperAdmin } = usePermissions();
  return useQuery({
    queryKey: hostelHealthKeys.list({ institutionId, ...filters }),
    queryFn: () => HealthService.getCases(isSuperAdmin ? undefined : institutionId, filters),
    enabled: isSuperAdmin || !!institutionId,
  });
}

export function useHealthCase(id: string) {
  return useQuery({
    queryKey: hostelHealthKeys.detail(id),
    queryFn: () => HealthService.getCase(id),
    enabled: !!id,
  });
}

// --- Mutation hooks ---

export function useCreateHealthCase() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateHealthCaseDTO) => HealthService.createCase(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: hostelHealthKeys.all });
      toast.success('Health case logged');
    },
    onError: (error: Error) => {
      toast.error(`Failed to log health case: ${error.message}`);
    },
  });
}

export function useUpdateHealthCase() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<HostelHealthCase> }) =>
      HealthService.updateCase(id, payload),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: hostelHealthKeys.all });
      queryClient.invalidateQueries({ queryKey: hostelHealthKeys.detail(variables.id) });
      toast.success('Health case updated');
    },
    onError: (error: Error) => {
      toast.error(`Failed to update health case: ${error.message}`);
    },
  });
}

export function useDeleteHealthCase() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => HealthService.deleteCase(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: hostelHealthKeys.all });
      toast.success('Health case deleted');
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete health case: ${error.message}`);
    },
  });
}
