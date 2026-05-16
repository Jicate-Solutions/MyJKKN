/**
 * HR Attendance Regularization Service
 *
 * Self-service flow for employees to request attendance corrections
 * (forgot-to-punch, device-offline, network-failure, leave-clash) and for
 * HR/approvers to act on them.
 *
 * State machine:
 *   pending -> approved   (approver accepts; we also stamp an attendance record)
 *   pending -> rejected   (approver rejects with reason)
 *
 * Tables:
 *   - hr_attendance_regularizations  (canonical request)
 *   - hr_regularization_reasons      (master codes; seeded)
 *   - hr_attendance_status_types     (master codes; seeded — PRESENT, ON_DUTY, etc.)
 *   - hr_attendance_records          (on approve, we insert/upsert a "REGULARIZED"
 *                                     attendance row — mirrors the leave-application
 *                                     flow used elsewhere in the module).
 *
 * RLS expectations (verified 2026-05-10):
 *   - SELECT/INSERT for self gated on `hr.attendance.regularize_self` permission
 *     where auth.uid() = hr_employees.user_id linked to employee_id.
 *   - UPDATE for approver gated on `hr.attendance.regularize_approve`
 *     OR `hr.attendance.approve_team` OR admin.
 *
 * @module services/hr/regularization-service
 * @created 2026-05-10
 */

import { createClientSupabaseClient } from '@/lib/supabase/client';

// HR tables are not yet in the generated Database type — fall back to an
// untyped supabase client. RLS enforces correctness at runtime; this matches
// the convention used by `lib/services/service-requests/service-request-service.ts`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getSupabase = (): any => createClientSupabaseClient() as any;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RegularizationStatus = 'pending' | 'approved' | 'rejected';

export interface RegularizationReason {
  id: string;
  code: string;
  label: string;
  is_active: boolean | null;
}

export interface AttendanceStatusType {
  id: string;
  code: string;
  label: string;
  is_active: boolean | null;
}

export interface RegularizationRequest {
  id: string;
  employee_id: string;
  attendance_record_id: string | null;
  for_date: string;
  reason_code_id: string | null;
  reason_text: string | null;
  proposed_status_type_id: string | null;
  proposed_in_at: string | null;
  proposed_out_at: string | null;
  status: RegularizationStatus;
  approver_id: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  created_at: string | null;
  updated_at: string | null;

  // joined
  reason?: { id: string; code: string; label: string } | null;
  proposed_status?: { id: string; code: string; label: string } | null;
  employee?: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    employee_code: string | null;
    user_id: string | null;
  } | null;
}

export interface SubmitRegularizationDto {
  employeeId: string;
  forDate: string; // YYYY-MM-DD
  reasonCodeId?: string | null;
  reasonText?: string | null;
  proposedStatusTypeId?: string | null;
  proposedInAt?: string | null;
  proposedOutAt?: string | null;
}

export interface ApprovalFilters {
  status?: RegularizationStatus | 'all';
  forDateFrom?: string;
  forDateTo?: string;
  limit?: number;
}

const REQUEST_SELECT = `
  id,
  employee_id,
  attendance_record_id,
  for_date,
  reason_code_id,
  reason_text,
  proposed_status_type_id,
  proposed_in_at,
  proposed_out_at,
  status,
  approver_id,
  approved_at,
  rejection_reason,
  created_at,
  updated_at,
  reason:hr_regularization_reasons(id, code, label),
  proposed_status:hr_attendance_status_types!hr_attendance_regularizations_proposed_status_type_id_fkey(id, code, label),
  employee:hr_employees(id, first_name, last_name, email, employee_code, user_id)
`;

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/**
 * Resolve the hr_employees row for the current auth user.
 * Returns null if no linked hr_employees row exists.
 */
export async function getCurrentEmployee(): Promise<{
  id: string;
  user_id: string;
  hr_organization_id: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  employee_code: string | null;
} | null> {
  const supabase = getSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return null;

  const { data, error } = await supabase
    .from('hr_employees')
    .select(
      'id, user_id, hr_organization_id, first_name, last_name, email, employee_code'
    )
    .eq('user_id', auth.user.id)
    .eq('is_active', true)
    .maybeSingle();

  if (error) {
    console.warn('[regularization-service] getCurrentEmployee error', error);
    return null;
  }
  return data ?? null;
}

export async function listReasons(): Promise<RegularizationReason[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('hr_regularization_reasons')
    .select('id, code, label, is_active')
    .eq('is_active', true)
    .order('label', { ascending: true });

  if (error) throw error;
  return (data ?? []) as RegularizationReason[];
}

export async function listAttendanceStatusTypes(): Promise<AttendanceStatusType[]> {
  const supabase = getSupabase();
  // Limit to status codes that make sense as a *proposed* status for a
  // self-service correction. Excludes ABSENT (employee wouldn't request that),
  // HOLIDAY, REGULARIZED (set by the system on approve), LEAVE.
  const allowedCodes = ['PRESENT', 'ON_DUTY', 'HALF_DAY', 'on_clinical_posting'];

  const { data, error } = await supabase
    .from('hr_attendance_status_types')
    .select('id, code, label, is_active')
    .eq('is_active', true)
    .in('code', allowedCodes)
    .order('label', { ascending: true });

  if (error) throw error;
  return (data ?? []) as AttendanceStatusType[];
}

