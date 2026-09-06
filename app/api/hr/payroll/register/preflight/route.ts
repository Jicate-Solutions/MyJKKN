export const dynamic = 'force-dynamic';

/**
 * GET /api/hr/payroll/register/preflight?organisation=<uuid>&year=&month=
 *
 * Can a register be generated for this payer organisation and month, and if
 * not, exactly why. This is the surface behind the readiness panel — the
 * blockers it returns are rendered verbatim, so they name counts and
 * institutions rather than saying "not ready".
 */

import { NextResponse, connection } from 'next/server';
import { withAuth } from '@/lib/auth/with-auth';
import { SalaryRegisterService } from '@/lib/services/hr/payroll/salary-register-service';

export const GET = withAuth(
  async (request, auth) => {
    await connection();
    try {
      const url = new URL(request.url);
      const hrOrganizationId = url.searchParams.get('organisation');
      const year = Number(url.searchParams.get('year'));
      const month = Number(url.searchParams.get('month'));

      if (!hrOrganizationId) {
        return NextResponse.json({ error: 'organisation is required' }, { status: 400 });
      }
      if (!Number.isInteger(year) || year < 2000 || year > 2100) {
        return NextResponse.json({ error: 'year must be a four-digit year' }, { status: 400 });
      }
      if (!Number.isInteger(month) || month < 1 || month > 12) {
        return NextResponse.json({ error: 'month must be 1-12' }, { status: 400 });
      }

      const result = await SalaryRegisterService.preflight(auth.supabase, {
        hrOrganizationId,
        year,
        month,
      });

      return NextResponse.json(result);
    } catch (err: any) {
      console.error('[Salary Register] preflight error:', err);
      return NextResponse.json(
        { error: err?.message ?? 'Failed to check register readiness' },
        { status: 500 },
      );
    }
  },
  { requirePermission: 'hr.payroll.register.view', requiredPermission: 'read' },
);
