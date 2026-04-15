'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { usePermissions } from '@/hooks/use-permissions';
import { InspectionService } from '@/lib/services/campus-living/inspection-service';
import type {
  HostelInspection,
  CreateHostelInspectionDTO,
} from '@/types/campus-living';

// Query key factory
export const hostelInspectionKeys = {
  all: ['hostel-inspections'] as const,
  list: (filters: Record<string, unknown>) => ['hostel-inspections', 'list', filters] as const,
  detail: (id: string) => ['hostel-inspections', 'detail', id] as const,
};

// --- Query hooks ---

export function useHostelInspections(institutionId: string | undefined, filters?: Record<string, unknown>) {
  const { isSuperAdmin } = usePermissions();
  return useQuery({
    queryKey: hostelInspectionKeys.list({ institutionId, ...filters }),
    queryFn: () => InspectionService.getInspections(institutionId as string, filters),
    enabled: isSuperAdmin || !!institutionId,
  });
}

export function useHostelInspection(id: string) {
  return useQuery({
    queryKey: hostelInspectionKeys.detail(id),
    queryFn: () => InspectionService.getInspection(id),
    enabled: !!id,
  });
}

// --- Mutation hooks ---

export function useCreateHostelInspection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateHostelInspectionDTO) => InspectionService.createInspection(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: hostelInspectionKeys.all });
      toast.success('Inspection recorded');
    },
    onError: (error: Error) => {
      toast.error(`Failed to record inspection: ${error.message}`);
    },
  });
}

export function useUpdateHostelInspection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<CreateHostelInspectionDTO> }) =>
      InspectionService.updateInspection(id, payload),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: hostelInspectionKeys.all });
      queryClient.invalidateQueries({ queryKey: hostelInspectionKeys.detail(variables.id) });
      toast.success('Inspection updated');
    },
    onError: (error: Error) => {
      toast.error(`Failed to update inspection: ${error.message}`);
    },
  });
}

export function useDeleteHostelInspection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => InspectionService.deleteInspection(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: hostelInspectionKeys.all });
      toast.success('Inspection deleted');
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete inspection: ${error.message}`);
    },
  });
}
