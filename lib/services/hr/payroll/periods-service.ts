/**
 * HR Payroll Periods Service (T4.3 PR 2)
 *
 * Spec: specs/t4-payroll-design-lock-2026-05-15.md (20 decisions, lock 2026-05-15)
 * Substrate: 20260628000000_t4_3_payroll_periods_approvals_payslips.sql
 * RPCs:      20260629000000_t4_3_pr2_payroll_rpcs.sql
 *
 * Static class — SupabaseClient passed as first argument (mirrors
 * RecruitmentJobsService and PolicyService conventions in this codebase).
 *
 * Methods (CRUD + RPC wrappers):
 *   listPeriods       — paginated list with filters
 *   getPeriod         — single record by id
 *   createPeriod      — open a new period in 'draft' state (HR Officer only — RLS-enforced)
 *   preparePeriod     — RPC: draft → prepared (Decision #9 stage 1)
 *   advancePeriod     — RPC: generic stage advance (Decision #9 stages 2-5)
 *   rejectPeriod      — RPC: drop one stage back
 *   backdatePeriod    — RPC: Director-only retroactive flag (Decision #20)
 *
 * All RPC wrappers return the updated period row so the caller can update
 * React Query caches without a follow-up SELECT.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  HRPayrollPeriod,
  HRPayrollPeriodInsert,
  PayrollPeriodFilters,
  PayrollPeriodListResponse,
} from '@/types/hr-payroll';

// =====================================================================================
// Payroll Periods Service
// =====================================================================================

export class PayrollPeriodsService {
  // ----- List / Get -----

  static async listPeriods(
    supabase: SupabaseClient,
    filters: PayrollPeriodFilters = {},
  ): Promise<PayrollPeriodListResponse> {
    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 50;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let q = supabase
      .from('hr_payroll_periods')
      .select('*', { count: 'exact' })
      .order('period_year', { ascending: false })
      .order('period_month', { ascending: false })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (filters.hr_organization_id) {
      q = q.eq('hr_organization_id', filters.hr_organization_id);
    }
    if (filters.institution_id) {
      q = q.eq('institution_id', filters.institution_id);
    }
    if (filters.engine_type) {
      q = q.eq('engine_type', filters.engine_type);
    }
    if (filters.period_year !== undefined) {
      q = q.eq('period_year', filters.period_year);
    }
    if (filters.period_month !== undefined) {
      q = q.eq('period_month', filters.period_month);
    }
    if (filters.status) {
      const statuses = Array.isArray(filters.status) ? filters.status : [filters.status];
      q = q.in('status', statuses);
    }
    if (filters.is_backdated !== undefined) {
      q = q.eq('is_backdated', filters.is_backdated);
    }

    const { data, count, error } = await q;
    if (error) throw error;

    return {
      data: (data ?? []) as HRPayrollPeriod[],
      metadata: {
        total: count ?? 0,
        page,
        pageSize,
        totalPages: Math.max(1, Math.ceil((count ?? 0) / pageSize)),
      },
    };
  }

  static async getPeriod(
    supabase: SupabaseClient,
    id: string,
  ): Promise<HRPayrollPeriod | null> {
    const { data, error } = await supabase
      .from('hr_payroll_periods')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data as HRPayrollPeriod | null;
  }

  // ----- Create (raw insert; flips to 'draft' by default via column default) -----

  static async createPeriod(
    supabase: SupabaseClient,
    payload: HRPayrollPeriodInsert,
  ): Promise<HRPayrollPeriod> {
    if (!payload.hr_organization_id) {
      throw new Error('hr_organization_id is required.');
    }
    if (!payload.institution_id) {
      throw new Error('institution_id is required.');
    }
    if (payload.engine_type !== 'faculty' && payload.engine_type !== 'non_teaching') {
      throw new Error('engine_type must be faculty or non_teaching.');
    }
    if (!Number.isInteger(payload.period_year) || payload.period_year < 2020 || payload.period_year > 2100) {
      throw new Error('period_year must be an integer between 2020 and 2100.');
    }
    if (!Number.isInteger(payload.period_month) || payload.period_month < 1 || payload.period_month > 12) {
      throw new Error('period_month must be an integer between 1 and 12.');
    }
    if (payload.is_backdated && !payload.backdate_reason) {
      throw new Error('backdate_reason is required when is_backdated=true.');
    }

    const insertPayload: Record<string, unknown> = {
      hr_organization_id: payload.hr_organization_id,
      institution_id: payload.institution_id,
      engine_type: payload.engine_type,
      period_year: payload.period_year,
      period_month: payload.period_month,
      status: payload.status ?? 'draft',
      is_backdated: payload.is_backdated ?? false,
      backdate_reason: payload.backdate_reason ?? null,
    };

    const { data, error } = await supabase
      .from('hr_payroll_periods')
      .insert(insertPayload)
      .select()
      .single();
    if (error) throw error;
    return data as HRPayrollPeriod;
  }

  // ----- RPC wrappers (state-machine transitions) -----

  /**
   * Decision #9 stage 1: HR Officer flips draft → prepared.
   * Server-side snapshots pay_matrix + deduction_rates + computes working_days.
   */
  static async preparePeriod(
    supabase: SupabaseClient,
    periodId: string,
    comment?: string,
  ): Promise<HRPayrollPeriod> {
    const { data, error } = await supabase.rpc('fn_prepare_payroll_period', {
      p_period_id: periodId,
      p_comment: comment ?? null,
    });
    if (error) throw error;
    return data as unknown as HRPayrollPeriod;
  }

  /**
   * Decision #9 stages 2-5: generic stage advance. Target derived from
   * current status server-side; role guard enforced inside the RPC.
   */
  static async advancePeriod(
    supabase: SupabaseClient,
    periodId: string,
    comment?: string,
  ): Promise<HRPayrollPeriod> {
    const { data, error } = await supabase.rpc('fn_advance_payroll_period', {
      p_period_id: periodId,
      p_comment: comment ?? null,
    });
    if (error) throw error;
    return data as unknown as HRPayrollPeriod;
  }

  /**
   * Drop the period one stage back. Comment REQUIRED (server-validated).
   * Audit row carries stage='rejected_to_prior' + rejected_from_stage.
   */
  static async rejectPeriod(
    supabase: SupabaseClient,
    periodId: string,
    comment: string,
  ): Promise<HRPayrollPeriod> {
    if (!comment || !comment.trim()) {
      throw new Error('rejectPeriod requires a non-empty comment.');
    }
    const { data, error } = await supabase.rpc('fn_reject_payroll_period', {
      p_period_id: periodId,
      p_comment: comment.trim(),
    });
    if (error) throw error;
    return data as unknown as HRPayrollPeriod;
  }

  /**
   * Decision #20 Director-only retroactive flag. Reason REQUIRED.
   * Does NOT change status — only sets is_backdated=true + records audit.
   */
  static async backdatePeriod(
    supabase: SupabaseClient,
    periodId: string,
    reason: string,
  ): Promise<HRPayrollPeriod> {
    if (!reason || !reason.trim()) {
      throw new Error('backdatePeriod requires a non-empty reason.');
    }
    const { data, error } = await supabase.rpc('fn_backdate_payroll_period', {
      p_period_id: periodId,
      p_reason: reason.trim(),
    });
    if (error) throw error;
    return data as unknown as HRPayrollPeriod;
  }
}
