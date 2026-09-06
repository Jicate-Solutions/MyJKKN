export const dynamic = 'force-dynamic';

/**
 * POST /api/hr/payroll/periods/[id]/advance — advance period to next stage.
 *
 * Body: { comment?: string }
 *
 * For draft → prepared, delegates to preparePeriod (which snapshots pay matrix
 * and deduction rates). For all other stages, delegates to advancePeriod.
 * Role authorization is enforced inside the Postgres RPCs.
 */

import { NextResponse, connection } from 'next/server';
import { withAuth } from '@/lib/auth/with-auth';
import { PayrollPeriodsService } from '@/lib/services/hr/payroll/periods-service';

export const POST = withAuth(async (request, auth, context) => {
  await connection();
  try {
    const { id } = await context!.params!;
    const body = await request.json().catch(() => ({}));
    const comment = typeof body.comment === 'string' ? body.comment : undefined;

    // Determine current status to pick the right RPC
    const period = await PayrollPeriodsService.getPeriod(auth.supabase, id);
    if (!period) {
      return NextResponse.json({ error: 'Period not found' }, { status: 404 });
    }

    let result;
    if (period.status === 'draft') {
      result = await PayrollPeriodsService.preparePeriod(auth.supabase, id, comment);
    } else {
      result = await PayrollPeriodsService.advancePeriod(auth.supabase, id, comment);
    }

    return NextResponse.json({ data: result });
  } catch (err) {
    console.error('[hr/payroll/periods/[id]/advance] POST error', err);
    // Postgres 42501 = insufficient privileges
    const pgCode = (err as any)?.code;
    const status = pgCode === '42501' ? 403 : 500;
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status },
    );
  }
}, { allowApiKey: false, requirePermission: 'hr.payroll.manage' });
