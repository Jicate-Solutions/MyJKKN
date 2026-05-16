/**
 * T4.2 — Pure deduction engine for the JKKN payroll module.
 *
 * Spec: specs/t4-payroll-design-lock-2026-05-15.md (Director-locked 2026-05-15).
 *
 * Computes TDS / PF / ESI / Professional Tax for a single staff member for one
 * month, given:
 *   - basic pay (post-LOP)
 *   - gross pay (post-LOP, including all earnings)
 *   - the four statutory-rate JSON objects pulled from platform_policies.
 *
 * This file is a PURE function — no Supabase, no I/O. The caller (route /
 * service / preview page) is responsible for loading the four policy objects
 * via `loadPayrollPolicies()` (helper below) before invoking `computeDeductions`.
 *
 * Why pure: makes the engine unit-testable, deterministic, and trivially
 * mockable from the read-only preview UI (which seeds policies from `getPolicy`
 * on the server then renders client-side).
 *
 * Day-counting note: this engine computes deductions on the GROSS passed in.
 * The caller is responsible for LOP-adjusting basic/gross BEFORE calling
 * (see spec Day-counting model section: calendar-pay with working-day
 * LOP-divisor).
 */

import type { PolicyKey } from '@/lib/policies/keys';

// ============================================================================
// Policy shape types (mirror the JSON seeded by migration 20260626000000)
// ============================================================================

export interface TdsSlab {
  upto_inr: number | null; // null = no upper bound (highest slab)
  rate_pct: number;
}

export interface TdsSurchargeBracket {
  above_inr: number;
  rate_pct: number;
}

export interface TdsPolicy {
  regime: 'new' | 'old';
  fiscal_year: string;
  slabs: TdsSlab[];
  rebate_87a_threshold_inr: number;
  rebate_87a_amount_inr: number;
  surcharge_thresholds: TdsSurchargeBracket[];
  cess_pct: number;
}

export interface PfPolicy {
  employee_pct: number;
  employer_pct: number;
  ceiling_inr: number;
  applies_above_ceiling: boolean;
}

export interface EsiPolicy {
  employee_pct: number;
  employer_pct: number;
  ceiling_inr: number;
  applies_above_ceiling: boolean;
}

export interface PtSlab {
  upto_inr: number | null;
  amount_inr: number;
}

export interface ProfessionalTaxPolicy {
  state: string;
  frequency: string;
  slabs_monthly: PtSlab[];
}

export interface StandardDeductionPolicy {
  amount_inr: number;
  applies_to_regime: 'new' | 'old';
  applies_to_old_regime_amount_inr: number;
  section: string;
}

export interface PayrollPolicies {
  tds: TdsPolicy;
  pf: PfPolicy;
  esi: EsiPolicy;
  pt: ProfessionalTaxPolicy;
  standardDeduction: StandardDeductionPolicy;
}

// ============================================================================
// Engine I/O
// ============================================================================

export type PaymentMode = 'neft' | 'cheque' | 'cash';

export interface DeductionInput {
  basicPay: number; // post-LOP basic
  grossPay: number; // post-LOP total earnings
  paymentMode: PaymentMode;
  /** True when the staff is exempt from a deduction (e.g., NRI for PF). Defaults all false. */
  exemptions?: Partial<Record<'pf' | 'esi' | 'tds' | 'pt', boolean>>;
}

export interface DeductionLine {
  code: 'PF' | 'ESI' | 'TDS' | 'PT';
  label: string;
  amount: number; // INR, rounded to nearest rupee
  basis: string; // human-readable explanation, e.g. "12% of min(basic, ceiling 15000)"
}

export interface DeductionResult {
  pf: number;
  esi: number;
  tds: number;
  pt: number;
  total: number;
  lines: DeductionLine[];
  netPay: number;
}

// ============================================================================
// Helpers
// ============================================================================

/** Round to nearest rupee (banker's rounding via Math.round is fine for INR). */
function inr(n: number): number {
  return Math.round(n);
}

// ============================================================================
// Individual deduction calculators (pure)
// ============================================================================

