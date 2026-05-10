/**
 * React Query hooks for HR Attendance Regularization (T3.6).
 *
 * @module hooks/hr/use-regularization
 * @created 2026-05-10
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';

import {
  approveRequest,
  getCurrentEmployee,
  listAttendanceStatusTypes,
  listMyRequests,
  listPendingApprovals,
  listReasons,
  rejectRequest,
  submitRequest,
  type ApprovalFilters,
  type RegularizationRequest,
  type SubmitRegularizationDto,
} from '@/lib/services/hr/regularization-service';

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const regularizationKeys = {
  all: ['hr', 'regularization'] as const,
  reasons: () => [...regularizationKeys.all, 'reasons'] as const,
  statusTypes: () => [...regularizationKeys.all, 'status-types'] as const,
  currentEmployee: () => [...regularizationKeys.all, 'current-employee'] as const,
  myRequests: (employeeId?: string | null) =>
    [...regularizationKeys.all, 'mine', employeeId ?? 'unknown'] as const,
  pending: (filters?: ApprovalFilters) =>
    [...regularizationKeys.all, 'pending', filters ?? {}] as const,
};

// ---------------------------------------------------------------------------
// Read hooks
// ---------------------------------------------------------------------------

export function useRegularizationReasons() {
  return useQuery({
    queryKey: regularizationKeys.reasons(),
    queryFn: () => listReasons(),
    staleTime: 5 * 60 * 1000,
  });
}

export function useAttendanceStatusTypes() {
  return useQuery({
    queryKey: regularizationKeys.statusTypes(),
    queryFn: () => listAttendanceStatusTypes(),
    staleTime: 5 * 60 * 1000,
  });
}

export function useCurrentEmployee() {
  return useQuery({
    queryKey: regularizationKeys.currentEmployee(),
    queryFn: () => getCurrentEmployee(),
    staleTime: 60 * 1000,
  });
}

export function useMyRegularizations(employeeId?: string | null) {
  return useQuery({
    queryKey: regularizationKeys.myRequests(employeeId),
    queryFn: () =>
      employeeId
        ? listMyRequests(employeeId)
        : Promise.resolve([] as RegularizationRequest[]),
    enabled: !!employeeId,
  });
}

export function usePendingRegularizations(filters?: ApprovalFilters) {
  return useQuery({
    queryKey: regularizationKeys.pending(filters),
    queryFn: () => listPendingApprovals(filters),
  });
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export function useSubmitRegularization() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: SubmitRegularizationDto) => submitRequest(dto),
    onSuccess: (req) => {
      toast.success('Regularization request submitted');
      qc.invalidateQueries({ queryKey: regularizationKeys.myRequests(req.employee_id) });
      qc.invalidateQueries({ queryKey: [...regularizationKeys.all, 'pending'] });
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to submit request');
    },
  });
}

export function useApproveRegularization() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      approverProfileId,
    }: {
      id: string;
      approverProfileId: string;
    }) => approveRequest(id, approverProfileId),
    onSuccess: () => {
      toast.success('Request approved');
      qc.invalidateQueries({ queryKey: regularizationKeys.all });
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to approve');
    },
  });
}

export function useRejectRegularization() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      approverProfileId,
      reason,
    }: {
      id: string;
      approverProfileId: string;
      reason: string;
    }) => rejectRequest(id, approverProfileId, reason),
    onSuccess: () => {
      toast.success('Request rejected');
      qc.invalidateQueries({ queryKey: regularizationKeys.all });
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to reject');
    },
  });
}
