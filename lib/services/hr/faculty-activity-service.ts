/**
 * Faculty Active-Use Ratio Service
 *
 * Outcome metric: "% of active staff with >= 1 HR action in last 30 days".
 * Target: 60% by 90 days (per strategic lock T7.1).
 *
 * HR actions are:
 *   - hr_leave_applications (created_at within window)
 *   - hr_attendance_regularizations (created_at within window)
 *   - hr_employee_documents (created_at within window)
 *
 * Total denominator: active staff from hr_staff_details joined to staff.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface FacultyActivityAction {
  type: string;
  count: number;
}

export interface FacultyActivityResult {
  activeCount: number;
  totalStaff: number;
  ratio: number;
  target: number;
  actions: FacultyActivityAction[];
}

export class FacultyActivityService {
  /** Target active-use ratio (60% per strategic lock T7.1) */
  private static readonly TARGET = 0.6;

  /** Window in days for "recent activity" */
  private static readonly WINDOW_DAYS = 30;

  /**
   * Get the faculty active-use ratio.
   *
   * Counts distinct user/staff IDs that have at least one HR action
   * (leave application, attendance regularization, or document upload)
   * in the last 30 days, divided by total active staff.
   */
  static async getActiveUseRatio(
    supabase: SupabaseClient,
    opts?: { institution_id?: string }
  ): Promise<FacultyActivityResult> {
    const cutoff = new Date(
      Date.now() - this.WINDOW_DAYS * 24 * 60 * 60 * 1000
    ).toISOString();

    // --- Total active staff (denominator) ---
    // Join hr_staff_details to staff to get only active staff
    let staffQ = supabase
      .from('staff')
      .select('id, hr_staff_details!hr_staff_details_staff_id_fkey!inner(staff_id)', {
        count: 'exact',
        head: true,
      })
      .eq('is_active', true);
    if (opts?.institution_id) {
      staffQ = staffQ.eq('institution_id', opts.institution_id);
    }
    const { count: totalStaff, error: staffErr } = await staffQ;
    if (staffErr) throw staffErr;
    const total = totalStaff ?? 0;

    // --- Collect distinct active user IDs from each HR action table ---
    const activeUserIds = new Set<string>();
    const actionCounts: FacultyActivityAction[] = [];

    // 1. Leave applications
    let leaveQ = supabase
      .from('hr_leave_applications')
      .select('employee_id')
      .gte('created_at', cutoff);
    if (opts?.institution_id) {
      // hr_leave_applications uses hr_organization_id, not institution_id directly.
      // We query all and let the set handle dedup. RLS scopes to tenant anyway.
    }
    const { data: leaveRows, error: leaveErr } = await leaveQ;
    if (leaveErr) throw leaveErr;
    const leaveUserIds = new Set<string>();
    for (const row of (leaveRows ?? []) as Array<{ employee_id: string }>) {
      if (row.employee_id) {
        leaveUserIds.add(row.employee_id);
        activeUserIds.add(row.employee_id);
      }
    }
    actionCounts.push({ type: 'leave_applications', count: leaveUserIds.size });

    // 2. Attendance regularizations
    let regQ = supabase
      .from('hr_attendance_regularizations')
      .select('employee_id')
      .gte('created_at', cutoff);
    const { data: regRows, error: regErr } = await regQ;
    if (regErr) throw regErr;
    const regUserIds = new Set<string>();
    for (const row of (regRows ?? []) as Array<{ employee_id: string }>) {
      if (row.employee_id) {
        regUserIds.add(row.employee_id);
        activeUserIds.add(row.employee_id);
      }
    }
    actionCounts.push({ type: 'attendance_regularizations', count: regUserIds.size });

    // 3. Employee documents
    let docQ = supabase
      .from('hr_employee_documents')
      .select('staff_id')
      .gte('created_at', cutoff);
    if (opts?.institution_id) {
      docQ = docQ.eq('institution_id', opts.institution_id);
    }
    const { data: docRows, error: docErr } = await docQ;
    if (docErr) throw docErr;
    const docUserIds = new Set<string>();
    for (const row of (docRows ?? []) as Array<{ staff_id: string }>) {
      if (row.staff_id) {
        docUserIds.add(row.staff_id);
        activeUserIds.add(row.staff_id);
      }
    }
    actionCounts.push({ type: 'employee_documents', count: docUserIds.size });

    const activeCount = activeUserIds.size;
    const ratio = total === 0 ? 0 : activeCount / total;

    return {
      activeCount,
      totalStaff: total,
      ratio: Math.round(ratio * 1000) / 1000, // 3 decimal places
      target: this.TARGET,
      actions: actionCounts,
    };
  }
}