/** PF: capped at the wage-ceiling unless the policy says otherwise. */
export function computePf(basic: number, policy: PfPolicy): { amount: number; basis: string } {
  const cappedBasic = policy.applies_above_ceiling
    ? basic
    : Math.min(basic, policy.ceiling_inr);
  const amount = inr((cappedBasic * policy.employee_pct) / 100);
  const basis = policy.applies_above_ceiling
    ? `${policy.employee_pct}% of basic ${basic.toFixed(0)}`
    : `${policy.employee_pct}% of min(basic ${basic.toFixed(0)}, ceiling ${policy.ceiling_inr})`;
  return { amount, basis };
}

/** ESI: computed on gross, only if gross is at-or-below the ceiling. */
export function computeEsi(gross: number, policy: EsiPolicy): { amount: number; basis: string } {
  if (!policy.applies_above_ceiling && gross > policy.ceiling_inr) {
    return {
      amount: 0,
      basis: `Exempt (gross ${gross.toFixed(0)} > ceiling ${policy.ceiling_inr})`,
    };
  }
  const amount = inr((gross * policy.employee_pct) / 100);
  return {
    amount,
    basis: `${policy.employee_pct}% of gross ${gross.toFixed(0)}`,
  };
}

/**
 * TDS: computes annual tax from slabs assuming the supplied monthly gross
 * extrapolates evenly across 12 months. Subtracts standard deduction. Applies
 * Section 87A rebate. Adds cess. Divides back to per-month.
 *
 * Deliberately simplified for T4.2: no Chapter VI-A (80C/80D etc), no surcharge
 * computation, no other-income, no perquisites. Director-locked decision: ship
 * a directionally-correct number that HR can override per-staff via 12BB later.
 */
export function computeTds(
  grossMonthly: number,
  tdsPolicy: TdsPolicy,
  stdDeductionPolicy: StandardDeductionPolicy,
): { amount: number; basis: string } {
  const annualGross = grossMonthly * 12;
  const stdDed =
    tdsPolicy.regime === 'new'
      ? stdDeductionPolicy.amount_inr
      : stdDeductionPolicy.applies_to_old_regime_amount_inr;
  const taxable = Math.max(0, annualGross - stdDed);

  // Walk slabs cumulatively
  let tax = 0;
  let lastUpto = 0;
  for (const slab of tdsPolicy.slabs) {
    const upper = slab.upto_inr ?? Infinity;
    if (taxable <= lastUpto) break;
    const bracketSize = Math.min(taxable, upper) - lastUpto;
    tax += (bracketSize * slab.rate_pct) / 100;
    lastUpto = upper;
    if (taxable <= upper) break;
  }

  // Section 87A rebate (new regime: full rebate if taxable <= threshold)
  if (taxable <= tdsPolicy.rebate_87a_threshold_inr) {
    tax = Math.max(0, tax - tdsPolicy.rebate_87a_amount_inr);
  }

  // Cess
  tax = tax * (1 + tdsPolicy.cess_pct / 100);

  const monthly = inr(tax / 12);
  return {
    amount: monthly,
    basis: `Annual TDS on (gross ${annualGross.toFixed(0)} − std-ded ${stdDed}) = taxable ${taxable.toFixed(0)} → tax+cess ${tax.toFixed(0)} ÷ 12`,
  };
}

/** Professional tax: monthly slab lookup. */
export function computePt(
  grossMonthly: number,
  policy: ProfessionalTaxPolicy,
): { amount: number; basis: string } {
  for (const slab of policy.slabs_monthly) {
    if (slab.upto_inr === null || grossMonthly <= slab.upto_inr) {
      return {
        amount: slab.amount_inr,
        basis: `${policy.state} PT slab: ${slab.amount_inr} for gross ≤ ${slab.upto_inr ?? '∞'}`,
      };
    }
  }
  // Fallback: should not happen since spec guarantees an open-ended top slab
  return { amount: 0, basis: 'no slab matched (policy misconfigured)' };
}

// ============================================================================
// Orchestrator
// ============================================================================

