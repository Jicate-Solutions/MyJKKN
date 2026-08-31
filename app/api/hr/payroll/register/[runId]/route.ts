export const dynamic = 'force-dynamic';

/**
 * GET /api/hr/payroll/register/[runId]
 *
 * One frozen register with all of its rows, included and excluded.
 */

import { NextResponse, connection } from 'next/server';
import { withAuth } from '@/lib/auth/with-auth';
import { SalaryRegisterService } from '@/lib/services/hr/payroll/salary-register-service';

export const GET = withAuth(
  async (_request, auth, context) => {
    await connection();
    try {
      const params = await context?.params;
      const runId = params?.runId;
      if (!runId) {
        return NextResponse.json({ error: 'runId is required' }, { status: 400 });
      }

      const detail = await SalaryRegisterService.getRunDetail(auth.supabase, runId);
      return NextResponse.json(detail);
    } catch (err: any) {
      console.error('[Salary Register] detail error:', err);
      return NextResponse.json(
        { error: err?.message ?? 'Failed to load the register' },
        { status: 500 },
      );
    }
  },
  { requirePermission: 'hr.payroll.register.view', requiredPermission: 'read' },
);
