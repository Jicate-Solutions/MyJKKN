'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { IncidentService } from '@/lib/services/campus-living/incident-service';
import type {
  HostelIncident,
  CreateHostelIncidentDTO,
  IncidentFilters,
} from '@/types/campus-living';

// Query key factory
export const hostelIncidentKeys = {
  all: ['hostel-incidents'] as const,
  list: (filters: Record<string, unknown>) => ['hostel-incidents', 'list', filters] as const,
  detail: (id: string) => ['hostel-incidents', 'detail', id] as const,
};

// --- Query hooks ---

export function useHostelIncidents(institutionId: string, filters?: IncidentFilters) {
  return useQuery({
    queryKey: hostelIncidentKeys.list({ institutionId, ...filters }),
    queryFn: () => IncidentService.getIncidents(institutionId, filters),
    enabled: !!institutionId,
  });
}

export function useHostelIncident(id: string) {
  return useQuery({
    queryKey: hostelIncidentKeys.detail(id),
    queryFn: () => IncidentService.getIncident(id),
    enabled: !!id,
  });
}

// --- Mutation hooks ---

export function useCreateHostelIncident() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateHostelIncidentDTO) => IncidentService.createIncident(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: hostelIncidentKeys.all });
      toast.success('Incident reported');
    },
    onError: (error: Error) => {
      toast.error(`Failed to report incident: ${error.message}`);
    },
  });
}

export function useUpdateHostelIncident() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<CreateHostelIncidentDTO> }) =>
      IncidentService.updateIncident(id, payload),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: hostelIncidentKeys.all });
      queryClient.invalidateQueries({ queryKey: hostelIncidentKeys.detail(variables.id) });
      toast.success('Incident updated');
    },
    onError: (error: Error) => {
      toast.error(`Failed to update incident: ${error.message}`);
    },
  });
}

export function useDeleteHostelIncident() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => IncidentService.deleteIncident(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: hostelIncidentKeys.all });
      toast.success('Incident deleted');
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete incident: ${error.message}`);
    },
  });
}
