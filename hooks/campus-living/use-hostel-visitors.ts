'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { VisitorService } from '@/lib/services/campus-living/visitor-service';
import type {
  HostelVisitor,
  CreateHostelVisitorDTO,
  VisitorFilters,
} from '@/types/campus-living';

// Query key factory
export const hostelVisitorKeys = {
  all: ['hostel-visitors'] as const,
  list: (filters: Record<string, unknown>) => ['hostel-visitors', 'list', filters] as const,
  detail: (id: string) => ['hostel-visitors', 'detail', id] as const,
};

// --- Query hooks ---

export function useHostelVisitors(institutionId: string, filters?: VisitorFilters) {
  return useQuery({
    queryKey: hostelVisitorKeys.list({ institutionId, ...filters }),
    queryFn: () => VisitorService.getVisitors(institutionId, filters),
    enabled: !!institutionId,
  });
}

export function useHostelVisitor(id: string) {
  return useQuery({
    queryKey: hostelVisitorKeys.detail(id),
    queryFn: () => VisitorService.getVisitor(id),
    enabled: !!id,
  });
}

// --- Mutation hooks ---

export function useCheckInVisitor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateHostelVisitorDTO) => VisitorService.registerVisitor(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: hostelVisitorKeys.all });
      toast.success('Visitor checked in');
    },
    onError: (error: Error) => {
      toast.error(`Failed to check in visitor: ${error.message}`);
    },
  });
}

export function useCheckOutVisitor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string }) =>
      VisitorService.checkOut(id),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: hostelVisitorKeys.all });
      queryClient.invalidateQueries({ queryKey: hostelVisitorKeys.detail(variables.id) });
      toast.success('Visitor checked out');
    },
    onError: (error: Error) => {
      toast.error(`Failed to check out visitor: ${error.message}`);
    },
  });
}

export function useUpdateHostelVisitor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<CreateHostelVisitorDTO> }) =>
      VisitorService.updateVisitor(id, payload),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: hostelVisitorKeys.all });
      queryClient.invalidateQueries({ queryKey: hostelVisitorKeys.detail(variables.id) });
      toast.success('Visitor record updated');
    },
    onError: (error: Error) => {
      toast.error(`Failed to update visitor record: ${error.message}`);
    },
  });
}

export function useDeleteHostelVisitor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => VisitorService.deleteVisitor(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: hostelVisitorKeys.all });
      toast.success('Visitor record deleted');
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete visitor record: ${error.message}`);
    },
  });
}
