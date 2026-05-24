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

import { PayslipGenerator } from '@/lib/services/hr/payroll/payslip-generator';

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
    console.error('[hr/payroll/periods/[id]/payslips] POST error', err);
    const status = err instanceof Error && err.message.includes('must be') ? 400 : 500;
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status },
    );
  }
}, { allowApiKey: false, requirePermission: 'hr.payroll.manage' });
