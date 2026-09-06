export const dynamic = 'force-dynamic';

/**
 * GET /api/hr/payroll/register/[runId]/export
 *
 * Streams the register as the two-sheet workbook HR already keeps by hand
 * (three sheets when somebody was excluded).
 *
 * Gated on register.VIEW rather than manage: exporting reads a register that
 * already exists and changes nothing. Generating it is the privileged act.
 */

import { NextResponse, connection } from 'next/server';
import { withAuth } from '@/lib/auth/with-auth';
import { SalaryRegisterService } from '@/lib/services/hr/payroll/salary-register-service';
import {
  buildSalaryRegisterWorkbook,
  salaryRegisterFilename,
} from '@/lib/services/hr/payroll/salary-register-workbook';

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

      const buffer = await buildSalaryRegisterWorkbook({
        run: detail.run,
        lines: detail.lines,
        // The PAYING institution names the file and heads the sheet — that is
        // whose register it is, even when some of its people work elsewhere.
        institutionName: detail.organisation_name,
      });

      const filename = salaryRegisterFilename(
        detail.organisation_name,
        detail.run.period_year,
        detail.run.period_month,
      );

      return new NextResponse(new Uint8Array(buffer), {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          // RFC 5987 filename* as well as filename: the institution names carry
          // spaces and parentheses ("JKKN College of Arts and Science (Self)").
          'Content-Disposition': `attachment; filename="${filename.replace(/"/g, '')}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
          'Cache-Control': 'no-store',
        },
      });
    } catch (err: any) {
      console.error('[Salary Register] export error:', err);
      return NextResponse.json(
        { error: err?.message ?? 'Failed to export the register' },
        { status: 500 },
      );
    }
  },
  { requirePermission: 'hr.payroll.register.view', requiredPermission: 'read' },
);
