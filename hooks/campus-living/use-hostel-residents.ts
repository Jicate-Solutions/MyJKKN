'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { HostelResidentService } from '@/lib/services/campus-living/hostel-resident-service';
import { usePermissions } from '@/hooks/use-permissions';
import type {
  CreateHostelResidentDTO,
  UpdateHostelResidentDTO,
  ResidentFilters,
} from '@/types/hostel-residents';

// Query key factory
export const hostelResidentKeys = {
  all: ['hostel-residents'] as const,
  list: (filters: Record<string, unknown>) => ['hostel-residents', 'list', filters] as const,
  detail: (id: string) => ['hostel-residents', 'detail', id] as const,
  byProfile: (institutionId: string, profileId: string) =>
    ['hostel-residents', 'by-profile', institutionId, profileId] as const,
};

// --- Query hooks ---

export function useHostelResidents(institutionId: string, filters?: ResidentFilters) {
  const { isSuperAdmin } = usePermissions();
  return useQuery({
    queryKey: hostelResidentKeys.list({ institutionId, ...filters }),
    queryFn: () => HostelResidentService.getResidents(institutionId, filters),
    enabled: isSuperAdmin || !!institutionId,
  });
}

export function useHostelResident(id: string) {
  return useQuery({
    queryKey: hostelResidentKeys.detail(id),
    queryFn: () => HostelResidentService.getResident(id),
    enabled: !!id,
  });
}

export function useResidentByProfile(institutionId: string, profileId: string | undefined) {
  return useQuery({
    queryKey: hostelResidentKeys.byProfile(institutionId, profileId ?? ''),
    queryFn: () => HostelResidentService.findByProfile(institutionId, profileId!),
    enabled: !!institutionId && !!profileId,
  });
}

// --- Mutation hooks ---

export function useCreateHostelResident() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateHostelResidentDTO) =>
      HostelResidentService.createResident(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: hostelResidentKeys.all });
      toast.success('Resident created');
    },
    onError: (error: Error) => {
      toast.error(`Failed to create resident: ${error.message}`);
    },
  });
}

// Upsert: idempotent — find-or-create. Used by allocation flow.
export function useUpsertHostelResident() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateHostelResidentDTO) =>
      HostelResidentService.upsertResident(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: hostelResidentKeys.all });
    },
    onError: (error: Error) => {
      toast.error(`Failed to upsert resident: ${error.message}`);
    },
  });
}

export function useUpdateHostelResident() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateHostelResidentDTO }) =>
      HostelResidentService.updateResident(id, payload),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: hostelResidentKeys.all });
      queryClient.invalidateQueries({ queryKey: hostelResidentKeys.detail(variables.id) });
      toast.success('Resident updated');
    },
    onError: (error: Error) => {
      toast.error(`Failed to update resident: ${error.message}`);
    },
  });
}

export function useDeactivateHostelResident() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => HostelResidentService.deactivateResident(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: hostelResidentKeys.all });
      toast.success('Resident deactivated');
    },
    onError: (error: Error) => {
      toast.error(`Failed to deactivate resident: ${error.message}`);
    },
  });
}

export function useDeleteHostelResident() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => HostelResidentService.deleteResident(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: hostelResidentKeys.all });
      toast.success('Resident deleted');
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete resident: ${error.message}`);
    },
  });
}
