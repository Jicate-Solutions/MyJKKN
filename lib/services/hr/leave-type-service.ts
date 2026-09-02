/**
 * HR Leave Types service.
 *
 * Static class, SupabaseClient passed as first argument — mirrors
 * ShiftService / RecruitmentJobsService.
 *
 * Supabase errors are plain objects, not Error instances, so every call
 * destructures { error } and throws it. try/catch alone does NOT surface RLS
 * denials or constraint violations.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  HRLeaveType,
  HRLeaveTypeFilters,
  HRLeaveTypeInsert,
  HRLeaveTypeUpdate,
} from '@/types/hr-leave-types';
import type { HRLeaveBalanceAnalytics } from '@/types/hr-leave-analytics';
import type {
  HRBalanceAdjustPayload,
  HRBalanceAdjustResult,
  HRStaffBalanceDetail,
} from '@/types/hr-leave-staff-balances';
import type { LeavePeriodUsage, StoUsage } from '@/types/hr-leave-types';

/**
 * What hr_leave_type_delete() returns, for both the dry run and the commit.
 *
 * `blockers` is present on the refusal AND on a successful dry run — all zeros
 * in the latter case — so the dialog can render one component either way.
 */
export interface HRLeaveTypeDeleteResult {
  ok: boolean;
  dry_run?: boolean;
  leave_type_name?: string;
  /** 'permission_denied' | 'not_found' | 'still_active' | 'in_use' | a SQLERRM. */
  error?: string;
  message?: string;
  blockers?: {
    applications: number;
    encashments: number;
    consumed_balances: number;
    overrides: number;
    adjustments: number;
    superseding_types: number;
  };
  /** Present on a clean dry run. */
  will_remove?: HRLeaveTypeDeleteCounts;
  /** Present after the commit. */
  removed?: HRLeaveTypeDeleteCounts;
}

export interface HRLeaveTypeDeleteCounts {
  /** Generated ledger rows nobody consumed — see the migration's note. */
  placeholder_balances: number;
  assignments: number;
  cadre_entitlements: number;
  policies: number;
}

export interface GenerateBalancesFallback {
  staff_code: string;
  name: string;
  reason: string;
}

export interface GenerateBalancesResult {
  dry_run: boolean;
  created: number;
  skipped: number;
  prior_year_id: string | null;
  fallback_count: number;
  fallback: GenerateBalancesFallback[];
}

/** One institution's outcome inside a bulk run. */
export interface GenerateBalancesOrgResult {
  hr_organization_id: string;
  institution_name: string;
  created: number;
  skipped: number;
  fallback_count: number;
  fallback: GenerateBalancesFallback[];
  /**
   * Set when this institution alone failed. Each organization runs in its own
   * subtransaction, so a message here means the other institutions in the same
   * run still completed.
   */
  error: string | null;
}

export interface GenerateBalancesBulkResult {
  dry_run: boolean;
  hr_academic_year_id: string;
  year_name: string;
  organizations: number;
  total_created: number;
  total_skipped: number;
  total_fallback: number;
  error_count: number;
  results: GenerateBalancesOrgResult[];
}

