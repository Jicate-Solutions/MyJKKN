/**
 * T4.4 — Payslip Generation Engine
 *
 * Orchestrates payslip generation for a payroll period:
 *   1. Load active staff PAID BY the period's organisation (hr_staff_payroll)
 *   2. Look up each staff member's pay scale (by designation/cadre)
 *   3. Calculate earnings from pay components
 *   4. Apply LOP adjustment
 *   5. Run DeductionEngine for PF/ESI/TDS/PT
 *   6. Insert hr_payslips + hr_payslip_line_items
 *   7. Update period aggregates (total_gross, total_deductions, total_net, staff_count)
 *
 * Design locks (T4.0, 2026-05-24):
 *   - Staff scope: all active staff whose RECORDED PAYER is this organisation.
 *     Revised 2026-07-31: was "all active staff in institution", which read
 *     staff.institution_id — that column now means WHERE SOMEONE WORKS, and a
 *     person's work location is not who bears their salary. No payroll row =
 *     no recorded payer = excluded from every run until HR records one.
 *   - Deductions: auto-calculate with manual override (override is a separate PATCH)
 *   - PDF: deferred to T4.5
 *   - Bank file: deferred (user will share format spec)
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  computeDeductions,
  loadPayrollPolicies,
  type DeductionResult,
} from './deduction-engine';

interface StaffPayInfo {
  id: string;
  first_name: string;
  last_name: string;
  institution_id: string;
}

/**
 * designation_id / cadre_id live on hr_staff_details, NOT on staff.
 * Loaded as a separate lookup (never an `!inner` embed) because a large share of
 * staff rows have no hr_staff_details row at all — those people must still appear
 * in the run and be reported as skipped, not silently dropped.
 */
interface StaffHrMapping {
  designation_id: string | null;
  cadre_id: string | null;
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
   * Generate payslips for every active staff member whose recorded payer is
   * this period's organisation (hr_staff_payroll), not everyone who works there.
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

    // 3. Load the active staff PAID BY this period's organisation.
    //
    // The payer comes from hr_staff_payroll, NOT from staff.institution_id.
    // Since 2026-07-31 staff.institution_id means WHERE SOMEONE WORKS, so
    // reading it here would pay the wrong people the moment a central officer's
    // work location is corrected — the CEO is paid by Engineering but works at
    // Main Office, and correcting that would move them into Main Office's run.
    //
    // Someone with NO hr_staff_payroll row has no recorded payer and is
    // deliberately NOT swept into any run: they surface in the "payer not
    // recorded" queue instead, so HR records the answer rather than a payroll
    // run guessing it. That is the state of everyone whose work location does
    // not run a payroll (the shared campus-services team at Main Office).
    const { data: payerRows, error: payerErr } = await (supabase as any)
      .from('hr_staff_payroll')
      .select('staff_id')
      .eq('hr_organization_id', period.hr_organization_id);

    if (payerErr) throw new Error(`Failed to load payroll assignments: ${payerErr.message}`);

    const payeeIds: string[] = (payerRows ?? []).map((r: { staff_id: string }) => r.staff_id);

    // hr_staff_payroll is gated on hr.payroll.institution.view, so an operator
    // without that key reads ZERO rows and NO error — indistinguishable from
    // "nobody here has a payer recorded yet". Those two demand OPPOSITE actions,
    // so ask directly rather than infer from emptiness. Same reasoning as the
    // hr_staff_details check below; only runs in the degenerate case.
    if (payeeIds.length === 0) {
      const { data: canSeePayroll } = await (supabase as any).rpc('user_has_permission', {
        permission_name: 'hr.payroll.institution.view',
      });
      if (!canSeePayroll) {
        throw new Error(
          'Cannot read payroll organisation assignments: this account is missing hr.payroll.institution.view. Generating here would produce zero payslips and look like an empty organisation. Ask an administrator to grant it.',
        );
      }
      return { generated: 0, skipped: 0, errors: [], totals: { gross: 0, deductions: 0, net: 0 } };
    }

    // Chunked for the same reason as hr_staff_details below: a single `.in()`
    // over a whole organisation can truncate silently, and the `in.(...)` list
    // inflates the query string past what a proxy will accept.
    const STAFF_CHUNK = 100;
    const staffList: StaffPayInfo[] = [];

    for (let i = 0; i < payeeIds.length; i += STAFF_CHUNK) {
      const { data: chunk, error: staffErr } = await supabase
        .from('staff')
        .select('id, first_name, last_name, institution_id')
        .in('id', payeeIds.slice(i, i + STAFF_CHUNK))
        .eq('is_active', true);

      // Abort rather than continue: a partial staff read produces a PARTIAL
      // payroll run that reports success, which is not obvious until somebody
      // is paid twice on the rerun.
      if (staffErr) throw new Error(`Failed to load team members: ${staffErr.message}`);
      staffList.push(...((chunk ?? []) as StaffPayInfo[]));
    }

