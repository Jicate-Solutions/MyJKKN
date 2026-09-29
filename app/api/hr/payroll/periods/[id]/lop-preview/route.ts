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
import { PayslipGenerator } from '@/lib/services/hr/payroll/payslip-generator';

export const GET = withAuth(async (_request, auth, context) => {
  await connection();
  try {
    const { id } = await context!.params!;

    const { data: period, error: periodErr } = await auth.supabase
      .from('hr_payroll_periods')
      .select('id, institution_id')
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
    const institutionId = (period as { institution_id: string | null }).institution_id;
    if (institutionId) {
      const { data: hasAccess } = await (auth.supabase as any).rpc(
        'role_has_institution_access',
        { check_institution_id: institutionId },
      );
      if (!hasAccess) {
        return NextResponse.json(
          {
            error:
              'You do not have access to this institution’s payroll. Ask an administrator to grant you access to it, then reload.',
          },
          { status: 403 },
        );
      }
    }

    const preview = await PayslipGenerator.previewLop(auth.supabase, id);

    return NextResponse.json({ data: preview });
  } catch (err) {
    console.error('[hr/payroll/periods/[id]/lop-preview] GET error', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}, { allowApiKey: false, requirePermission: 'hr.payroll.view' });