/**
 * Compute all deductions for one staff/month.
 *
 * @param input  basic/gross (post-LOP) + paymentMode + optional exemptions
 * @param policies the 4 statutory policies + standard deduction
 * @returns {pf, esi, tds, pt, total, lines, netPay}
 */
export function computeDeductions(
  input: DeductionInput,
  policies: PayrollPolicies,
): DeductionResult {
  const lines: DeductionLine[] = [];
  const exemptions = input.exemptions ?? {};

  // PF
  let pfAmount = 0;
  if (!exemptions.pf) {
    const r = computePf(input.basicPay, policies.pf);
    pfAmount = r.amount;
    lines.push({ code: 'PF', label: 'Provident Fund', amount: pfAmount, basis: r.basis });
  } else {
    lines.push({ code: 'PF', label: 'Provident Fund', amount: 0, basis: 'Exempt' });
  }

  // ESI
  let esiAmount = 0;
  if (!exemptions.esi) {
    const r = computeEsi(input.grossPay, policies.esi);
    esiAmount = r.amount;
    lines.push({ code: 'ESI', label: 'Employee State Insurance', amount: esiAmount, basis: r.basis });
  } else {
    lines.push({ code: 'ESI', label: 'Employee State Insurance', amount: 0, basis: 'Exempt' });
  }

  // TDS
  let tdsAmount = 0;
  if (!exemptions.tds) {
    const r = computeTds(input.grossPay, policies.tds, policies.standardDeduction);
    tdsAmount = r.amount;
    lines.push({ code: 'TDS', label: 'TDS (Income Tax)', amount: tdsAmount, basis: r.basis });
  } else {
    lines.push({ code: 'TDS', label: 'TDS (Income Tax)', amount: 0, basis: 'Exempt' });
  }

  // PT
  let ptAmount = 0;
  if (!exemptions.pt) {
    const r = computePt(input.grossPay, policies.pt);
    ptAmount = r.amount;
    lines.push({ code: 'PT', label: 'Professional Tax', amount: ptAmount, basis: r.basis });
  } else {
    lines.push({ code: 'PT', label: 'Professional Tax', amount: 0, basis: 'Exempt' });
  }

  const total = pfAmount + esiAmount + tdsAmount + ptAmount;
  const netPay = input.grossPay - total;

  return {
    pf: pfAmount,
    esi: esiAmount,
    tds: tdsAmount,
    pt: ptAmount,
    total,
    lines,
    netPay,
  };
}

// ============================================================================
// Policy loader (server-only — calls fn_get_policy via Supabase RPC)
// ============================================================================

import { getPolicy } from '@/lib/policies/get-policy';
import { POLICY_KEYS } from '@/lib/policies/keys';

/**
 * Load all 5 payroll policies in parallel. Returns null if any required
 * policy is missing (caller should surface a config error to UI).
 *
 * scopeId: institution_id when the caller wants per-institution overrides
 * to take effect; null falls back to global.
 */
export async function loadPayrollPolicies(scopeId?: string | null): Promise<PayrollPolicies | null> {
  const [tds, pf, esi, pt, sd] = await Promise.all([
    getPolicy<TdsPolicy>(POLICY_KEYS.HR_PAYROLL_TDS_SLABS as PolicyKey, scopeId),
    getPolicy<PfPolicy>(POLICY_KEYS.HR_PAYROLL_PF_RATE as PolicyKey, scopeId),
    getPolicy<EsiPolicy>(POLICY_KEYS.HR_PAYROLL_ESI_RATE as PolicyKey, scopeId),
    getPolicy<ProfessionalTaxPolicy>(POLICY_KEYS.HR_PAYROLL_PROFESSIONAL_TAX as PolicyKey, scopeId),
    getPolicy<StandardDeductionPolicy>(POLICY_KEYS.HR_PAYROLL_STANDARD_DEDUCTION as PolicyKey, scopeId),
  ]);

  if (!tds || !pf || !esi || !pt || !sd) {
    return null;
  }

  return { tds, pf, esi, pt, standardDeduction: sd };
}