    if (staffList.length === 0) {
      return { generated: 0, skipped: 0, errors: [], totals: { gross: 0, deductions: 0, net: 0 } };
    }

    // 3b. Load designation/cadre mapping from hr_staff_details (separate query, not an embed).
    //
    // Chunked deliberately. A single `.in()` over a whole institution has two silent
    // failure modes: PostgREST caps the rows it returns, so a big institution would
    // truncate and the missing people would be misreported as "no HR record"; and the
    // `in.(...)` list inflates the query string (156 ids already costs ~5.8KB), which a
    // proxy can reject outright. Chunking removes both without changing the result.
    const staffIds = (staffList as StaffPayInfo[]).map((s) => s.id);
    const HR_DETAILS_CHUNK = 100;
    const hrMappingByStaffId = new Map<string, StaffHrMapping>();

    for (let i = 0; i < staffIds.length; i += HR_DETAILS_CHUNK) {
      const { data: hrDetails, error: hrDetailsErr } = await (supabase as any)
        .from('hr_staff_details')
        .select('staff_id, designation_id, cadre_id')
        .in('staff_id', staffIds.slice(i, i + HR_DETAILS_CHUNK));

      // Abort the whole run if any chunk fails to read. Carrying on would generate
      // payslips for the people whose chunk already loaded and skip everyone after —
      // a PARTIAL payroll run that reports success. A failed run is obvious and
      // recoverable; a partial one is not obvious until somebody is paid twice on the
      // rerun. This is the one place where failing loudly beats degrading.
      if (hrDetailsErr) {
        throw new Error(`Failed to load HR team member details: ${hrDetailsErr.message}`);
      }

      // staff_id is the PRIMARY KEY of hr_staff_details, so one row per person: no
      // last-write-wins ambiguity in this Map.
      for (const d of (hrDetails ?? [])) {
        hrMappingByStaffId.set(d.staff_id, {
          designation_id: d.designation_id ?? null,
          cadre_id: d.cadre_id ?? null,
        });
      }
    }

    // This runs on the caller's RLS-scoped client, and hr_staff_details is tenant-gated
    // by `hr_organization_id = auth_hr_organization_id()`, which reads the caller's row
    // in user_hr_access. An operator without such a row gets ZERO rows and NO error.
    //
    // An empty result is therefore ambiguous — "nobody here has a record yet" and "you
    // are not allowed to see them" look identical — and the two demand OPPOSITE actions.
    // Do not infer which it is from emptiness: a brand-new organisation legitimately has
    // no records, and telling its HR team to stop creating them would dead-end go-live.
    // Ask directly instead. Only runs in the already-degenerate case, so it costs nothing
    // on a normal run.
    let hrDetailsUnreadable = false;
    if (hrMappingByStaffId.size === 0 && staffIds.length > 0) {
      const [{ data: hrOrgId }, { data: isSuperAdmin }] = await Promise.all([
        (supabase as any).rpc('auth_hr_organization_id'),
        (supabase as any).rpc('is_super_admin'),
      ]);
      // A super admin bypasses the policy, so an empty result for them is genuinely empty.
      hrDetailsUnreadable = !isSuperAdmin && !hrOrgId;
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
      const hrMapping = hrMappingByStaffId.get(staff.id);

      // Distinguish the three blockers so HR can work the backlog by reason.
      if (!hrMapping) {
        result.skipped++;
        result.errors.push({
          staff_id: staff.id,
          name,
          // Backing table for this reason is hr_staff_details.
          reason: hrDetailsUnreadable
            ? 'HR records are not visible to this account — grant it HR organisation access, then rerun. Do not create records until then; they may already exist.'
            : 'No HR record for this team member — create one and set designation/cadre',
        });
        continue;
      }

      if (!hrMapping.designation_id && !hrMapping.cadre_id) {
        result.skipped++;
        result.errors.push({
          staff_id: staff.id,
          name,
          reason: 'HR record exists but designation and cadre are both unset',
        });
        continue;
      }

      // Find pay scale (try designation first, then cadre)
      const scale = (hrMapping.designation_id ? scaleByDesignation.get(hrMapping.designation_id) : null)
        ?? (hrMapping.cadre_id ? scaleByCadre.get(hrMapping.cadre_id) : null);

      if (!scale) {
        result.skipped++;
        result.errors.push({
          staff_id: staff.id,
          name,
          reason: 'No pay scale configured for this designation/cadre',
        });
        continue;
      }

      const basicPay = Number(scale.basic_pay) || 0;
      if (basicPay <= 0) {
        result.skipped++;
        result.errors.push({ staff_id: staff.id, name, reason: 'Basic pay is 0' });
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
        staff_id: staff.id,
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
