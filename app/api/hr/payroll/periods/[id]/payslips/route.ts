export const dynamic = 'force-dynamic';

/**
 * GET  /api/hr/payroll/periods/[id]/payslips — list payslips for a period
 * POST /api/hr/payroll/periods/[id]/payslips — generate payslips (stub for T4.4+)
 *
 * GET returns all non-superseded payslips for the period, joined to staff
 * for display name. Sorted by staff name ascending.
 *
 * POST is a placeholder — full payslip generation (deduction engine loop over
 * all staff in the institution) ships with T4.4. For now it validates the
 * period exists and is in 'prepared' or later status.
 */

import { NextResponse, connection } from 'next/server';
import { withAuth } from '@/lib/auth/with-auth';

// ── GET — list payslips for a period ────────────────────────────

export const GET = withAuth(async (_request, auth, context) => {
  await connection();
  try {
    const { id } = await context!.params!;

    // Verify period exists (RLS enforces read access)
    const { data: period, error: periodErr } = await auth.supabase
      .from('hr_payroll_periods')
      .select('id, status')
      .eq('id', id)
      .maybeSingle();

    if (periodErr) throw periodErr;
    if (!period) {
      return NextResponse.json({ error: 'Period not found' }, { status: 404 });
    }

    // Fetch non-superseded payslips, join to staff for name
    const { data: payslips, error, count } = await auth.supabase
      .from('hr_payslips')
      .select(
        `
        id,
        period_id,
        staff_id,
        engine_type,
        basic_pay,
        working_days_attended,
        lop_days,
        gross_amount,
        total_deductions,
        net_amount,
        allowance_paid,
        pf_deduction,
        esi_deduction,
        tds_deduction,
        pt_deduction,
        payment_mode,
        correction_type,
        reason,
        created_at,
        staff:staff!inner(id, first_name, last_name, designation)
        `,
        { count: 'exact' },
      )
      .eq('period_id', id)
      .is('superseded_by', null)
      .order('created_at', { ascending: true });

    if (error) throw error;

    return NextResponse.json({
      data: payslips ?? [],
      metadata: { total: count ?? 0 },
    });
  } catch (err) {
    console.error('[hr/payroll/periods/[id]/payslips] GET error', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}, { allowApiKey: false, requirePermission: 'hr.payroll.view' });

// ── POST — generate payslips (T4.4) ───────────────────────────

import {
  PayrollPermissionError,
  PayslipGenerator,
  PayslipRunConflict,
} from '@/lib/services/hr/payroll/payslip-generator';

/**
 * Needs hr.payroll.manage to reach, and — since payslips take pay from
 * hr_staff_salaries (2026-09-30) — hr.payroll.salary.view (or super admin) to
 * run; hr.payroll.institution.view and hr.attendance.period.view as before. A
 * missing one is a 403 with the message as written, not a 500.
 *
 * A period that already has payslips — including one made by a second press a
 * moment ago, which the database refuses (uq_hr_payslips_one_current) — is a
 * 409: "This period already has N payslips", never a 500.
 *
 * The response carries the run's warnings and the people left off; they are
 * also kept on the period (hr_payroll_periods.generation_notes).
 */
export const POST = withAuth(async (_request, auth, context) => {
  await connection();
  try {
    const { id } = await context!.params!;

    const result = await PayslipGenerator.generate(auth.supabase, id);

    return NextResponse.json({
      data: result,
      message: result.generated > 0
        ? `Generated ${result.generated} payslips (${result.skipped} skipped)`
        : result.errors.length > 0
          ? 'No payslips generated — check errors'
          : 'No active staff found for this institution',
    });
  } catch (err) {
    if (err instanceof PayrollPermissionError || err instanceof PayslipRunConflict) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[hr/payroll/periods/[id]/payslips] POST error', err);
    const status = err instanceof Error && err.message.includes('must be') ? 400 : 500;
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status },
    );
  }
}, { allowApiKey: false, requirePermission: 'hr.payroll.manage' });