export async function listMyRequests(
  employeeId: string,
  limit = 10
): Promise<RegularizationRequest[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('hr_attendance_regularizations')
    .select(REQUEST_SELECT)
    .eq('employee_id', employeeId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as unknown as RegularizationRequest[];
}

export async function listPendingApprovals(
  filters: ApprovalFilters = {}
): Promise<RegularizationRequest[]> {
  const supabase = getSupabase();
  let query = supabase
    .from('hr_attendance_regularizations')
    .select(REQUEST_SELECT)
    .order('created_at', { ascending: false })
    .limit(filters.limit ?? 100);

  if (filters.status && filters.status !== 'all') {
    query = query.eq('status', filters.status);
  } else if (!filters.status) {
    query = query.eq('status', 'pending');
  }

  if (filters.forDateFrom) query = query.gte('for_date', filters.forDateFrom);
  if (filters.forDateTo) query = query.lte('for_date', filters.forDateTo);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as RegularizationRequest[];
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export async function submitRequest(
  dto: SubmitRegularizationDto
): Promise<RegularizationRequest> {
  const supabase = getSupabase();

  if (!dto.employeeId) throw new Error('employeeId is required');
  if (!dto.forDate) throw new Error('forDate is required');
  if (!dto.reasonCodeId && !dto.reasonText) {
    throw new Error('A reason (either a master code or free text) is required');
  }

  const { data, error } = await supabase
    .from('hr_attendance_regularizations')
    .insert({
      employee_id: dto.employeeId,
      for_date: dto.forDate,
      reason_code_id: dto.reasonCodeId ?? null,
      reason_text: dto.reasonText ?? null,
      proposed_status_type_id: dto.proposedStatusTypeId ?? null,
      proposed_in_at: dto.proposedInAt ?? null,
      proposed_out_at: dto.proposedOutAt ?? null,
      status: 'pending',
    })
    .select(REQUEST_SELECT)
    .single();

  if (error) throw error;
  return data as unknown as RegularizationRequest;
}

/**
 * Approve a regularization request.
 *
 * Side effect: writes a corresponding row to `hr_attendance_records` with the
 * REGULARIZED status code, mirroring the canonical leave-approval pattern.
 * If a record already exists for that (employee, work_date), we update it in
 * place to point at the regularized status; otherwise we insert.
 *
 * If the linked attendance row write fails (e.g. missing institution_id on the
 * employee), we still mark the regularization approved — the data fix can be
 * applied by HR offline. This matches the leave-application approval pattern.
 */
export async function approveRequest(
  id: string,
  approverProfileId: string
): Promise<RegularizationRequest> {
  const supabase = getSupabase();

  // 1. Mark the regularization approved.
  const { data: approved, error: updateError } = await supabase
    .from('hr_attendance_regularizations')
    .update({
      status: 'approved',
      approver_id: approverProfileId,
      approved_at: new Date().toISOString(),
      rejection_reason: null,
    })
    .eq('id', id)
    .select(REQUEST_SELECT)
    .single();

  if (updateError) throw updateError;
  const request = approved as unknown as RegularizationRequest;

  // 2. Try to stamp an hr_attendance_records row using the REGULARIZED status
  //    type code. Best-effort — surface but don't throw.
  try {
    const { data: regStatus } = await supabase
      .from('hr_attendance_status_types')
      .select('id')
      .eq('code', 'REGULARIZED')
      .maybeSingle();

    const statusTypeId =
      request.proposed_status_type_id || regStatus?.id || null;

    if (statusTypeId && request.employee?.id) {
      const { data: employeeRow } = await supabase
        .from('hr_employees')
        .select('id, hr_organization_id')
        .eq('id', request.employee.id)
        .maybeSingle();

      if (employeeRow?.hr_organization_id) {
        // Upsert by (employee, work_date)
        const existing = await supabase
          .from('hr_attendance_records')
          .select('id')
          .eq('employee_id', employeeRow.id)
          .eq('work_date', request.for_date)
          .maybeSingle();

        if (existing.data?.id) {
          await supabase
            .from('hr_attendance_records')
            .update({
              status_type_id: statusTypeId,
              source: 'regularization',
              in_at: request.proposed_in_at,
              out_at: request.proposed_out_at,
              reconciled_by: approverProfileId,
              reconciled_at: new Date().toISOString(),
              notes: `Regularized: ${request.reason?.label ?? request.reason_text ?? ''}`.slice(
                0,
                500
              ),
            })
            .eq('id', existing.data.id);
        } else {
          await supabase.from('hr_attendance_records').insert({
            employee_id: employeeRow.id,
            hr_organization_id: employeeRow.hr_organization_id,
            work_date: request.for_date,
            status_type_id: statusTypeId,
            source: 'regularization',
            in_at: request.proposed_in_at,
            out_at: request.proposed_out_at,
            reconciled_by: approverProfileId,
            reconciled_at: new Date().toISOString(),
            notes: `Regularized: ${request.reason?.label ?? request.reason_text ?? ''}`.slice(
              0,
              500
            ),
          });
        }
      }
    }
  } catch (err) {
    console.warn(
      '[regularization-service] attendance-record stamp failed (non-fatal)',
      err
    );
  }

  return request;
}

export async function rejectRequest(
  id: string,
  approverProfileId: string,
  reason: string
): Promise<RegularizationRequest> {
  if (!reason || reason.trim().length === 0) {
    throw new Error('Rejection reason is required');
  }
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('hr_attendance_regularizations')
    .update({
      status: 'rejected',
      approver_id: approverProfileId,
      approved_at: new Date().toISOString(),
      rejection_reason: reason.trim(),
    })
    .eq('id', id)
    .select(REQUEST_SELECT)
    .single();

  if (error) throw error;
  return data as unknown as RegularizationRequest;
}
