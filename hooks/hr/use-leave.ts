'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  HRLeaveApplication,
  HRLeaveApplicationDetail,
  HRLeaveApplicationWithType,
  HRLeaveApplicationInsert,
  HRLeaveBalanceWithType,
  HRLeaveEncashment,
  HRLeaveApplicationComment,
  HRCalendarEntry,
  LeaveApplicationStatus,
} from '@/types/hr';
import { invalidateAttendanceViews } from '@/hooks/hr/use-attendance-records';
import { invalidateAllowanceViews } from '@/hooks/hr/use-hr-leave-types';
import { invalidateCompOffViews } from '@/hooks/hr/use-comp-off';

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

/**
 * My requests on ONE date. Backs the apply form's "already applied for that
 * time" check, so a clash is shown while picking rather than as a rejection
 * after Submit. The database's overlap guard stays the enforcement point —
 * this list is scoped to one day, but it is still a client-side read.
 */
export function useMyRequestsOnDate(employeeId: string | undefined, date: string | undefined) {
  return useQuery({
    queryKey: ['hr-leave-applications', 'on-date', employeeId, date],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('employee_id', employeeId!);
      params.set('start_from', date!);
      params.set('start_to', date!);
      const res = await fetch(`${BASE}/applications?${params}`);
      if (!res.ok) throw new Error(`Requests for ${date} failed: ${res.status}`);
      return ((await res.json()).data ?? []) as HRLeaveApplicationWithType[];
    },
    enabled: Boolean(employeeId) && Boolean(date),
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
      // The route adds chain_names — the resolved people/role names the
      // browser cannot look up itself. See LeaveChainNames.
      return ((await res.json()).data) as HRLeaveApplicationDetail;
    },
    enabled: !!applicationId,
  });
}

export function useLeaveBalance(
  employeeId: string | undefined,
  hrAcademicYearId: string | undefined
) {
  return useQuery({
    queryKey: ['hr-leave-balance', employeeId, hrAcademicYearId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (employeeId) params.set('employee_id', employeeId);
      if (hrAcademicYearId) params.set('hr_academic_year_id', hrAcademicYearId);
      const res = await fetch(`${BASE}/balance?${params}`);
      if (!res.ok) throw new Error(`Balance failed: ${res.status}`);
      return ((await res.json()).data ?? []) as HRLeaveBalanceWithType[];
    },
    enabled: !!employeeId && !!hrAcademicYearId,
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
      // ATTENDANCE TOO. The attendance log and calendar now show undecided
      // requests beside the day's status, so a request that moves and does not
      // invalidate these leaves that page quoting a stale answer -- and nothing
      // in this app self-refreshes (staleTime 5 min, focus refetch off).
      qc.invalidateQueries({ queryKey: ['hr-attendance-time-off'] });
      qc.invalidateQueries({ queryKey: ['hr-attendance-records'] });
      // AND THE ALLOWANCE THE DRAWER JUST QUOTED. A brand-new request is
      // 'pending', which both allowance RPCs already count -- so without this
      // the drawer kept showing the remaining figure from before the submit
      // and invited a second request against hours that were already spent.
      invalidateAllowanceViews(qc);
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
      // ATTENDANCE TOO. The attendance log and calendar now show undecided
      // requests beside the day's status, so a request that moves and does not
      // invalidate these leaves that page quoting a stale answer -- and nothing
      // in this app self-refreshes (staleTime 5 min, focus refetch off).
      qc.invalidateQueries({ queryKey: ['hr-attendance-time-off'] });
      qc.invalidateQueries({ queryKey: ['hr-attendance-records'] });
      // The Approvals tab reads hr_leave_approval_queue() under its own key;
      // without this the decided row stays on screen until a manual refresh.
      qc.invalidateQueries({ queryKey: ['hr-leave-approval-flows'] });
      // Approving leave fires tr_recompute_attendance_on_leave_approval, and
      // short time off moves the day's excused minutes — both land in
      // hr_attendance_records, which My Attendance reads under its own keys.
      invalidateAttendanceViews(qc);
      // A REJECTION HANDS THE ALLOWANCE BACK. 'rejected' leaves the status set
      // the allowance RPCs count, so the hours are free again the instant this
      // returns — and an approval turns a held figure into a spent one.
      invalidateAllowanceViews(qc);
      // Approving comp-off is the moment hr_trig_comp_off_consume spends the
      // credit, so the ledger the drawer quotes has just changed underneath it.
      invalidateCompOffViews(qc);
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
      // ATTENDANCE TOO. The attendance log and calendar now show undecided
      // requests beside the day's status, so a request that moves and does not
      // invalidate these leaves that page quoting a stale answer -- and nothing
      // in this app self-refreshes (staleTime 5 min, focus refetch off).
      qc.invalidateQueries({ queryKey: ['hr-attendance-time-off'] });
      qc.invalidateQueries({ queryKey: ['hr-attendance-records'] });
      // Cancelling releases the hold, so the drawer must stop counting it.
      invalidateAllowanceViews(qc);
      // Cancelling an APPROVED comp-off hands its credit back to the ledger.
      invalidateCompOffViews(qc);
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
      // WITHDRAW RELEASES EVERYTHING CANCEL DOES, and used to refresh none of
      // it. It moves a request out of ('pending','escalated'), which is the set
      // v_hr_leave_balance_src subtracts as `pending` and both allowance RPCs
      // count — so the days and the hours are free the moment this returns.
      // Refreshing only the two lists left the balance card and the apply
      // drawer showing them as still consumed until the cache aged out.
      qc.invalidateQueries({ queryKey: ['hr-leave-balance', data.employee_id] });
      qc.invalidateQueries({ queryKey: ['hr-leave-calendar'] });
      qc.invalidateQueries({ queryKey: ['hr-attendance-time-off'] });
      qc.invalidateQueries({ queryKey: ['hr-attendance-records'] });
      invalidateAllowanceViews(qc);
      invalidateCompOffViews(qc);
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
      hr_academic_year_id: string;
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
