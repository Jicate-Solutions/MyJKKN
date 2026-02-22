'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { HostelLeaveService } from '@/lib/services/campus-living/hostel-leave-service';
import type {
  HostelLeaveRequest,
  CreateHostelLeaveRequestDTO,
  LeaveFilters,
  LeaveStatus,
} from '@/types/campus-living';

// Query key factory
export const hostelLeaveKeys = {
  all: ['hostel-leave'] as const,
  list: (filters: Record<string, unknown>) => ['hostel-leave', 'list', filters] as const,
  detail: (id: string) => ['hostel-leave', 'detail', id] as const,
};

// --- Query hooks ---

export function useHostelLeaveRequests(institutionId: string, filters?: LeaveFilters) {
  return useQuery({
    queryKey: hostelLeaveKeys.list({ institutionId, ...filters }),
    queryFn: () => HostelLeaveService.getLeaveRequests(institutionId, filters),
    enabled: !!institutionId,
  });
}

export function useHostelLeaveRequest(id: string) {
  return useQuery({
    queryKey: hostelLeaveKeys.detail(id),
    queryFn: () => HostelLeaveService.getLeaveRequest(id),
    enabled: !!id,
  });
}

// --- Mutation hooks ---

export function useCreateHostelLeave() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateHostelLeaveRequestDTO) =>
      HostelLeaveService.createLeaveRequest(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: hostelLeaveKeys.all });
      toast.success('Leave request submitted');
    },
    onError: (error: Error) => {
      toast.error(`Failed to submit leave request: ${error.message}`);
    },
  });
}

export function useApproveLeave() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: { warden_id: string; warden_remarks?: string } }) =>
      HostelLeaveService.approveByWarden(id, payload.warden_id, payload.warden_remarks),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: hostelLeaveKeys.all });
      queryClient.invalidateQueries({ queryKey: hostelLeaveKeys.detail(variables.id) });
      toast.success('Leave approved');
    },
    onError: (error: Error) => {
      toast.error(`Failed to approve leave: ${error.message}`);
    },
  });
}

export function useRejectLeave() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: { warden_id: string; warden_remarks: string } }) =>
      HostelLeaveService.rejectByWarden(id, payload.warden_id, payload.warden_remarks),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: hostelLeaveKeys.all });
      queryClient.invalidateQueries({ queryKey: hostelLeaveKeys.detail(variables.id) });
      toast.success('Leave rejected');
    },
    onError: (error: Error) => {
      toast.error(`Failed to reject leave: ${error.message}`);
    },
  });
}

export function useUpdateHostelLeave() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<HostelLeaveRequest> }) =>
      HostelLeaveService.updateLeaveRequest(id, payload),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: hostelLeaveKeys.all });
      queryClient.invalidateQueries({ queryKey: hostelLeaveKeys.detail(variables.id) });
      toast.success('Leave request updated');
    },
    onError: (error: Error) => {
      toast.error(`Failed to update leave request: ${error.message}`);
    },
  });
}

export function useDeleteHostelLeave() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => HostelLeaveService.deleteLeaveRequest(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: hostelLeaveKeys.all });
      toast.success('Leave request deleted');
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete leave request: ${error.message}`);
    },
  });
}
