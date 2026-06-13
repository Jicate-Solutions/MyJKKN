export const dynamic = 'force-dynamic';

/**
 * POST /api/hr/payroll/periods/[id]/reject — reject period to prior stage.
 *
 * Body: { comment: string } — comment is REQUIRED (min 1 char, server validates).
 *
 * Delegates to PayrollPeriodsService.rejectPeriod which calls fn_reject_payroll_period.
 * Role authorization is enforced inside the Postgres RPC.
 */

import { NextResponse, connection } from 'next/server';
import { withAuth } from '@/lib/auth/with-auth';
import { PayrollPeriodsService } from '@/lib/services/hr/payroll/periods-service';

export const POST = withAuth(async (request, auth, context) => {
  await connection();
  try {
    const { id } = await context!.params!;
    const body = await request.json();

    const comment = typeof body.comment === 'string' ? body.comment.trim() : '';
    if (!comment) {
      return NextResponse.json(
        { error: 'comment is required for rejection' },
        { status: 400 },
      );
    }

    const result = await PayrollPeriodsService.rejectPeriod(auth.supabase, id, comment);
    return NextResponse.json({ data: result });
  } catch (err) {
    console.error('[hr/payroll/periods/[id]/reject] POST error', err);
    const pgCode = (err as any)?.code;
    const status = pgCode === '42501' ? 403 : 500;
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status },
    );
  }
}, { allowApiKey: false, requirePermission: 'hr.payroll.manage' });
