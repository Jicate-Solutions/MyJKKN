/**
 * T4.4 — Payslip Generation Engine
 *
 * Orchestrates payslip generation for a payroll period:
 *   1. Load active staff for the period's institution
 *   2. Look up each staff member's pay scale (by designation/cadre)
 *   3. Calculate earnings from pay components
 *   4. Apply LOP adjustment
 *   5. Run DeductionEngine for PF/ESI/TDS/PT
 *   6. Insert hr_payslips + hr_payslip_line_items
 *   7. Update period aggregates (total_gross, total_deductions, total_net, staff_count)
 *
 * Design locks (T4.0, 2026-05-24):
 *   - Staff scope: all active staff in institution
 *   - Deductions: auto-calculate with manual override (override is a separate PATCH)
 *   - PDF: deferred to T4.5
 *   - Bank file: deferred (user will share format spec)
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  computeDeductions,
  loadPayrollPolicies,
  type DeductionResult,
  type PayrollPolicies,
} from './deduction-engine';

interface StaffPayInfo {
  staff_id: string;
  first_name: string;
  last_name: string;
  designation_id: string | null;
  cadre_id: string | null;
  institution_id: string;
}

interface PayScale {
  id: string;
  basic_pay: number;
  grade_pay: number;
}

interface PayComponent {
  id: string;
  code: string;
  component_type: string;
  calculation_basis: string;
  default_amount_or_percent: number;
}

export interface GenerationResult {
  generated: number;
  skipped: number;
  errors: { staff_id: string; name: string; reason: string }[];
  totals: { gross: number; deductions: number; net: number };
}

export class PayslipGenerator {
  /**
   * Generate payslips for all active staff in a period's institution.
   * Period must be in 'prepared' status (draft → prepared transition triggers generation).
   */
  static async generate(
    supabase: SupabaseClient,
    periodId: string,
  ): Promise<GenerationResult> {
    // 1. Load the period
    const { data: period, error: periodErr } = await (supabase as any)
      .from('hr_payroll_periods')
      .select('*')
      .eq('id', periodId)
      .single();

    if (periodErr || !period) {
      throw new Error(`Period not found: ${periodErr?.message ?? 'null'}`);
    }

    if (period.status !== 'prepared') {
      throw new Error(`Period must be in 'prepared' status to generate payslips. Current: ${period.status}`);
    }

    // 2. Check for existing non-superseded payslips (idempotency guard)
    const { count: existingCount } = await (supabase as any)
      .from('hr_payslips')
      .select('id', { count: 'exact', head: true })
      .eq('period_id', periodId)
      .is('superseded_by', null);

    if ((existingCount ?? 0) > 0) {
      throw new Error(`Period already has ${existingCount} active payslips. Delete or supersede them first.`);
    }

    // 3. Load active staff for the institution
    const { data: staffList, error: staffErr } = await supabase
      .from('staff')
      .select('id, first_name, last_name, designation_id, cadre_id, institution_id')
      .eq('institution_id', period.institution_id)
      .eq('is_active', true);

    if (staffErr) throw new Error(`Failed to load staff: ${staffErr.message}`);
    if (!staffList || staffList.length === 0) {
      return { generated: 0, skipped: 0, errors: [], totals: { gross: 0, deductions: 0, net: 0 } };
    }

    // 4. Load pay scales for the institution (keyed by designation_id)
    const { data: payScales } = await (supabase as any)
      .from('hr_pay_scales')
      .select('id, designation_id, cadre_id, basic_pay, grade_pay')
      .eq('hr_organization_id', period.hr_organization_id)
      .is('superseded_by', null);

    const scaleByDesignation = new Map<string, PayScale>();
    const scaleByCadre = new Map<string, PayScale>();
    for (const s of (payScales ?? [])) {
      if (s.designation_id) scaleByDesignation.set(s.designation_id, s);
      if (s.cadre_id) scaleByCadre.set(s.cadre_id, s);
    }

    // 5. Load active pay components for the institution
    const { data: components } = await (supabase as any)
      .from('hr_pay_components')
      .select('id, code, component_type, calculation_basis, default_amount_or_percent, applies_to_engine_types')
      .eq('institution_id', period.institution_id)
      .eq('is_active', true)
      .order('display_order', { ascending: true });

    const earningComponents = (components ?? []).filter(
      (c: PayComponent) =>
        c.component_type === 'earning' &&
        (c as any).applies_to_engine_types?.includes(period.engine_type),
    );

    // 6. Load payroll policies for deduction calculation
    const policies = await loadPayrollPolicies(period.institution_id);
    if (!policies) {
      throw new Error('Payroll policies not configured for this institution. Configure PF/ESI/TDS/PT policies first.');
    }

    // 7. Generate payslips for each staff member
    const result: GenerationResult = {
      generated: 0,
      skipped: 0,
      errors: [],
      totals: { gross: 0, deductions: 0, net: 0 },
    };

    const payslipInserts: any[] = [];
    const lineItemInserts: any[] = [];

    for (const staff of staffList as StaffPayInfo[]) {
      const name = `${staff.first_name} ${staff.last_name}`.trim();

      // Find pay scale (try designation first, then cadre)
      const scale = (staff.designation_id ? scaleByDesignation.get(staff.designation_id) : null)
        ?? (staff.cadre_id ? scaleByCadre.get(staff.cadre_id) : null);

      if (!scale) {
        result.skipped++;
        result.errors.push({
          staff_id: staff.staff_id ?? (staff as any).id,
          name,
          reason: 'No pay scale configured for designation/cadre',
        });
        continue;
      }

      const basicPay = Number(scale.basic_pay) || 0;
      if (basicPay <= 0) {
        result.skipped++;
        result.errors.push({ staff_id: (staff as any).id, name, reason: 'Basic pay is 0' });
        continue;
      }

      // Calculate earnings from components
      const earnings: { component_id: string; code: string; amount: number }[] = [];
      let gross = 0;

      for (const comp of earningComponents) {
        let amount = 0;
        if (comp.code === 'BASIC') {
          amount = basicPay;
        } else if (comp.calculation_basis === 'percent_of_basic') {
          amount = Math.round((basicPay * Number(comp.default_amount_or_percent)) / 100);
        } else {
          amount = Number(comp.default_amount_or_percent) || 0;
        }
        if (amount > 0) {
          earnings.push({ component_id: comp.id, code: comp.code, amount });
          gross += amount;
        }
      }

      // LOP adjustment
      const calendarDays = period.total_calendar_days || 30;
      const workingDays = period.working_days_count || calendarDays;
      const lopDays = 0; // T4.4 v1: no LOP integration yet — deferred to attendance linkage
      const attendedDays = workingDays - lopDays;

      const lopAdjustedBasic = basicPay; // No LOP adjustment in v1
      const lopAdjustedGross = gross;

      // Run deduction engine
      const deductions: DeductionResult = computeDeductions(
        { basicPay: lopAdjustedBasic, grossPay: lopAdjustedGross, paymentMode: 'neft' },
        policies,
      );

      const slipId = crypto.randomUUID();

      payslipInserts.push({
        id: slipId,
        period_id: periodId,
        staff_id: (staff as any).id,
        engine_type: period.engine_type,
        basic_pay: basicPay,
        pay_scale_snapshot_id: scale.id,
        working_days_attended: attendedDays,
        lop_days: lopDays,
        gross_amount: lopAdjustedGross,
        total_deductions: deductions.total,
        net_amount: deductions.netPay,
        payment_mode: 'neft',
        correction_type: 'initial',
      });

      // Line items for each earning component
      for (const e of earnings) {
        lineItemInserts.push({
          slip_id: slipId,
          component_id: e.component_id,
          amount: e.amount,
          is_one_off: false,
        });
      }

      result.generated++;
      result.totals.gross += lopAdjustedGross;
      result.totals.deductions += deductions.total;
      result.totals.net += deductions.netPay;
    }

    // 8. Batch insert payslips
    if (payslipInserts.length > 0) {
      const { error: insertErr } = await (supabase as any)
        .from('hr_payslips')
        .insert(payslipInserts);

      if (insertErr) throw new Error(`Failed to insert payslips: ${insertErr.message}`);
    }

    // 9. Batch insert line items
    if (lineItemInserts.length > 0) {
      const { error: lineErr } = await (supabase as any)
        .from('hr_payslip_line_items')
        .insert(lineItemInserts);

      if (lineErr) throw new Error(`Failed to insert line items: ${lineErr.message}`);
    }

    // 10. Update period aggregates
    if (result.generated > 0) {
      await (supabase as any)
        .from('hr_payroll_periods')
        .update({
          total_gross: result.totals.gross,
          total_deductions: result.totals.deductions,
          total_net: result.totals.net,
          staff_count: result.generated,
        })
        .eq('id', periodId);
    }

    return result;
  }

  /**
   * Override a single payslip's deduction amounts (manual adjustment).
   * Creates a new 'adjustment' payslip superseding the original.
   */
  static async overrideDeductions(
    supabase: SupabaseClient,
    slipId: string,
    overrides: { pf?: number; esi?: number; tds?: number; pt?: number },
    reason: string,
  ): Promise<{ newSlipId: string }> {
    if (!reason || reason.trim().length === 0) {
      throw new Error('Manual override requires a reason for audit trail');
    }

    // Load the existing payslip
    const { data: existing, error } = await (supabase as any)
      .from('hr_payslips')
      .select('*')
      .eq('id', slipId)
      .is('superseded_by', null)
      .single();

    if (error || !existing) throw new Error('Payslip not found or already superseded');

    // Recalculate deductions with overrides
    const adjustedPf = overrides.pf ?? existing.total_deductions; // fallback to existing
    const adjustedEsi = overrides.esi ?? 0;
    const adjustedTds = overrides.tds ?? 0;
    const adjustedPt = overrides.pt ?? 0;

    // For a proper override, we need the line-item breakdown.
    // Simplified v1: recalculate total deductions from provided overrides.
    const newTotalDeductions = (overrides.pf ?? 0) + (overrides.esi ?? 0) + (overrides.tds ?? 0) + (overrides.pt ?? 0);
    const newNetAmount = Number(existing.gross_amount) - newTotalDeductions;

    const newSlipId = crypto.randomUUID();

    // Insert the adjustment payslip
    const { error: insertErr } = await (supabase as any)
      .from('hr_payslips')
      .insert({
        id: newSlipId,
        period_id: existing.period_id,
        staff_id: existing.staff_id,
        engine_type: existing.engine_type,
        basic_pay: existing.basic_pay,
        pay_scale_snapshot_id: existing.pay_scale_snapshot_id,
        working_days_attended: existing.working_days_attended,
        lop_days: existing.lop_days,
        gross_amount: existing.gross_amount,
        total_deductions: newTotalDeductions,
        net_amount: newNetAmount,
        payment_mode: existing.payment_mode,
        correction_type: 'adjustment',
        reason,
      });

    if (insertErr) throw new Error(`Failed to create adjustment payslip: ${insertErr.message}`);

    // Supersede the original
    await (supabase as any)
      .from('hr_payslips')
      .update({ superseded_by: newSlipId })
      .eq('id', slipId);

    // Update period aggregates (re-sum from non-superseded payslips)
    const { data: activeSlips } = await (supabase as any)
      .from('hr_payslips')
      .select('gross_amount, total_deductions, net_amount')
      .eq('period_id', existing.period_id)
      .is('superseded_by', null);

    if (activeSlips) {
      const totals = activeSlips.reduce(
        (acc: any, s: any) => ({
          gross: acc.gross + Number(s.gross_amount),
          deductions: acc.deductions + Number(s.total_deductions),
          net: acc.net + Number(s.net_amount),
        }),
        { gross: 0, deductions: 0, net: 0 },
      );

      await (supabase as any)
        .from('hr_payroll_periods')
        .update({
          total_gross: totals.gross,
          total_deductions: totals.deductions,
          total_net: totals.net,
        })
        .eq('id', existing.period_id);
    }

    return { newSlipId };
  }
}
