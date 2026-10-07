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
import { invalidateAttendanceViews } from '@/hooks/hr/use-attendance-records';

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

/**
 * Ask the server to send whatever notice this request's current state calls
 * for (HR staff harness, 2026-10-01): "awaiting approval" to the approvers
 * while pending, the decision to the requester once approved or rejected.
 * Fire-and-forget — a failure here never undoes the mutation, and the daily
 * /api/cron/hr/duty-notices run sends anything this call missed.
 */
function requestRegularizationNotice(id: string | undefined) {
  if (!id) return;
  void fetch('/api/hr/attendance/regularizations/notify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
  }).catch(
    (err) => console.warn('[hr/regularization] notice request failed', err),
  );
}

export function useSubmitRegularization() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: SubmitRegularizationDto) => submitRequest(dto),
    onSuccess: (req) => {
      toast.success('Regularization request submitted');
      requestRegularizationNotice(req.id);
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
    onSuccess: (req) => {
      toast.success('Request approved');
      requestRegularizationNotice(req.id);
      qc.invalidateQueries({ queryKey: regularizationKeys.all });
      // Approving stamps hr_attendance_records, which is what My Attendance
      // and the monthly report read. Without this the day keeps showing its
      // old verdict until the cache expires.
      invalidateAttendanceViews(qc);
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
    onSuccess: (req) => {
      toast.success('Request rejected');
      requestRegularizationNotice(req.id);
      qc.invalidateQueries({ queryKey: regularizationKeys.all });
      // Cheap, and covers a request rejected after it was already approved —
      // the day's stamp is not undone, so the view must not go stale either.
      invalidateAttendanceViews(qc);
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to reject');
    },
  });
}
