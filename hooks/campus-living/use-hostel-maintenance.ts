'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { MaintenanceService } from '@/lib/services/campus-living/maintenance-service';
import type {
  HostelMaintenanceRequest,
  CreateHostelMaintenanceRequestDTO,
  MaintenanceFilters,
  MaintenanceStatus,
} from '@/types/campus-living';

// Query key factory
export const hostelMaintenanceKeys = {
  all: ['hostel-maintenance'] as const,
  list: (filters: Record<string, unknown>) => ['hostel-maintenance', 'list', filters] as const,
  detail: (id: string) => ['hostel-maintenance', 'detail', id] as const,
};

// --- Query hooks ---

export function useHostelMaintenanceRequests(institutionId: string, filters?: MaintenanceFilters) {
  return useQuery({
    queryKey: hostelMaintenanceKeys.list({ institutionId, ...filters }),
    queryFn: () => MaintenanceService.getRequests(institutionId, filters),
    enabled: !!institutionId,
  });
}

export function useHostelMaintenanceRequest(id: string) {
  return useQuery({
    queryKey: hostelMaintenanceKeys.detail(id),
    queryFn: () => MaintenanceService.getRequest(id),
    enabled: !!id,
  });
}

// --- Mutation hooks ---

export function useCreateHostelMaintenance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateHostelMaintenanceRequestDTO) =>
      MaintenanceService.createRequest(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: hostelMaintenanceKeys.all });
      toast.success('Maintenance request created');
    },
    onError: (error: Error) => {
      toast.error(`Failed to create maintenance request: ${error.message}`);
    },
  });
}

export function useAssignMaintenance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: { assigned_to_name: string; assigned_to_phone: string } }) =>
      MaintenanceService.assign(id, payload.assigned_to_name, payload.assigned_to_phone),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: hostelMaintenanceKeys.all });
      queryClient.invalidateQueries({ queryKey: hostelMaintenanceKeys.detail(variables.id) });
      toast.success('Maintenance request assigned');
    },
    onError: (error: Error) => {
      toast.error(`Failed to assign maintenance: ${error.message}`);
    },
  });
}

export function useResolveMaintenance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: { resolution_notes: string; actual_cost?: number } }) =>
      MaintenanceService.resolve(id, payload.resolution_notes, payload.actual_cost),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: hostelMaintenanceKeys.all });
      queryClient.invalidateQueries({ queryKey: hostelMaintenanceKeys.detail(variables.id) });
      toast.success('Maintenance request resolved');
    },
    onError: (error: Error) => {
      toast.error(`Failed to resolve maintenance: ${error.message}`);
    },
  });
}

export function useUpdateHostelMaintenance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<HostelMaintenanceRequest> }) =>
      MaintenanceService.updateRequest(id, payload),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: hostelMaintenanceKeys.all });
      queryClient.invalidateQueries({ queryKey: hostelMaintenanceKeys.detail(variables.id) });
      toast.success('Maintenance request updated');
    },
    onError: (error: Error) => {
      toast.error(`Failed to update maintenance request: ${error.message}`);
    },
  });
}

export function useDeleteHostelMaintenance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => MaintenanceService.deleteRequest(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: hostelMaintenanceKeys.all });
      toast.success('Maintenance request deleted');
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete maintenance request: ${error.message}`);
    },
  });
}
