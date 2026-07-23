/**
 * HR Offboarding Service (T6.4 — Separation/Exit Extension).
 *
 * Backs the Wave-2 separation extension on top of Wave-1 γ's
 * hr_offboarding_cases + hr_offboarding_step_completions substrate (PR #890).
 *
 * Methods:
 *   - calculateFnf            Compute Full & Final settlement for a case
 *                             using salary inputs + leave balance + tenure.
 *                             Persists a new hr_fnf_calculations row and
 *                             caches the summary on hr_offboarding_cases.
 *   - getLatestFnf            Read the most recent F&F row for a case.
 *   - enforceResignationRules Run hr.resignation_workflow policy checks
 *                             against a draft resignation submission.
 *                             Returns { ok, violations[] } — caller blocks
 *                             submission when violations is non-empty.
 *
 * Static class. SupabaseClient passed as first arg (mirrors OnboardingService).
 *
 * Spec: hr-module-decomposition-2026-05-09.md (T6.4)
 * Companions:
 *   - supabase/migrations/20260621_hr_separation_extension.sql
 *   - app/(routes)/hr/admin/offboarding/[id]/fnf/page.tsx
 *   - app/(routes)/hr/admin/offboarding/retirements/page.tsx
 *   - app/api/cron/hr-retirement-eligibility-detector/route.ts
 */

