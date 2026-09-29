export const dynamic = 'force-dynamic';

/**
 * GET /api/hr/payroll/periods/[id]/lop-preview
 *
 * What this payroll WOULD pay once absence is taken into account — per person,
 * days absent and the rupee effect — WITHOUT writing anything.
 *
 * READ-ONLY BY CONSTRUCTION. It calls PayslipGenerator.previewLop, which runs
 * the same computation a real run runs and simply never reaches the insert.
 * A preview written as a second, parallel implementation would be worth
 * nothing: the first time the two drifted, the screen a human checked would
 * stop describing the payroll that was actually produced.
 *
 * Works on a period in any status, so the effect of absence can be inspected
 * while the period is still a draft and before anybody presses generate.
 */

import { NextResponse, connection } from 'next/server';
import { withAuth } from '@/lib/auth/with-auth';
import {
  PayslipGenerator,
  type PayrollPeriodRow,
} from '@/lib/services/hr/payroll/payslip-generator';

const NO_ACCESS =
  'You do not have access to this institution’s payroll. Ask an administrator to grant you access to it, then reload.';

export const GET = withAuth(async (_request, auth, context) => {
  await connection();
  try {
    const { id } = await context!.params!;

    // The full row, read once and handed to the preview, so the period is not
    // fetched a second time inside previewLop.
    const { data: period, error: periodErr } = await (auth.supabase as any)
      .from('hr_payroll_periods')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (periodErr) throw periodErr;
    if (!period) {
      return NextResponse.json({ error: 'Period not found' }, { status: 404 });
    }

    // Institution scope, stated out loud. RLS on hr_payroll_periods already
    // narrows the read, but an operator who can see a period for one college
    // must not preview the pay of another's, and a refusal must SAY SO rather
    // than bounce somewhere quiet where nobody can tell what happened.
    //
    // An EMPTY institution is refused, not waved through. The column is NOT
    // NULL today, but a check that skips itself on a missing value is a check
    // that stops working the day the schema changes.
    const institutionId = (period as PayrollPeriodRow).institution_id;
    if (!institutionId) {
      return NextResponse.json({ error: NO_ACCESS }, { status: 403 });
    }
    const { data: hasAccess } = await (auth.supabase as any).rpc(
      'role_has_institution_access',
      { check_institution_id: institutionId },
    );
    if (!hasAccess) {
      return NextResponse.json({ error: NO_ACCESS }, { status: 403 });
    }

    const preview = await PayslipGenerator.previewLop(
      auth.supabase,
      period as PayrollPeriodRow,
    );

    return NextResponse.json({ data: preview });
  } catch (err) {
    console.error('[hr/payroll/periods/[id]/lop-preview] GET error', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}, { allowApiKey: false, requirePermission: 'hr.payroll.view' });
