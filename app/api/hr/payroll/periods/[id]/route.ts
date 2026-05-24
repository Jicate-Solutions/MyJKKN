export const dynamic = 'force-dynamic';

/**
 * GET   /api/hr/payroll/periods/[id] — single period detail
 * PATCH /api/hr/payroll/periods/[id] — update aggregates (total_gross, etc.)
 *
 * PATCH is used by the payslip-generation step to write back aggregates
 * after computing all payslips. Not a stage transition — use /advance or
 * /reject for workflow actions.
 */

import { NextResponse, connection } from 'next/server';
import { withAuth } from '@/lib/auth/with-auth';
import { PayrollPeriodsService } from '@/lib/services/hr/payroll/periods-service';

// ── GET — single period ─────────────────────────────────────────

export const GET = withAuth(async (_request, auth, context) => {
  await connection();
  try {
    const { id } = await context!.params!;

    const period = await PayrollPeriodsService.getPeriod(auth.supabase, id);
    if (!period) {
      return NextResponse.json({ error: 'Period not found' }, { status: 404 });
    }

    return NextResponse.json({ data: period });
  } catch (err) {
    console.error('[hr/payroll/periods/[id]] GET error', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}, { allowApiKey: false, requirePermission: 'hr.payroll.view' });

// ── PATCH — update period aggregates ────────────────────────────

export const PATCH = withAuth(async (request, auth, context) => {
  await connection();
  try {
    const { id } = await context!.params!;
    const body = await request.json();

    // Only allow aggregate fields — not status (that's via /advance)
    const updatePayload: Record<string, unknown> = {};
    if (body.total_gross !== undefined) updatePayload.total_gross = body.total_gross;
    if (body.total_deductions !== undefined) updatePayload.total_deductions = body.total_deductions;
    if (body.total_net !== undefined) updatePayload.total_net = body.total_net;
    if (body.staff_count !== undefined) updatePayload.staff_count = body.staff_count;

    if (Object.keys(updatePayload).length === 0) {
      return NextResponse.json(
        { error: 'No valid fields to update' },
        { status: 400 },
      );
    }

    const { data, error } = await auth.supabase
      .from('hr_payroll_periods')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ data });
  } catch (err) {
    console.error('[hr/payroll/periods/[id]] PATCH error', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}, { allowApiKey: false, requirePermission: 'hr.payroll.manage' });
