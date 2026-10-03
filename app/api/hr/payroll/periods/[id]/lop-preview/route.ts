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
 *
 * WHO MAY CALL IT — the same people who can open the page. Every payroll page
 * under /hr/admin/payroll is SuperAdminOnly, while the payroll period APIs
 * carry requirePermission 'hr.payroll.view'. That key is the MyJKKN triad
 * (is_super_admin OR is_admin OR the key), so on its own it would hand every
 * person's pay and deductions to an admin or an HR role who cannot even open
 * the screen. The key stays, for consistency with the sibling routes, and the
 * handler also asks is_super_admin() itself before reading anything — the
 * same pattern the salary register's DELETE uses. The API is therefore never
 * wider than the page.
 *
 * A refusal for a missing permission is a 403 with the reason in plain words;
 * 500 is kept for real faults.
 */

import { NextResponse, connection } from 'next/server';
import { withAuth } from '@/lib/auth/with-auth';
import {
  PayslipGenerator,
  PayrollPermissionError,
  type PayrollPeriodRow,
} from '@/lib/services/hr/payroll/payslip-generator';

const NOT_SUPER_ADMIN =
  'This preview shows each person’s pay and deductions, so it is open only to platform administrators — the same people who can open the payroll screens. Ask a platform administrator to check this month for you.';

const NO_ACCESS =
  'You do not have access to this institution’s payroll. Ask an administrator to grant you access to it, then reload.';

export const GET = withAuth(async (_request, auth, context) => {
  await connection();
  try {
    const { id } = await context!.params!;

    // Fails closed: an error from the check is a refusal, not a pass.
    const { data: isSuperAdmin, error: gateErr } = await (auth.supabase as any).rpc(
      'is_super_admin',
    );
    if (gateErr || isSuperAdmin !== true) {
      return NextResponse.json({ error: NOT_SUPER_ADMIN }, { status: 403 });
    }

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
    // The account lacks a permission the computation needs. That is a refusal
    // to explain, not a fault to page anybody about.
    if (err instanceof PayrollPermissionError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[hr/payroll/periods/[id]/lop-preview] GET error', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}, { allowApiKey: false, requirePermission: 'hr.payroll.view' });