export class HRLeaveTypeService {
  static async list(
    supabase: SupabaseClient,
    filters: HRLeaveTypeFilters = {}
  ): Promise<HRLeaveType[]> {
    let query = supabase
      .from('hr_leave_types')
      .select('*')
      .order('display_order', { ascending: true })
      .order('leave_type_name', { ascending: true });

    // `??` not `||` — `||` coerces undefined to '' which is sent as a real
    // uuid parameter and matches zero rows.
    if (filters.hr_organization_id != null) {
      query = query.eq('hr_organization_id', filters.hr_organization_id);
    }
    if (filters.is_active != null) {
      query = query.eq('is_active', filters.is_active);
    }
    // Drives the Time Off tabs: 'leave' excludes Permission (hourly) and
    // Compensatory Off, which have their own request forms.
    if (filters.request_category != null) {
      query = query.eq('request_category', filters.request_category);
    }
    if (filters.search) {
      query = query.or(
        `leave_type_name.ilike.%${filters.search}%,leave_type_code.ilike.%${filters.search}%`
      );
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as HRLeaveType[];
  }

  static async create(
    supabase: SupabaseClient,
    payload: HRLeaveTypeInsert
  ): Promise<HRLeaveType> {
    const { data, error } = await supabase
      .from('hr_leave_types')
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    return data as HRLeaveType;
  }

  static async update(
    supabase: SupabaseClient,
    id: string,
    patch: HRLeaveTypeUpdate
  ): Promise<HRLeaveType> {
    const { data, error } = await supabase
      .from('hr_leave_types')
      .update(patch)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data as HRLeaveType;
  }

  /** Soft-archive: the type stops being offered, everything else is untouched. */
  static async remove(supabase: SupabaseClient, id: string): Promise<void> {
    const { error } = await supabase
      .from('hr_leave_types')
      .update({ is_active: false })
      .eq('id', id);
    if (error) throw error;
  }

  /**
   * Un-archive. The exact inverse of remove(), and safe for the same reason:
   * archiving never touched a balance, an application or an assignment, so
   * putting is_active back restores precisely what was there.
   */
  static async restore(supabase: SupabaseClient, id: string): Promise<void> {
    const { error } = await supabase
      .from('hr_leave_types')
      .update({ is_active: true })
      .eq('id', id);
    if (error) throw error;
  }

  /**
   * Hard delete, through the guarded RPC.
   *
   * NOT a plain .delete(): nine tables FK to hr_leave_types and they disagree
   * about what a delete means — four block it, five CASCADE, and the cascading
   * five include the balance-adjustment audit trail and every per-staff
   * entitlement override. hr_leave_type_delete() decides in one transaction and
   * names what stopped it. See 20260824220000.
   *
   * Call with dryRun to populate the confirmation dialog; the commit re-runs
   * every check, so the two can never disagree.
   */
  static async hardDelete(
    supabase: SupabaseClient,
    id: string,
    dryRun: boolean
  ): Promise<HRLeaveTypeDeleteResult> {
    const { data, error } = await supabase.rpc('hr_leave_type_delete', {
      p_leave_type_id: id,
      p_dry_run: dryRun,
    });
    if (error) throw error;
    return data as HRLeaveTypeDeleteResult;
  }

  /**
   * Short Time Off usage in the current period.
   *
   * Resolved server-side because the limits themselves are resolved there —
   * an assignment may override the type's whole limit block, and duplicating
   * that precedence in the client would drift from the trigger that enforces
   * it.
   */
  static async getStoUsage(
    supabase: SupabaseClient,
    employeeId: string,
    leaveTypeId: string,
    hrAcademicYearId: string | null,
    /** Request date; omitted means today. Must match what enforcement sees. */
    onDate?: string
  ): Promise<StoUsage> {
    const { data, error } = await supabase.rpc('hr_sto_usage', {
      p_staff_id: employeeId,
      p_leave_type_id: leaveTypeId,
      p_hr_academic_year_id: hrAcademicYearId,
      ...(onDate ? { p_on: onDate } : {}),
    });
    if (error) throw error;
    return data as StoUsage;
  }

  /**
   * Day-based leave usage within the current period — the "2 a month" throttle
   * that sits alongside the annual entitlement.
   *
   * Server-side for the same reason as getStoUsage: the RPC recomputes days
   * exactly the way trg_hla_leave_period_cap does, so the figure shown is the
   * one that will actually be applied. Recomputing it in the client from the
   * applications list would drift the first time hr_calc_leave_days changes how
   * it treats weekends or holidays.
   */
  static async getLeavePeriodUsage(
    supabase: SupabaseClient,
    employeeId: string,
    leaveTypeId: string,
    hrAcademicYearId: string | null,
    /** Request date; omitted means today. Must match what enforcement sees. */
    onDate?: string
  ): Promise<LeavePeriodUsage> {
    const { data, error } = await supabase.rpc('hr_leave_period_usage', {
      p_staff_id: employeeId,
      p_leave_type_id: leaveTypeId,
      p_hr_academic_year_id: hrAcademicYearId,
      ...(onDate ? { p_on: onDate } : {}),
    });
    if (error) throw error;
    return data as LeavePeriodUsage;
  }

  /**
   * Can the caller act on any leave application?
   *
   * Backed by an RPC that mirrors the hla_update RLS policy, so the Approvals
   * tab, its route guard and the database cannot drift apart. Do NOT
   * substitute a client-side `hasPermission('hr.leave.approve')` check: the
   * policy also requires org membership, and a tab that leads to a page the
   * database rejects is worse than no tab.
   */
  static async canApproveLeave(supabase: SupabaseClient): Promise<boolean> {
    const { data, error } = await supabase.rpc('hr_can_approve_leave');
    if (error) throw error;
    return data === true;
  }

  /**
   * Institution-wise provisioning analytics for one HR academic year.
   *
   * Pass null to resolve "the year containing today". An id is enough now that
   * HR years are group-wide — this used to take the year NAME, because
   * academic_years rows are per-institution and no single id could address a
   * cross-institution view.
   *
   * The RPC self-authorizes on hr.leave.balance.manage and scopes rows with
   * role_has_institution_access, so callers get only their own institutions.
   */
  static async getBalanceAnalytics(
    supabase: SupabaseClient,
    hrAcademicYearId: string | null
  ): Promise<HRLeaveBalanceAnalytics> {
    const { data, error } = await supabase.rpc('hr_leave_balance_analytics', {
      p_hr_academic_year_id: hrAcademicYearId,
    });
    if (error) throw error;
    return data as HRLeaveBalanceAnalytics;
  }

  /**
   * One institution's staff, pivot-ready.
   *
   * Goes through the RPC rather than reading v_hr_leave_balance directly: that
   * view gates non-self rows on hr.leave.approve, but the page that renders
   * this is guarded on hr.leave.balance.manage, and those are different keys —
   * Board Member holds manage without approve and would have seen an empty
   * table. The RPC gates on manage, matching getBalanceAnalytics above.
   */
  static async getStaffBalances(
    supabase: SupabaseClient,
    hrOrgId: string,
    hrAcademicYearId: string | null
  ): Promise<HRStaffBalanceDetail> {
    const { data, error } = await supabase.rpc('hr_leave_balance_staff_detail', {
      p_hr_org_id: hrOrgId,
      p_hr_academic_year_id: hrAcademicYearId,
    });
    if (error) throw error;
    return data as HRStaffBalanceDetail;
  }

  /**
   * Correct a single (staff, leave type) cell, with an audit row.
   *
   * The RPC applies a DIFFERENT permission key per action — set_used needs
   * hr.leave.policies.write, the entitlement actions need
   * hr.leave.balance.manage — mirroring each table's own RLS. Callers should
   * hide the lever they cannot use rather than let the RPC refuse it.
   */
  static async adjustBalance(
    supabase: SupabaseClient,
    payload: HRBalanceAdjustPayload
  ): Promise<HRBalanceAdjustResult> {
    const { data, error } = await supabase.rpc('hr_leave_balance_adjust', {
      p_employee_id: payload.employee_id,
      p_leave_type_id: payload.leave_type_id,
      p_hr_academic_year_id: payload.hr_academic_year_id,
      p_action: payload.action,
      p_value: payload.value,
      p_reason: payload.reason,
    });
    if (error) throw error;
    return data as HRBalanceAdjustResult;
  }

  static async generateBalances(
    supabase: SupabaseClient,
    hrOrgId: string,
    hrAcademicYearId: string,
    dryRun: boolean
  ): Promise<GenerateBalancesResult> {
    const { data, error } = await supabase.rpc('generate_hr_leave_balances', {
      p_hr_org_id: hrOrgId,
      p_hr_academic_year_id: hrAcademicYearId,
      p_dry_run: dryRun,
    });
    if (error) throw error;
    return data as GenerateBalancesResult;
  }

  /**
   * Provision several institutions in one round trip.
   *
   * `hrOrgIds` null means every organization the caller can access. The RPC
   * delegates to generate_hr_leave_balances per organization inside its own
   * subtransaction, so a single institution failing comes back as that row's
   * `error` rather than discarding the whole run — check `error_count` before
   * reporting success.
   */
  static async generateBalancesBulk(
    supabase: SupabaseClient,
    hrAcademicYearId: string,
    hrOrgIds: string[] | null,
    dryRun: boolean
  ): Promise<GenerateBalancesBulkResult> {
    const { data, error } = await supabase.rpc('generate_hr_leave_balances_bulk', {
      p_hr_academic_year_id: hrAcademicYearId,
      p_hr_org_ids: hrOrgIds,
      p_dry_run: dryRun,
    });
    if (error) throw error;
    return data as GenerateBalancesBulkResult;
  }
}
