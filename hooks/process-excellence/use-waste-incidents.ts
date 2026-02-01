'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { ProcessExcellenceService } from '@/lib/services/process-excellence/process-excellence-service';
import type {
  WasteIncident,
  WasteIncidentFilters,
  CreateWasteIncidentDto,
  UpdateWasteIncidentDto,
  WasteCategory
} from '@/types/process-excellence';

// Query keys
export const wasteIncidentKeys = {
  all: ['waste-incidents'] as const,
  lists: () => [...wasteIncidentKeys.all, 'list'] as const,
  list: (filters: WasteIncidentFilters) =>
    [...wasteIncidentKeys.lists(), filters] as const,
  details: () => [...wasteIncidentKeys.all, 'detail'] as const,
  detail: (id: string) => [...wasteIncidentKeys.details(), id] as const,
  analytics: (institutionId: string, processId?: string) =>
    [...wasteIncidentKeys.all, 'analytics', institutionId, processId] as const
};

// Hook for fetching waste incidents list
export function useWasteIncidents(filters: WasteIncidentFilters) {
  return useQuery({
    queryKey: wasteIncidentKeys.list(filters),
    queryFn: () => ProcessExcellenceService.getWasteIncidents(filters),
    enabled: !!filters.institution_id,
    staleTime: 2 * 60 * 1000 // 2 minutes
  });
}

// Hook for fetching single waste incident
export function useWasteIncident(id: string) {
  return useQuery({
    queryKey: wasteIncidentKeys.detail(id),
    queryFn: () => ProcessExcellenceService.getWasteIncident(id),
    enabled: !!id,
    staleTime: 2 * 60 * 1000
  });
}

// Hook for reporting a waste incident
export function useReportWaste() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateWasteIncidentDto) =>
      ProcessExcellenceService.reportWaste(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: wasteIncidentKeys.lists() });
      toast.success('Waste incident reported successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to report waste incident');
    }
  });
}

// Hook for updating waste incident
export function useUpdateWasteIncident() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      data
    }: {
      id: string;
      data: UpdateWasteIncidentDto;
    }) => ProcessExcellenceService.updateWasteIncident(id, data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: wasteIncidentKeys.lists() });
      queryClient.invalidateQueries({
        queryKey: wasteIncidentKeys.detail(data.id)
      });
      toast.success('Waste incident updated successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update waste incident');
    }
  });
}

// Hook for resolving waste incident
export function useResolveWasteIncident() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      corrective_action
    }: {
      id: string;
      corrective_action?: string;
    }) =>
      ProcessExcellenceService.updateWasteIncident(id, {
        status: 'resolved',
        corrective_action
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: wasteIncidentKeys.lists() });
      queryClient.invalidateQueries({
        queryKey: wasteIncidentKeys.detail(data.id)
      });
      toast.success('Waste incident resolved');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to resolve waste incident');
    }
  });
}

// Hook for deleting waste incident
export function useDeleteWasteIncident() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      ProcessExcellenceService.deleteWasteIncident(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: wasteIncidentKeys.lists() });
      toast.success('Waste incident deleted');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete waste incident');
    }
  });
}

// Hook for waste analytics
export function useWasteAnalytics(institutionId: string, processId?: string) {
  return useQuery({
    queryKey: wasteIncidentKeys.analytics(institutionId, processId),
    queryFn: () =>
      ProcessExcellenceService.getWasteAnalytics(institutionId, processId),
    enabled: !!institutionId,
    staleTime: 5 * 60 * 1000 // 5 minutes
  });
}

// Hook for open waste incidents
export function useOpenWasteIncidents(institutionId: string) {
  return useQuery({
    queryKey: [...wasteIncidentKeys.lists(), 'open', institutionId],
    queryFn: () =>
      ProcessExcellenceService.getWasteIncidents({
        institution_id: institutionId,
        status: 'open',
        limit: 50
      }),
    enabled: !!institutionId,
    staleTime: 2 * 60 * 1000,
    select: (data) => data.data
  });
}

// Hook for waste incidents by category
export function useWasteIncidentsByCategory(
  institutionId: string,
  category: WasteCategory
) {
  return useQuery({
    queryKey: [...wasteIncidentKeys.lists(), 'category', institutionId, category],
    queryFn: () =>
      ProcessExcellenceService.getWasteIncidents({
        institution_id: institutionId,
        waste_category: category,
        limit: 50
      }),
    enabled: !!institutionId && !!category,
    staleTime: 2 * 60 * 1000,
    select: (data) => data.data
  });
}
