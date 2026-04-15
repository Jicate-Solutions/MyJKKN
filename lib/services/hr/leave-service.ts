/**
 * Sprint 3 — Leave Service
 *
 * Handles the staff leave workflow: apply / approve / reject / cancel (supersede) /
 * withdraw (soft-delete) / comment / calendar / balance.
 *
 * Design decisions locked in specs/myjkkn-hr-sprint-03-plan.md (28 decisions across 7 rounds).
 * DB schema live on production as of 2026-04-15 (Phase A).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  HRLeaveApplication,
  HRLeaveApplicationInsert,
  HRLeaveBalance,
  HRLeaveBalanceWithType,
  HRLeaveEncashment,
  HRLeaveApplicationComment,
  HRCalendarEntry,
  LeaveApplicationStatus,
  LeaveApprovalStep,
} from '@/types/hr';

// =====================================================================================
// List filters
// =====================================================================================

export interface LeaveApplicationFilters {
  hr_organization_id?: string;
  employee_id?: string;
  status?: LeaveApplicationStatus | LeaveApplicationStatus[];
  start_from?: string; // ISO date
  start_to?: string;
  // For approver inbox: only return apps currently waiting on this approver
  pending_approver_id?: string;
  page?: number;
  pageSize?: number;
}

// =====================================================================================
// Leave Service
// =====================================================================================

export class LeaveService {
  // ----- List / Get -----

  static async listApplications(
    supabase: SupabaseClient,
    filters: LeaveApplicationFilters = {}
  ) {
    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 50;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let q = supabase
      .from('hr_leave_applications')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (filters.hr_organization_id) q = q.eq('hr_organization_id', filters.hr_organization_id);
    if (filters.employee_id) q = q.eq('employee_id', filters.employee_id);
    if (filters.status) {
      const statuses = Array.isArray(filters.status) ? filters.status : [filters.status];
      q = q.in('status', statuses);
    }
    if (filters.start_from) q = q.gte('start_date', filters.start_from);
    if (filters.start_to) q = q.lte('start_date', filters.start_to);

    const { data, count, error } = await q;
    if (error) throw error;
    return {
      data: (data ?? []) as HRLeaveApplication[],
      metadata: {
        total: count ?? 0,
        page,
        pageSize,
        totalPages: Math.max(1, Math.ceil((count ?? 0) / pageSize)),
      },
    };
  }

  static async getApplication(supabase: SupabaseClient, id: string): Promise<HRLeaveApplication | null> {
    const { data, error } = await supabase
      .from('hr_leave_applications')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data as HRLeaveApplication | null;
  }

  // ----- Apply -----

  /**
   * Build the approval_chain snapshot from hr_approval_flows at apply-time.
   * Frozen-snapshot pattern (decision 3) — if HR later edits the flow,
   * in-flight applications keep their original rules.
   */
  static async buildApprovalChain(
    supabase: SupabaseClient,
    hrOrgId: string,
    leaveTypeId: string,
    departmentId: string | null
  ): Promise<LeaveApprovalStep[]> {
    // Most-specific wins (decision 16): prefer department-scoped over institution-scoped
    const { data: flows, error } = await supabase
      .from('hr_approval_flows')
      .select('*')
      .eq('hr_organization_id', hrOrgId)
      .or(`leave_type_id.eq.${leaveTypeId},leave_type_id.is.null`)
      .is('valid_until', null)
      .order('scope_level', { ascending: false }) // 'department' > 'institution'
      .order('chain_order', { ascending: true });

    if (error) throw error;

    // Group flows by scope_level + pick the most-specific group for this employee
    const departmentFlows = (flows ?? []).filter(
      (f) => f.scope_level === 'department' && f.approver_scope === departmentId
    );
    const institutionFlows = (flows ?? []).filter((f) => f.scope_level === 'institution');
    const chosen = departmentFlows.length > 0 ? departmentFlows : institutionFlows;

    if (chosen.length === 0) {
      throw new Error(
        'No approval flow configured for this leave type + organization. HR must configure at /hr/policies/hr_approval_flows first.'
      );
    }

    return chosen.map((f) => ({
      step_order: f.chain_order ?? 1,
      approver_role: f.approver_role,
      approver_user_id: null, // resolved at approve-time by role lookup
      status: 'pending' as const,
      escalate_after_hours: f.escalate_after_hours ?? 48,
    }));
  }

  /**
   * Apply for leave. Validates balance + blackout + advance-notice + max-continuous
   * BEFORE inserting. Insert trigger will compute total_days via hr_calc_leave_days.
   */
  static async applyLeave(
    supabase: SupabaseClient,
    payload: Omit<HRLeaveApplicationInsert, 'approval_chain'> & {
      department_id?: string | null;
    }
  ) {
    // 1. Fetch leave_type (unified catalog; scope='staff' for HR leave)
    const { data: leaveType, error: ltErr } = await supabase
      .from('leave_types')
      .select('*')
      .eq('id', payload.leave_type_id)
      .eq('scope', 'staff')
      .maybeSingle();
    if (ltErr) throw ltErr;
    if (!leaveType) throw new Error('Leave type not found');

    // 2. Blackout check (decision 12)
    const { data: blackouts } = await supabase
      .from('hr_leave_blackouts')
      .select('*')
      .eq('hr_organization_id', payload.hr_organization_id)
      .lte('start_date', payload.end_date)
      .gte('end_date', payload.start_date);

    const blocked = (blackouts ?? []).find(
      (b) => b.leave_type_ids === null || b.leave_type_ids.includes(payload.leave_type_id)
    );
    if (blocked) {
      throw new Error(`Leave blocked by blackout: ${blocked.title} (${blocked.start_date} → ${blocked.end_date})`);
    }

    // 3. Min advance notice (decision 20) — bypassed if is_emergency (decision 27)
    if (!payload.is_emergency && leaveType.min_advance_notice_days > 0) {
      const todayIso = new Date().toISOString().split('T')[0];
      const noticeDays = Math.floor(
        (new Date(payload.start_date).getTime() - new Date(todayIso).getTime()) / (1000 * 60 * 60 * 24)
      );
      if (noticeDays < leaveType.min_advance_notice_days) {
        throw new Error(
          `This leave type requires ${leaveType.min_advance_notice_days} days advance notice. You gave ${noticeDays}.`
        );
      }
    }

    // 4. Max continuous duration (decision 20)
    const durationDays = Math.ceil(
      (new Date(payload.end_date).getTime() - new Date(payload.start_date).getTime()) /
        (1000 * 60 * 60 * 24)
    ) + 1;
    if (leaveType.max_continuous_days && durationDays > leaveType.max_continuous_days) {
      throw new Error(
        `This leave type allows max ${leaveType.max_continuous_days} continuous days. Requested ${durationDays}.`
      );
    }

    // 5. Build approval chain (frozen snapshot)
    const approval_chain = await this.buildApprovalChain(
      supabase,
      payload.hr_organization_id,
      payload.leave_type_id,
      payload.department_id ?? null
    );

    // 6. Balance check (decision 18 — reject at apply-time on exhaustion)
    // Compute estimated total_days client-side for the check (DB trigger will recompute authoritative value)
    const estimatedDays =
      payload.duration_type === 'hourly' ? 0.125 :
      payload.duration_type === 'first_half' || payload.duration_type === 'second_half' ? 0.5 :
      durationDays;

    const { data: balance } = await supabase
      .from('hr_leave_balances')
      .select('*')
      .eq('employee_id', payload.employee_id)
      .eq('leave_type_id', payload.leave_type_id)
      .eq('academic_year_id', payload.academic_year_id ?? '')
      .maybeSingle();

    if (balance) {
      const available = (balance.entitled ?? 0) + (balance.carried_forward ?? 0) - (balance.used ?? 0);
      if (estimatedDays > available) {
        throw new Error(
          `Insufficient balance. You have ${available.toFixed(1)} ${leaveType.name} available; requested ${estimatedDays}.`
        );
      }
    }

    // 7. Insert (trigger populates total_days; status trigger does NOT fire on pending)
    const insertPayload: Record<string, unknown> = {
      hr_organization_id: payload.hr_organization_id,
      employee_id: payload.employee_id,
      leave_type_id: payload.leave_type_id,
      academic_year_id: payload.academic_year_id ?? null,
      start_date: payload.start_date,
      end_date: payload.end_date,
      duration_type: payload.duration_type,
      start_time: payload.start_time ?? null,
      end_time: payload.end_time ?? null,
      reason: payload.reason,
      documents: payload.documents ?? [],
      is_emergency: payload.is_emergency ?? false,
      approval_chain,
      current_step: 0,
      applied_by: payload.applied_by,
      status: payload.status ?? 'pending',
    };

    const { data, error } = await supabase
      .from('hr_leave_applications')
      .insert(insertPayload)
      .select()
      .single();
    if (error) throw error;
    return data as HRLeaveApplication;
  }

  // ----- Approve / Reject -----

  static async approveApplication(
    supabase: SupabaseClient,
    applicationId: string,
    approverId: string,
    comment?: string
  ) {
    const app = await this.getApplication(supabase, applicationId);
    if (!app) throw new Error('Application not found');
    if (!['pending', 'escalated'].includes(app.status)) {
      throw new Error(`Cannot approve application in status ${app.status}`);
    }

    const chain = [...app.approval_chain];
    const step = chain[app.current_step];
    if (!step) throw new Error('Approval chain exhausted');

    step.status = 'approved';
    step.decided_at = new Date().toISOString();
    step.decided_by = approverId;
    step.comment = comment ?? null;
    step.approver_user_id = approverId;

    const nextStep = app.current_step + 1;
    const isFinal = nextStep >= chain.length;

    const update: Record<string, unknown> = {
      approval_chain: chain,
      current_step: nextStep,
    };
    if (isFinal) {
      update.status = 'approved';
      update.final_approver_id = approverId;
      update.final_decided_at = new Date().toISOString();
    }

    const { data, error } = await supabase
      .from('hr_leave_applications')
      .update(update)
      .eq('id', applicationId)
      .select()
      .single();
    if (error) throw error;
    return data as HRLeaveApplication;
  }

  static async rejectApplication(
    supabase: SupabaseClient,
    applicationId: string,
    approverId: string,
    rejection_reason: string
  ) {
    const app = await this.getApplication(supabase, applicationId);
    if (!app) throw new Error('Application not found');
    if (!['pending', 'escalated'].includes(app.status)) {
      throw new Error(`Cannot reject application in status ${app.status}`);
    }

    const chain = [...app.approval_chain];
    const step = chain[app.current_step];
    if (step) {
      step.status = 'rejected';
      step.decided_at = new Date().toISOString();
      step.decided_by = approverId;
      step.comment = rejection_reason;
      step.approver_user_id = approverId;
    }

    const { data, error } = await supabase
      .from('hr_leave_applications')
      .update({
        status: 'rejected',
        approval_chain: chain,
        final_approver_id: approverId,
        final_decided_at: new Date().toISOString(),
        rejection_reason,
      })
      .eq('id', applicationId)
      .select()
      .single();
    if (error) throw error;
    return data as HRLeaveApplication;
  }

  // ----- Cancel (post-approval, supersede pattern per decision 6) -----

  static async cancelApplication(
    supabase: SupabaseClient,
    applicationId: string,
    cancelledBy: string
  ) {
    const app = await this.getApplication(supabase, applicationId);
    if (!app) throw new Error('Application not found');
    if (app.status !== 'approved') {
      throw new Error(`Only approved applications can be cancelled. Use withdraw for pending. Status: ${app.status}`);
    }

    // Clone the row with status=cancelled, link back via superseded_by
    const clone: Record<string, unknown> = {
      hr_organization_id: app.hr_organization_id,
      employee_id: app.employee_id,
      leave_type_id: app.leave_type_id,
      academic_year_id: app.academic_year_id,
      start_date: app.start_date,
      end_date: app.end_date,
      duration_type: app.duration_type,
      start_time: app.start_time,
      end_time: app.end_time,
      reason: `[CANCELLED] ${app.reason}`,
      documents: app.documents,
      is_emergency: app.is_emergency,
      approval_chain: app.approval_chain,
      current_step: app.current_step,
      final_approver_id: app.final_approver_id,
      final_decided_at: app.final_decided_at,
      applied_by: cancelledBy,
      status: 'cancelled',
    };

    const { data: newRow, error: insertErr } = await supabase
      .from('hr_leave_applications')
      .insert(clone)
      .select()
      .single();
    if (insertErr) throw insertErr;

    // Link original to the cancellation row
    const { error: updateErr } = await supabase
      .from('hr_leave_applications')
      .update({ superseded_by: newRow.id })
      .eq('id', applicationId);
    if (updateErr) throw updateErr;

    // DB trigger on status-change-to-cancelled restores the balance delta
    return newRow as HRLeaveApplication;
  }

  // ----- Withdraw (pre-approval, soft-delete per decision 5) -----

  static async withdrawApplication(
    supabase: SupabaseClient,
    applicationId: string,
    employeeUserId: string
  ) {
    const app = await this.getApplication(supabase, applicationId);
    if (!app) throw new Error('Application not found');
    if (!['pending', 'escalated'].includes(app.status)) {
      throw new Error(`Only pending applications can be withdrawn. Use cancel for approved. Status: ${app.status}`);
    }

    const { data, error } = await supabase
      .from('hr_leave_applications')
      .update({
        status: 'withdrawn',
        final_decided_at: new Date().toISOString(),
        final_approver_id: employeeUserId,
      })
      .eq('id', applicationId)
      .select()
      .single();
    if (error) throw error;
    return data as HRLeaveApplication;
  }

  // ----- Comments -----

  static async listComments(supabase: SupabaseClient, applicationId: string) {
    const { data, error } = await supabase
      .from('hr_leave_application_comments')
      .select('*')
      .eq('application_id', applicationId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data ?? []) as HRLeaveApplicationComment[];
  }

  static async addComment(
    supabase: SupabaseClient,
    applicationId: string,
    authorId: string,
    body: string
  ) {
    const { data, error } = await supabase
      .from('hr_leave_application_comments')
      .insert({ application_id: applicationId, author_id: authorId, body })
      .select()
      .single();
    if (error) throw error;
    return data as HRLeaveApplicationComment;
  }

  // ----- Balance -----

  static async getBalance(
    supabase: SupabaseClient,
    employeeId: string,
    academicYearId: string
  ): Promise<HRLeaveBalanceWithType[]> {
    const { data, error } = await supabase
      .from('hr_leave_balances')
      .select(`
        *,
        leave_types:leave_type_id (
          leave_type_name,
          leave_type_code,
          duration_type,
          allow_half_day,
          allow_hourly
        )
      `)
      .eq('employee_id', employeeId)
      .eq('academic_year_id', academicYearId);
    if (error) throw error;

    return (data ?? []).map((row: Record<string, unknown>) => {
      const lt = row.leave_types as {
        leave_type_name: string;
        leave_type_code: string;
        duration_type: string;
        allow_half_day: boolean;
        allow_hourly: boolean;
      };
      return {
        employee_id: row.employee_id as string,
        leave_type_id: row.leave_type_id as string,
        academic_year_id: row.academic_year_id as string,
        hr_organization_id: row.hr_organization_id as string,
        entitled: Number(row.entitled),
        used: Number(row.used),
        carried_forward: Number(row.carried_forward),
        created_at: row.created_at as string,
        updated_at: row.updated_at as string,
        leave_type_name: lt?.leave_type_name ?? '',
        leave_type_code: lt?.leave_type_code ?? '',
        duration_type: (lt?.duration_type ?? 'full') as HRLeaveBalanceWithType['duration_type'],
        allow_half_day: lt?.allow_half_day ?? false,
        allow_hourly: lt?.allow_hourly ?? false,
      };
    });
  }

  // ----- Calendar (org-wide, decision 14 — with type-hiding per decision 23) -----

  static async getCalendar(
    supabase: SupabaseClient,
    hrOrgId: string,
    startDate: string,
    endDate: string
  ): Promise<HRCalendarEntry[]> {
    const { data, error } = await supabase
      .from('hr_leave_applications')
      .select(`
        id,
        employee_id,
        start_date,
        end_date,
        duration_type,
        status,
        staff:employee_id ( first_name, last_name )
      `)
      .eq('hr_organization_id', hrOrgId)
      .eq('status', 'approved')
      .lte('start_date', endDate)
      .gte('end_date', startDate);
    if (error) throw error;

    return (data ?? []).map((row: Record<string, unknown>) => {
      const staff = row.staff as { first_name: string; last_name: string | null } | null;
      const name = staff
        ? `${staff.first_name}${staff.last_name ? ' ' + staff.last_name : ''}`
        : 'Unknown';
      return {
        application_id: row.id as string,
        employee_id: row.employee_id as string,
        employee_name: name,
        start_date: row.start_date as string,
        end_date: row.end_date as string,
        duration_type: row.duration_type as HRCalendarEntry['duration_type'],
        display_label: 'On Leave' as const, // Type hidden per decision 23
        status: row.status as HRCalendarEntry['status'],
      };
    });
  }

  // ----- Encashment -----

  static async requestEncashment(
    supabase: SupabaseClient,
    payload: {
      hr_organization_id: string;
      employee_id: string;
      academic_year_id: string;
      leave_type_id: string;
      days_encashed: number;
      per_diem_rate: number;
    }
  ) {
    const total_amount = payload.days_encashed * payload.per_diem_rate;
    const { data, error } = await supabase
      .from('hr_leave_encashments')
      .insert({ ...payload, total_amount, status: 'pending' })
      .select()
      .single();
    if (error) throw error;
    return data as HRLeaveEncashment;
  }

  static async listEncashments(
    supabase: SupabaseClient,
    filters: { hr_organization_id?: string; employee_id?: string; status?: string } = {}
  ) {
    let q = supabase
      .from('hr_leave_encashments')
      .select('*')
      .order('created_at', { ascending: false });
    if (filters.hr_organization_id) q = q.eq('hr_organization_id', filters.hr_organization_id);
    if (filters.employee_id) q = q.eq('employee_id', filters.employee_id);
    if (filters.status) q = q.eq('status', filters.status);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as HRLeaveEncashment[];
  }
}

// =====================================================================================
// Blackout Service (thin CRUD; admin-only route)
// =====================================================================================

export class LeaveBlackoutService {
  static async list(supabase: SupabaseClient, hrOrgId: string) {
    const { data, error } = await supabase
      .from('hr_leave_blackouts')
      .select('*')
      .eq('hr_organization_id', hrOrgId)
      .order('start_date', { ascending: true });
    if (error) throw error;
    return data ?? [];
  }

  static async create(
    supabase: SupabaseClient,
    payload: {
      hr_organization_id: string;
      title: string;
      start_date: string;
      end_date: string;
      leave_type_ids?: string[] | null;
      reason?: string;
      created_by: string;
    }
  ) {
    const { data, error } = await supabase
      .from('hr_leave_blackouts')
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  static async delete(supabase: SupabaseClient, id: string) {
    const { error } = await supabase.from('hr_leave_blackouts').delete().eq('id', id);
    if (error) throw error;
  }
}
