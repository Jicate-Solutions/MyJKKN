'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  HRLeaveApplication,
  HRLeaveApplicationInsert,
  HRLeaveBalanceWithType,
  HRLeaveEncashment,
  HRLeaveApplicationComment,
  HRCalendarEntry,
  LeaveApplicationStatus,
} from '@/types/hr';

const BASE = '/api/hr/leave';

// =====================================================================================
// Queries
// =====================================================================================

export function useMyApplications(employeeId: string | undefined) {
  return useQuery({
    queryKey: ['hr-leave-applications', 'mine', employeeId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (employeeId) params.set('employee_id', employeeId);
      const res = await fetch(`${BASE}/applications?${params}`);
      if (!res.ok) throw new Error(`Applications list failed: ${res.status}`);
      return (await res.json()) as { data: HRLeaveApplication[]; metadata: { total: number } };
    },
    enabled: !!employeeId,
  });
}

export function useApprovalInbox(hrOrgId: string | undefined, approverId: string | undefined) {
  return useQuery({
    queryKey: ['hr-leave-applications', 'inbox', hrOrgId, approverId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (hrOrgId) params.set('hr_organization_id', hrOrgId);
      if (approverId) params.set('pending_approver_id', approverId);
      params.set('status', 'pending');
      const res = await fetch(`${BASE}/applications?${params}`);
      if (!res.ok) throw new Error(`Inbox failed: ${res.status}`);
      return (await res.json()) as { data: HRLeaveApplication[]; metadata: { total: number } };
    },
    enabled: !!hrOrgId && !!approverId,
  });
}

export function useApplication(applicationId: string | undefined) {
  return useQuery({
    queryKey: ['hr-leave-application', applicationId],
    queryFn: async () => {
      const res = await fetch(`${BASE}/applications/${applicationId}`);
      if (!res.ok) throw new Error(`Application fetch failed: ${res.status}`);
      return ((await res.json()).data) as HRLeaveApplication;
    },
    enabled: !!applicationId,
  });
}

export function useLeaveBalance(
  employeeId: string | undefined,
  academicYearId: string | undefined
) {
  return useQuery({
    queryKey: ['hr-leave-balance', employeeId, academicYearId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (employeeId) params.set('employee_id', employeeId);
      if (academicYearId) params.set('academic_year_id', academicYearId);
      const res = await fetch(`${BASE}/balance?${params}`);
      if (!res.ok) throw new Error(`Balance failed: ${res.status}`);
      return ((await res.json()).data ?? []) as HRLeaveBalanceWithType[];
    },
    enabled: !!employeeId && !!academicYearId,
  });
}

export function useLeaveCalendar(
  hrOrgId: string | undefined,
  startDate: string,
  endDate: string
) {
  return useQuery({
    queryKey: ['hr-leave-calendar', hrOrgId, startDate, endDate],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (hrOrgId) params.set('hr_organization_id', hrOrgId);
      params.set('start_date', startDate);
      params.set('end_date', endDate);
      const res = await fetch(`${BASE}/calendar?${params}`);
      if (!res.ok) throw new Error(`Calendar failed: ${res.status}`);
      return ((await res.json()).data ?? []) as HRCalendarEntry[];
    },
    enabled: !!hrOrgId && !!startDate && !!endDate,
  });
}

export function useApplicationComments(applicationId: string | undefined) {
  return useQuery({
    queryKey: ['hr-leave-comments', applicationId],
    queryFn: async () => {
      const res = await fetch(`${BASE}/applications/${applicationId}/comments`);
      if (!res.ok) throw new Error(`Comments failed: ${res.status}`);
      return ((await res.json()).data ?? []) as HRLeaveApplicationComment[];
    },
    enabled: !!applicationId,
  });
}

export function useMyEncashments(employeeId: string | undefined) {
  return useQuery({
    queryKey: ['hr-leave-encashments', employeeId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (employeeId) params.set('employee_id', employeeId);
      const res = await fetch(`${BASE}/encashment?${params}`);
      if (!res.ok) throw new Error(`Encashments failed: ${res.status}`);
      return ((await res.json()).data ?? []) as HRLeaveEncashment[];
    },
    enabled: !!employeeId,
  });
}