import type { SupabaseClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FnfSalaryBreakdown {
  basic?: number;
  da?: number;
  hra?: number;
  special_allowance?: number;
  gross?: number;
  last_drawn_at?: string;
  /** Days of accrued leave eligible for encashment. */
  leave_balance_days?: number;
  /** Tenure in years (decimal). Drives gratuity if not pre-computed. */
  tenure_years?: number;
}

export interface FnfCalcInput {
  caseId: string;
  /** Salary snapshot used as the calculation basis. */
  salaryBreakdown: FnfSalaryBreakdown;
  /** Optional overrides — when present, skip the formula. */
  gratuityOverride?: number;
  leaveEncashmentOverride?: number;
  pfBalance?: number;
  otherPayable?: number;
  otherRecoverable?: number;
  notes?: string;
}

export interface FnfCalcResult {
  id: string;
  case_id: string;
  gratuity: number;
  leave_encashment: number;
  pf_balance: number;
  other_payable: number;
  other_recoverable: number;
  net_payable: number;
  last_salary_breakdown: FnfSalaryBreakdown;
  notes: string | null;
  calculated_at: string;
  approved_at: string | null;
}

export interface ResignationRulesPolicy {
  per_appointment_letter_provisions?: boolean;
  dues_settlement_requires_clearance_form?: boolean;
  min_service_years?: number;
  notice_period_months?: number;
  notice_or_pay_in_lieu?: boolean;
  notice_starts_after_md_approval?: boolean;
  end_of_academic_year_only?: boolean;
  offboarding_workflow_doc_ref?: string;
}

export interface ResignationViolation {
  rule: string;
  message: string;
}

export interface ResignationRulesCheck {
  ok: boolean;
  policyFound: boolean;
  violations: ResignationViolation[];
}

// ---------------------------------------------------------------------------
// Formula helpers
// ---------------------------------------------------------------------------

/**
 * Indian gratuity formula (Payment of Gratuity Act, 1972):
 *   gratuity = (basic + DA) × 15/26 × completed_years_of_service
 * Capped at 20 lakh per the 2018 ceiling.
 *
 * Eligibility: minimum 5 years of continuous service (the act). Below 5
 * years we return 0 — caller can override via gratuityOverride if the
 * institution policy is more generous than statute.
 */
function computeGratuity(b: FnfSalaryBreakdown): number {
  const basic = b.basic ?? 0;
  const da = b.da ?? 0;
  const years = b.tenure_years ?? 0;
  if (years < 5) return 0;
  const wage = basic + da;
  if (wage <= 0) return 0;
  const completedYears = Math.floor(years);
  const raw = wage * (15 / 26) * completedYears;
  const capped = Math.min(raw, 2_000_000); // 20 lakh statutory cap
  return Math.round(capped * 100) / 100;
}

/**
 * Leave encashment = per_day_wage × leave_balance_days.
 * per_day_wage uses (basic + DA) / 30, mirroring the gratuity wage base.
 */
function computeLeaveEncashment(b: FnfSalaryBreakdown): number {
  const days = b.leave_balance_days ?? 0;
  if (days <= 0) return 0;
  const basic = b.basic ?? 0;
  const da = b.da ?? 0;
  const wage = basic + da;
  if (wage <= 0) return 0;
  const perDay = wage / 30;
  const raw = perDay * days;
  return Math.round(raw * 100) / 100;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class OffboardingService {
  /**
   * Compute + persist a Full & Final settlement for an offboarding case.
   *
   * The HR officer provides salary inputs + (optional) overrides; the service
   * runs the standard formulas, INSERTs a new hr_fnf_calculations row, and
   * UPDATEs hr_offboarding_cases.fnf_calculation with a denormalised summary
   * so list views stay one-query-cheap.
   *
   * Returns the persisted row (with the generated net_payable).
   */
  static async calculateFnf(
    supabase: SupabaseClient,
    input: FnfCalcInput,
  ): Promise<FnfCalcResult> {
    const gratuity = input.gratuityOverride ?? computeGratuity(input.salaryBreakdown);
    const leave = input.leaveEncashmentOverride ?? computeLeaveEncashment(input.salaryBreakdown);
    const pf = input.pfBalance ?? 0;
    const otherPay = input.otherPayable ?? 0;
    const otherRec = input.otherRecoverable ?? 0;

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { data, error } = await supabase
      .from('hr_fnf_calculations')
      .insert({
        case_id: input.caseId,
        gratuity,
        leave_encashment: leave,
        pf_balance: pf,
        other_payable: otherPay,
        other_recoverable: otherRec,
        last_salary_breakdown: input.salaryBreakdown,
        notes: input.notes ?? null,
        calculated_by: user?.id ?? null,
      })
      .select(
        'id, case_id, gratuity, leave_encashment, pf_balance, other_payable, other_recoverable, net_payable, last_salary_breakdown, notes, calculated_at, approved_at',
      )
      .single();

    if (error) throw error;

    // Cache summary on the case row so list views skip the join.
    const summary = {
      gratuity: Number(data.gratuity),
      leave_encashment: Number(data.leave_encashment),
      pf_balance: Number(data.pf_balance),
      other_payable: Number(data.other_payable),
      other_recoverable: Number(data.other_recoverable),
      net_payable: Number(data.net_payable),
      calculated_at: data.calculated_at,
      approved_at: data.approved_at,
    };
    // Best-effort — if the cache update fails (e.g. RLS), the F&F row is
    // already canonical; surface the underlying error rather than silent drop.
    const { error: cacheErr } = await supabase
      .from('hr_offboarding_cases')
      .update({ fnf_calculation: summary })
      .eq('id', input.caseId);
    if (cacheErr) throw cacheErr;

    return {
      ...data,
      gratuity: Number(data.gratuity),
      leave_encashment: Number(data.leave_encashment),
      pf_balance: Number(data.pf_balance),
      other_payable: Number(data.other_payable),
      other_recoverable: Number(data.other_recoverable),
      net_payable: Number(data.net_payable),
      last_salary_breakdown: data.last_salary_breakdown as FnfSalaryBreakdown,
    };
  }

  /** Read the most recent F&F row for a case (or null if none yet). */
  static async getLatestFnf(
    supabase: SupabaseClient,
    caseId: string,
  ): Promise<FnfCalcResult | null> {
    const { data, error } = await supabase
      .from('hr_fnf_calculations')
      .select(
        'id, case_id, gratuity, leave_encashment, pf_balance, other_payable, other_recoverable, net_payable, last_salary_breakdown, notes, calculated_at, approved_at',
      )
      .eq('case_id', caseId)
      .order('calculated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return {
      ...data,
      gratuity: Number(data.gratuity),
      leave_encashment: Number(data.leave_encashment),
      pf_balance: Number(data.pf_balance),
      other_payable: Number(data.other_payable),
      other_recoverable: Number(data.other_recoverable),
      net_payable: Number(data.net_payable),
      last_salary_breakdown: data.last_salary_breakdown as FnfSalaryBreakdown,
    };
  }

  /**
   * Validate a draft resignation submission against hr.resignation_workflow
   * policy for the staff member's institution.
   *
   * Returns { ok, policyFound, violations }. Caller blocks the submission
   * when ok=false. If the policy row is missing, policyFound=false and
   * violations is empty (caller can decide to soft-allow or block).
   *
   * Checks today (mirrors policy keys in 20260610_hr_governance_part3_seeds.sql):
   *   - min_service_years         tenure_years >= min
   *   - notice_period_months      notice_days >= min × 30
   *   - end_of_academic_year_only recommended_last_day month-day rules
   */
  static async enforceResignationRules(
    supabase: SupabaseClient,
    args: {
      institutionId: string;
      tenureYears: number;
      noticeDays: number;
      recommendedLastDay: string | null;
    },
  ): Promise<ResignationRulesCheck> {
    const { data, error } = await supabase
      .from('platform_policies')
      .select('value')
      .eq('policy_key', 'hr.resignation_workflow')
      .eq('scope_type', 'institution')
      .eq('scope_id', args.institutionId)
      .maybeSingle();
    if (error) throw error;

    const violations: ResignationViolation[] = [];

    if (!data) {
      return { ok: true, policyFound: false, violations };
    }
    const policy = (data.value ?? {}) as ResignationRulesPolicy;

    if (policy.min_service_years !== undefined && policy.min_service_years !== null) {
      if (args.tenureYears < policy.min_service_years) {
        violations.push({
          rule: 'min_service_years',
          message: `Minimum service is ${policy.min_service_years} years; current tenure is ${args.tenureYears.toFixed(1)} years.`,
        });
      }
    }

    if (policy.notice_period_months !== undefined && policy.notice_period_months !== null) {
      const required = policy.notice_period_months * 30;
      if (args.noticeDays < required) {
        violations.push({
          rule: 'notice_period_months',
          message: `Notice period must be at least ${policy.notice_period_months} months (~${required} days); provided ${args.noticeDays} days.`,
        });
      }
    }

    if (policy.end_of_academic_year_only && args.recommendedLastDay) {
      const d = new Date(args.recommendedLastDay);
      // Academic year ends 31 May in JKKN. Allow ±15 day window for in-context UX.
      const month = d.getUTCMonth(); // 0-indexed; May = 4
      const day = d.getUTCDate();
      const inMayWindow = month === 4 && day >= 16;
      const inJuneWindow = month === 5 && day <= 15;
      if (!inMayWindow && !inJuneWindow) {
        violations.push({
          rule: 'end_of_academic_year_only',
          message: `Recommended last day must fall in the end-of-academic-year window (16 May – 15 June). Got ${args.recommendedLastDay}.`,
        });
      }
    }

    return { ok: violations.length === 0, policyFound: true, violations };
  }
}

// Re-export pure helpers so other callers can compute without DB round-trip.
export const _fnfFormulas = {
  computeGratuity,
  computeLeaveEncashment,
};
