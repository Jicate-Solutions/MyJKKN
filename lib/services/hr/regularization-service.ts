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
    institution_id: string | null;
    institution: { name: string | null } | null;
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
  employee:staff!hr_attendance_regularizations_employee_id_fkey(id, first_name, last_name, email, employee_code:staff_id, user_id:profile_id, institution_id, institution:institutions(name))
`;
// ^ employee_id FKs to `staff` since 20260827170000 — the original
//   hr_employees FK (and this embed's target) died with that table's DROP,
//   which is what "Could not find a relationship ... in the schema cache"
//   meant. The aliases keep the historical shape: staff.staff_id is the
//   human-facing employee_code, staff.profile_id is what auth.uid() returns.

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/**
 * Resolve the current auth user's HR identity (their `staff` row plus the
 * hr_organization it belongs to). Returns null when the caller has no active
 * staff record.
 *
 * `id` is a **staff.id**. That is what the HR schema expects everywhere:
 * hr_leave_applications.employee_id, hr_leave_balances.employee_id and
 * hr_leave_encashments.employee_id all FK to `staff`, and the RLS policies
 * match on `staff.profile_id = auth.uid()`.
 *
 * HISTORY — do not "simplify" this back to a table query. Until 2026-07-21
 * this read `hr_employees`, which has held **0 rows** since
 * 20260524083600_consolidate_hr_employees_to_staff moved all 740 active staff
 * into `staff`. It therefore returned null for every user, and because the
 * callers degrade to an EmptyState rather than an error, leave application and
 * attendance regularization were silently unreachable for the whole
 * organisation — hr_leave_applications and hr_attendance_regularizations both
 * sat at 0 rows.
 *
 * The org id cannot be joined client-side: hr_staff_details and
 * hr_organizations both gate RLS on auth_hr_organization_id(), which reads
 * user_hr_access (1 row for 844 staff). fn_my_hr_context() is SECURITY DEFINER
 * so it resolves past that; it is self-authorizing (pins to auth.uid(), takes
 * no arguments), so it can only ever return the caller's own row.
 */
export async function getCurrentEmployee(): Promise<{
  id: string;
  user_id: string;
  hr_organization_id: string | null;
  /** The staff row's institution — what attendance month-close is keyed on. */
  institution_id: string | null;
  /**
   * False when this person's employment category has included_in_hr = false.
   * They still have a staff record — they simply take no part in HR, so every
   * HR surface should say so rather than pretending they have no staff row.
   */
  hr_included: boolean;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  employee_code: string | null;
} | null> {
  const supabase = getSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return null;

  const { data, error } = await supabase.rpc('fn_my_hr_context').maybeSingle();

  if (error) {
    console.warn('[regularization-service] getCurrentEmployee error', error);
    return null;
  }
  if (!data) return null;

  // Map to the historical shape so call sites keep working. `user_id` is the
  // profile id, which is what auth.uid() returns.
  return {
    id: data.staff_id,
    user_id: data.profile_id,
    hr_organization_id: data.hr_organization_id,
    institution_id: data.institution_id ?? null,
    hr_included: data.hr_included !== false,
    first_name: data.first_name,
    last_name: data.last_name,
    email: data.email,
    employee_code: data.employee_code,
  };
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

  // 0. Refuse to approve into a CLOSED month, up front. The month-close lock
  // (trg_har_block_locked_period) rejects the attendance stamp at the database
  // level, but that stamp runs inside a best-effort catch AFTER the request is
  // marked approved — so without this check an approval "succeeds" while the
  // report keeps the old verdict, which is exactly how an approved
  // regularization sat beside an ABSENT day. Leave decisions are refused
  // outright on locked months; regularizations follow the same rule.
  // (A null read here — e.g. the periods table hidden by RLS — degrades to
  // "no lock found" and the trigger remains the backstop.)
  const { data: regRow } = await supabase
    .from('hr_attendance_regularizations')
    .select(
      'for_date, employee:staff!hr_attendance_regularizations_employee_id_fkey(institution_id)'
    )
    .eq('id', id)
    .maybeSingle();
  const lockInstitution = regRow?.employee?.institution_id ?? null;
  if (regRow?.for_date && lockInstitution) {
    const y = Number(regRow.for_date.slice(0, 4));
    const m = Number(regRow.for_date.slice(5, 7));
    const { data: lock } = await supabase
      .from('hr_attendance_periods')
      .select('id')
      .eq('institution_id', lockInstitution)
      .eq('period_year', y)
      .eq('period_month', m)
      .eq('status', 'locked')
      .maybeSingle();
    if (lock) {
      throw new Error(
        `Attendance for ${y}-${String(m).padStart(2, '0')} is closed. Reopen the month before deciding this request.`
      );
    }
  }

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

  // 2. The attendance day is stamped by the DATABASE, not from here.
  //
  // tr_stamp_attendance_on_regularization_approval (20260827190000) fires on
  // this very UPDATE and writes hr_attendance_records. That replaced a
  // best-effort client stamp which sat in a try/catch and silently skipped
  // whenever the approver had no hr_staff_details row, the month was closed,
  // staff RLS hid the embed, or the open browser still held a bundle from
  // before the last fix — every one of which left a request reading 'approved'
  // beside a day that never changed. A trigger cannot be skipped by a client.

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
