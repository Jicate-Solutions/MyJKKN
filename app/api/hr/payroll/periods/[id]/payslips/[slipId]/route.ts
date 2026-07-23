export const dynamic = 'force-dynamic';

/**
 * GET   /api/hr/payroll/periods/[id]/payslips/[slipId] — single payslip detail
 * PATCH /api/hr/payroll/periods/[id]/payslips/[slipId] — manual deduction override
 */

import { NextResponse, connection } from 'next/server';
import { withAuth } from '@/lib/auth/with-auth';
import { PayslipGenerator } from '@/lib/services/hr/payroll/payslip-generator';

export const GET = withAuth(async (_request, auth, context) => {
  await connection();
  try {
    const { slipId } = await context!.params!;

    const { data, error } = await (auth.supabase as any)
      .from('hr_payslips')
      .select(`
        *,
        staff:staff!inner(id, first_name, last_name, designation),
        line_items:hr_payslip_line_items(id, component_id, amount, is_one_off, notes)
      `)
      .eq('id', slipId)
      .single();

    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'Payslip not found' }, { status: 404 });

    return NextResponse.json({ data });
  } catch (err) {
    console.error('[payslips/[slipId]] GET error', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}, { allowApiKey: false, requirePermission: 'hr.payroll.view' });

export const PATCH = withAuth(async (request, auth, context) => {
  await connection();
  try {
    const { slipId } = await context!.params!;
    const body = await request.json();

    const { pf, esi, tds, pt, reason } = body as {
      pf?: number;
      esi?: number;
      tds?: number;
      pt?: number;
      reason: string;
    };

    if (!reason || reason.trim().length === 0) {
      return NextResponse.json(
        { error: 'Manual override requires a reason' },
        { status: 400 },
      );
    }

    const result = await PayslipGenerator.overrideDeductions(
      auth.supabase,
      slipId,
      { pf, esi, tds, pt },
      reason,
    );

    return NextResponse.json({
      data: result,
      message: 'Deduction override applied — new adjustment payslip created',
    });
  } catch (err) {
    console.error('[payslips/[slipId]] PATCH error', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}, { allowApiKey: false, requirePermission: 'hr.payroll.manage' });