// =====================================================================================
// Mutations
// =====================================================================================

export function useApplyLeave() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      payload: Omit<HRLeaveApplicationInsert, 'approval_chain'> & { department_id?: string | null }
    ) => {
      const res = await fetch(`${BASE}/applications`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Apply failed');
      }
      return (await res.json()).data as HRLeaveApplication;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['hr-leave-applications'] });
      qc.invalidateQueries({ queryKey: ['hr-leave-balance', data.employee_id] });
      qc.invalidateQueries({ queryKey: ['hr-leave-calendar'] });
    },
  });
}

export function useDecideApplication() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      applicationId,
      decision,
      comment,
      rejection_reason,
    }: {
      applicationId: string;
      decision: 'approve' | 'reject';
      comment?: string;
      rejection_reason?: string;
    }) => {
      const endpoint = decision === 'approve' ? 'approve' : 'reject';
      const res = await fetch(`${BASE}/applications/${applicationId}/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comment, rejection_reason }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `${decision} failed`);
      }
      return (await res.json()).data as HRLeaveApplication;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['hr-leave-applications'] });
      qc.invalidateQueries({ queryKey: ['hr-leave-application', data.id] });
      qc.invalidateQueries({ queryKey: ['hr-leave-balance', data.employee_id] });
      qc.invalidateQueries({ queryKey: ['hr-leave-calendar'] });
    },
  });
}

export function useCancelApplication() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (applicationId: string) => {
      const res = await fetch(`${BASE}/applications/${applicationId}/cancel`, { method: 'POST' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Cancel failed');
      }
      return (await res.json()).data as HRLeaveApplication;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['hr-leave-applications'] });
      qc.invalidateQueries({ queryKey: ['hr-leave-balance', data.employee_id] });
      qc.invalidateQueries({ queryKey: ['hr-leave-calendar'] });
    },
  });
}

export function useWithdrawApplication() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (applicationId: string) => {
      const res = await fetch(`${BASE}/applications/${applicationId}/withdraw`, { method: 'POST' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Withdraw failed');
      }
      return (await res.json()).data as HRLeaveApplication;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['hr-leave-applications'] });
      qc.invalidateQueries({ queryKey: ['hr-leave-application', data.id] });
    },
  });
}

export function useAddComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ applicationId, body }: { applicationId: string; body: string }) => {
      const res = await fetch(`${BASE}/applications/${applicationId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      });
      if (!res.ok) throw new Error(`Comment failed: ${res.status}`);
      return (await res.json()).data as HRLeaveApplicationComment;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['hr-leave-comments', vars.applicationId] });
    },
  });
}

export function useRequestEncashment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      hr_organization_id: string;
      employee_id: string;
      academic_year_id: string;
      leave_type_id: string;
      days_encashed: number;
      per_diem_rate: number;
    }) => {
      const res = await fetch(`${BASE}/encashment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Encashment request failed');
      }
      return (await res.json()).data as HRLeaveEncashment;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['hr-leave-encashments', data.employee_id] });
    },
  });
}

// =====================================================================================
// Filter-by-status helper
// =====================================================================================

export function useApplicationsByStatus(
  hrOrgId: string | undefined,
  status: LeaveApplicationStatus | LeaveApplicationStatus[]
) {
  return useQuery({
    queryKey: ['hr-leave-applications', 'status', hrOrgId, status],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (hrOrgId) params.set('hr_organization_id', hrOrgId);
      const statuses = Array.isArray(status) ? status : [status];
      statuses.forEach((s) => params.append('status', s));
      const res = await fetch(`${BASE}/applications?${params}`);
      if (!res.ok) throw new Error(`Filter failed: ${res.status}`);
      return (await res.json()) as { data: HRLeaveApplication[]; metadata: { total: number } };
    },
    enabled: !!hrOrgId,
  });
}
