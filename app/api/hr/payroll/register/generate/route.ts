export const dynamic = 'force-dynamic';

/**
 * POST /api/hr/payroll/register/generate
 * Body: { organisation: uuid, year: number, month: number }
 *
 * Freezes a register for one payer-organisation month, superseding any earlier
 * live run for the same month.
 *
 * The readiness check runs again HERE, server-side, rather than trusting the
 * page's verdict: a tab left open across a month being reopened would otherwise
 * generate against day counts that have started moving again.
 *
 * GET /api/hr/payroll/register/generate?organisation=&year=  — lists runs.
 */

import { NextResponse, connection } from 'next/server';
import { withAuth } from '@/lib/auth/with-auth';
import { SalaryRegisterService } from '@/lib/services/hr/payroll/salary-register-service';

export const POST = withAuth(
  async (request, auth) => {
    await connection();
    try {
      const body = await request.json().catch(() => null);
      if (!body) {
        return NextResponse.json({ error: 'A JSON body is required' }, { status: 400 });
      }

      const hrOrganizationId: string | undefined = body.organisation;
      const year = Number(body.year);
      const month = Number(body.month);

      if (!hrOrganizationId) {
        return NextResponse.json({ error: 'organisation is required' }, { status: 400 });
      }
      if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
        return NextResponse.json({ error: 'A valid year and month (1-12) are required' }, { status: 400 });
      }

      const result = await SalaryRegisterService.generate(auth.supabase, {
        hrOrganizationId,
        year,
        month,
      });

      return NextResponse.json({ success: true, ...result });
    } catch (err: any) {
      console.error('[Salary Register] generate error:', err);
      // 422, not 500: a refusal to generate over an open month or an empty
      // roster is the expected answer to a valid request, and the message is
      // shown to the user verbatim.
      return NextResponse.json(
        { error: err?.message ?? 'Failed to generate the register' },
        { status: 422 },
      );
    }
  },
  { requirePermission: 'hr.payroll.register.manage', requiredPermission: 'write' },
);

export const GET = withAuth(
  async (request, auth) => {
    await connection();
    try {
      const url = new URL(request.url);
      const organisation = url.searchParams.get('organisation') ?? undefined;
      const yearParam = url.searchParams.get('year');
      const includeSuperseded = url.searchParams.get('include_superseded') === 'true';

      const runs = await SalaryRegisterService.listRuns(auth.supabase, {
        hrOrganizationId: organisation,
        year: yearParam ? Number(yearParam) : undefined,
        includeSuperseded,
      });

      return NextResponse.json({ runs });
    } catch (err: any) {
      console.error('[Salary Register] list error:', err);
      return NextResponse.json(
        { error: err?.message ?? 'Failed to load registers' },
        { status: 500 },
      );
    }
  },
  { requirePermission: 'hr.payroll.register.view', requiredPermission: 'read' },
);
